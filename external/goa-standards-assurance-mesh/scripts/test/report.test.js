'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { buildReport, serializeReport } = require('../lib/report');
const { sign, verify } = require('../lib/sign');

function baseInput(overrides = {}) {
  return {
    repositoryFullName: 'goa/permits-api',
    commitSha: 'abc123',
    prNumber: 42,
    baseBranch: 'main',
    prState: 'open',
    trigger: 'pull_request',
    packVersion: '2026.3',
    verdicts: { green: 'pass', yellow: 'pass', red: 'pass', blue: 'pass' },
    findings: [],
    baselineFingerprints: [],
    asvsPassed: 280,
    albertaPassed: 60,
    reportUrl: 'https://example.blob.core.windows.net/report.json',
    receivedAt: '2026-09-25T00:00:00.000Z',
    ...overrides,
  };
}

test('buildReport() matches the mesh_runs shape (data-model.md §2)', () => {
  const { report } = buildReport(baseInput());

  assert.equal(report.repository, 'goa/permits-api');
  assert.equal(report.commit_sha, 'abc123');
  assert.equal(report.pr_number, 42);
  assert.equal(report.base_branch, 'main');
  assert.equal(report.pr_state, 'open');
  assert.equal(report.trigger, 'pull_request');
  assert.equal(report.pack_version, '2026.3');
  assert.deepEqual(report.verdicts, { green: 'pass', yellow: 'pass', red: 'pass', blue: 'pass' });
  assert.equal(report.asvs_passed, 280);
  assert.equal(report.alberta_passed, 60);
  assert.equal(report.report_url, 'https://example.blob.core.windows.net/report.json');
  assert.equal(report.received_at, '2026-09-25T00:00:00.000Z');
  assert.equal(report.new_findings, 0);
  assert.deepEqual(report.findings, []);
});

test('buildReport() computes new_findings against the baseline ratchet (D-11)', () => {
  const findings = [
    { agent: 'yellow', rule: 'rule-1', file: 'a.ts', location: 'L1' },
    { agent: 'yellow', rule: 'rule-2', file: 'b.ts', location: 'L2' },
  ];
  const { fingerprint } = require('../lib/fingerprint');
  const baselineFp = fingerprint(findings[0]);

  const { report, newFindings } = buildReport(baseInput({ findings, baselineFingerprints: [baselineFp] }));

  assert.equal(report.new_findings, 1);
  assert.equal(newFindings.length, 1);
  assert.equal(newFindings[0].rule, 'rule-2');
  assert.equal(report.findings.length, 2, 'the full findings list is still reported, not just the new ones');
});

test('buildReport() validates required fields and verdict enum', () => {
  assert.throws(() => buildReport(baseInput({ repositoryFullName: undefined })), /repositoryFullName/);
  assert.throws(() => buildReport(baseInput({ prState: 'bogus' })), /prState/);
  assert.throws(() => buildReport(baseInput({ trigger: 'bogus' })), /trigger/);
  assert.throws(() => buildReport(baseInput({ verdicts: { green: 'bogus', yellow: 'pass', red: 'pass', blue: 'pass' } })), /verdicts\.green/);
});

test('serializeReport() output can be signed and verified end-to-end', () => {
  const { report } = buildReport(baseInput());
  const rawBody = serializeReport(report);
  const secret = 'repo-secret';

  const header = sign(rawBody, secret);
  assert.equal(verify(rawBody, secret, header), true);

  // Re-parsing must round-trip (the exact bytes sent must be what was signed).
  assert.deepEqual(JSON.parse(rawBody), report);
});
