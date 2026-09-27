#!/usr/bin/env node
'use strict';

/*
 * Shared CLI used by both the GitHub Actions workflow (.github/workflows/mesh.yml)
 * and the Azure Pipelines template (templates/mesh.yml) for the "report" stage:
 *
 *   1. Read each agent's result file (green/yellow/red/blue), a small JSON
 *      contract each stage writes: { "verdict": "pass|warn|fail|skip", "findings": [...] }
 *   2. Assemble the report JSON matching `mesh_runs` (data-model.md §2).
 *   3. Sign it (HMAC-SHA256 of the raw body) and POST it to
 *      `<api>/api/v1/mesh/runs` with header `X-Pronghorn-Signature: sha256=<hex>`.
 *   4. Apply the policy outcome per check (issue|notify|block|off, D-15) using
 *      the NEW-findings counts returned by the API (it owns the baseline
 *      ratchet, mesh_baselines) -- or, offline/dry-run, a local approximation.
 *
 * Exit code: non-zero only when a check in "block" mode has new findings, or
 * when a required step fails outright (never for warn/pass/skip).
 */

const fs = require('node:fs');
const path = require('node:path');

const { buildReport, serializeReport } = require('./lib/report');
const { postReport } = require('./lib/post');
const { evaluatePolicy } = require('./lib/policy');
const { resolveRepositoryFullName } = require('./lib/repository');

function parseArgs(argv) {
  const args = { policy: {} };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2);
    const value = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : 'true';
    args[key] = value;
  }
  return args;
}

function readAgentResult(filePath, agent) {
  if (!filePath || !fs.existsSync(filePath)) {
    return { verdict: 'skip', findings: [] };
  }
  const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const findings = (raw.findings || []).map((f) => ({ agent, ...f }));
  return { verdict: raw.verdict || 'skip', findings };
}

function readPolicyFile(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return {};
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

async function main(argv) {
  const args = parseArgs(argv);

  const green = readAgentResult(args.green, 'green');
  const yellow = readAgentResult(args.yellow, 'yellow');
  const red = readAgentResult(args.red, 'red');
  const blue = readAgentResult(args.blue, 'blue');

  const allFindings = [...green.findings, ...yellow.findings, ...red.findings, ...blue.findings];

  const { report } = buildReport({
    // Canonical Pronghorn full_name (see lib/repository.js): "<owner>/<repo>"
    // for GitHub, "<adoOrg>/<project>/<repo>" for Azure Repos.
    repositoryFullName: resolveRepositoryFullName(args),
    commitSha: args.commit,
    prNumber: args['pr-number'] && args['pr-number'] !== 'true' ? Number(args['pr-number']) : null,
    baseBranch: args['base-branch'],
    prState: args['pr-state'] || 'open',
    trigger: args.trigger || 'pull_request',
    packVersion: args['pack-version'],
    verdicts: { green: green.verdict, yellow: yellow.verdict, red: red.verdict, blue: blue.verdict },
    findings: allFindings,
    baselineFingerprints: [], // the API owns mesh_baselines; this is a local, non-authoritative view
    asvsPassed: args['asvs-passed'] ? Number(args['asvs-passed']) : null,
    albertaPassed: args['alberta-passed'] ? Number(args['alberta-passed']) : null,
    reportUrl: args['report-url'] || '',
  });

  const rawBody = serializeReport(report);

  if (args.output) {
    fs.mkdirSync(path.dirname(args.output), { recursive: true });
    fs.writeFileSync(args.output, rawBody);
  }

  const policy = readPolicyFile(args['policy-file']);

  const secretEnvVar = args['secret-env'] || 'PRONGHORN_REPORT_SECRET';
  const secret = process.env[secretEnvVar];
  const apiUrl = args['api-url'] || process.env.PRONGHORN_API_URL;

  // Naive local approximation, used only if the API is unreachable in
  // --dry-run mode. Real "new findings" always come from the API response,
  // since only it knows this repository's baseline (mesh_baselines).
  let newFindingsByAgent = {
    green: green.findings.length,
    yellow: yellow.findings.length,
    red: red.findings.length,
    blue: blue.findings.length,
  };

  let apiResponse = null;
  if (args['dry-run'] === 'true') {
    console.log('[mesh] --dry-run: skipping POST to the Pronghorn API');
  } else {
    if (!secret) {
      console.error(`[mesh] Missing secret in env var ${secretEnvVar}`);
      process.exit(1);
    }
    if (!apiUrl) {
      console.error('[mesh] Missing --api-url (or PRONGHORN_API_URL)');
      process.exit(1);
    }
    try {
      const result = await postReport(apiUrl, rawBody, secret);
      if (result.status < 200 || result.status >= 300) {
        console.error(`[mesh] Report POST failed: HTTP ${result.status} ${result.body}`);
        process.exit(1);
      }
      apiResponse = JSON.parse(result.body || '{}');
      if (apiResponse.new_findings_by_agent) {
        newFindingsByAgent = apiResponse.new_findings_by_agent;
      }
      console.log(`[mesh] Report accepted: run ${apiResponse.run_id || '(unknown)'}`);
    } catch (err) {
      console.error(`[mesh] Report POST error: ${err.message}`);
      process.exit(1);
    }
  }

  const evaluation = evaluatePolicy(report.verdicts, newFindingsByAgent, policy);

  console.log(`[mesh] Verdicts: ${JSON.stringify(report.verdicts)}`);
  console.log(`[mesh] New findings by agent: ${JSON.stringify(newFindingsByAgent)}`);
  for (const agent of ['green', 'yellow', 'red', 'blue']) {
    const a = evaluation.perAgent[agent];
    console.log(`[mesh]   ${agent}: mode=${a.mode} newFindings=${a.newFindings} -> issue=${a.openIssue} notify=${a.notify} block=${a.block}`);
  }

  if (args['policy-output']) {
    fs.mkdirSync(path.dirname(args['policy-output']), { recursive: true });
    fs.writeFileSync(args['policy-output'], JSON.stringify(evaluation, null, 2));
  }

  if (evaluation.shouldBlockJob) {
    console.error(`[mesh] Blocking: new findings in ${evaluation.agentsToBlock.join(', ')} with policy mode "block"`);
    process.exit(1);
  }

  process.exit(0);
}

if (require.main === module) {
  main(process.argv.slice(2)).catch((err) => {
    console.error(`[mesh] Unexpected error: ${err.stack || err.message}`);
    process.exit(1);
  });
}

module.exports = { main, parseArgs, readAgentResult };
