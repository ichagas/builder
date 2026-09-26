'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { parseArgs, readAgentResult } = require('../report-cli');

test('parseArgs() parses --flag value pairs and boolean flags', () => {
  const args = parseArgs(['--repository', 'goa/permits-api', '--dry-run', 'true', '--pr-number', '42']);
  assert.equal(args.repository, 'goa/permits-api');
  assert.equal(args['dry-run'], 'true');
  assert.equal(args['pr-number'], '42');
});

test('readAgentResult() defaults to skip/empty when the file is missing', () => {
  const result = readAgentResult(path.join(os.tmpdir(), 'does-not-exist-mesh-test.json'), 'red');
  assert.deepEqual(result, { verdict: 'skip', findings: [] });
});

test('readAgentResult() tags each finding with its agent', () => {
  const file = path.join(os.tmpdir(), `mesh-test-${Date.now()}.json`);
  fs.writeFileSync(file, JSON.stringify({ verdict: 'fail', findings: [{ rule: 'r1', file: 'a.ts', location: 'L1' }] }));

  const result = readAgentResult(file, 'yellow');

  assert.equal(result.verdict, 'fail');
  assert.equal(result.findings.length, 1);
  assert.equal(result.findings[0].agent, 'yellow');
  assert.equal(result.findings[0].rule, 'r1');

  fs.unlinkSync(file);
});
