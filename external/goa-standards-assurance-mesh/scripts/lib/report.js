'use strict';

const { partitionByBaseline } = require('./fingerprint');

const VERDICTS = new Set(['pass', 'warn', 'fail', 'skip']);
const AGENTS = ['green', 'yellow', 'red', 'blue'];
const TRIGGERS = new Set(['pull_request', 'manual', 'baseline']);
const PR_STATES = new Set(['open', 'merged', 'closed']);

/**
 * Build the report JSON matching `mesh_runs` (data-model.md §2) plus the
 * `findings` array the ingest API uses to update `mesh_baselines`.
 *
 * @param {object} input
 * @param {string} input.repositoryFullName - e.g. "goa/permits-api" (the API resolves this to repository_id)
 * @param {string} input.commitSha
 * @param {number|null} input.prNumber
 * @param {string} input.baseBranch
 * @param {'open'|'merged'|'closed'} input.prState
 * @param {'pull_request'|'manual'|'baseline'} input.trigger
 * @param {string} input.packVersion
 * @param {{green:string,yellow:string,red:string,blue:string}} input.verdicts
 * @param {Array<{agent:string, rule:string, file?:string, location?:string, severity?:string, message?:string}>} input.findings
 * @param {Array<string>} input.baselineFingerprints - fingerprints already known for this repository
 * @param {number|null} input.asvsPassed - out of 285
 * @param {number|null} input.albertaPassed - out of 62
 * @param {string} input.reportUrl - blob URL of the full evidence
 * @param {string} [input.receivedAt] - ISO timestamp; defaults to now
 */
function buildReport(input) {
  const errors = [];
  if (!input || typeof input !== 'object') throw new TypeError('buildReport() requires an input object');

  const {
    repositoryFullName,
    commitSha,
    prNumber = null,
    baseBranch,
    prState,
    trigger,
    packVersion,
    verdicts,
    findings = [],
    baselineFingerprints = [],
    asvsPassed = null,
    albertaPassed = null,
    reportUrl,
    receivedAt,
  } = input;

  if (!repositoryFullName) errors.push('repositoryFullName is required');
  if (!commitSha) errors.push('commitSha is required');
  if (!baseBranch) errors.push('baseBranch is required');
  if (!PR_STATES.has(prState)) errors.push(`prState must be one of ${[...PR_STATES].join(', ')}`);
  if (!TRIGGERS.has(trigger)) errors.push(`trigger must be one of ${[...TRIGGERS].join(', ')}`);
  if (!packVersion) errors.push('packVersion is required');
  if (!verdicts || typeof verdicts !== 'object') {
    errors.push('verdicts is required');
  } else {
    for (const agent of AGENTS) {
      if (!VERDICTS.has(verdicts[agent])) {
        errors.push(`verdicts.${agent} must be one of ${[...VERDICTS].join(', ')}`);
      }
    }
  }
  if (!reportUrl) errors.push('reportUrl is required');

  if (errors.length) {
    throw new Error(`buildReport() invalid input:\n  - ${errors.join('\n  - ')}`);
  }

  const { newFindings, allFindings } = partitionByBaseline(findings, baselineFingerprints);

  const report = {
    repository: repositoryFullName,
    commit_sha: commitSha,
    pr_number: prNumber,
    base_branch: baseBranch,
    pr_state: prState,
    trigger,
    pack_version: packVersion,
    verdicts: {
      green: verdicts.green,
      yellow: verdicts.yellow,
      red: verdicts.red,
      blue: verdicts.blue,
    },
    findings: allFindings,
    new_findings: newFindings.length,
    asvs_passed: asvsPassed,
    alberta_passed: albertaPassed,
    report_url: reportUrl,
    received_at: receivedAt || new Date().toISOString(),
  };

  return { report, newFindings };
}

/**
 * Serialize deterministically (stable key order) so the signature computed
 * before sending matches byte-for-byte what `JSON.stringify` on the wire
 * produces when reused verbatim as the request body.
 */
function serializeReport(report) {
  return JSON.stringify(report);
}

module.exports = { buildReport, serializeReport, AGENTS, VERDICTS };
