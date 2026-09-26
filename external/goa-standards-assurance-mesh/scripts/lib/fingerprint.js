'use strict';

const crypto = require('node:crypto');

/**
 * Fingerprint a finding for the baseline ratchet (data-model.md `mesh_baselines`):
 * unique per (agent, rule, file, location). Stable across runs so the same
 * pre-existing finding is recognized as "baseline" rather than "new".
 *
 * @param {{agent: string, rule: string, file?: string, location?: string}} finding
 * @returns {string} lowercase hex sha256
 */
function fingerprint(finding) {
  if (!finding || !finding.agent || !finding.rule) {
    throw new TypeError('fingerprint() requires at least { agent, rule }');
  }
  const parts = [
    String(finding.agent).trim().toLowerCase(),
    String(finding.rule).trim().toLowerCase(),
    String(finding.file || '').trim().toLowerCase(),
    String(finding.location || '').trim().toLowerCase(),
  ];
  return crypto.createHash('sha256').update(parts.join('|'), 'utf8').digest('hex');
}

/**
 * Split findings into new (not in the baseline set) and known (already baselined).
 * The mesh policy only acts on new findings (research.md D-11).
 *
 * @param {Array<object>} findings - findings with {agent, rule, file, location, ...}
 * @param {Set<string>|Array<string>} baselineFingerprints - fingerprints already recorded
 */
function partitionByBaseline(findings, baselineFingerprints) {
  const baseline = baselineFingerprints instanceof Set
    ? baselineFingerprints
    : new Set(baselineFingerprints || []);

  const withFingerprints = (findings || []).map((f) => ({
    ...f,
    fingerprint: f.fingerprint || fingerprint(f),
  }));

  const newFindings = withFingerprints.filter((f) => !baseline.has(f.fingerprint));
  const knownFindings = withFingerprints.filter((f) => baseline.has(f.fingerprint));

  return { newFindings, knownFindings, allFindings: withFingerprints };
}

module.exports = { fingerprint, partitionByBaseline };
