'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { fingerprint, partitionByBaseline } = require('../lib/fingerprint');

test('fingerprint() is stable for the same (agent, rule, file, location)', () => {
  const a = fingerprint({ agent: 'green', rule: 'no-hardcoded-secrets', file: 'src/db.ts', location: 'L12' });
  const b = fingerprint({ agent: 'green', rule: 'no-hardcoded-secrets', file: 'src/db.ts', location: 'L12' });
  assert.equal(a, b);
  assert.match(a, /^[0-9a-f]{64}$/);
});

test('fingerprint() is case-insensitive on its inputs', () => {
  const a = fingerprint({ agent: 'Green', rule: 'No-Hardcoded-Secrets', file: 'SRC/DB.TS', location: 'l12' });
  const b = fingerprint({ agent: 'green', rule: 'no-hardcoded-secrets', file: 'src/db.ts', location: 'L12' });
  assert.equal(a, b);
});

test('fingerprint() differs when any of the four fields differ', () => {
  const base = { agent: 'red', rule: 'open-recon-port', file: 'infra/main.tf', location: 'L5' };
  const fp0 = fingerprint(base);
  assert.notEqual(fp0, fingerprint({ ...base, agent: 'blue' }));
  assert.notEqual(fp0, fingerprint({ ...base, rule: 'other-rule' }));
  assert.notEqual(fp0, fingerprint({ ...base, file: 'infra/other.tf' }));
  assert.notEqual(fp0, fingerprint({ ...base, location: 'L6' }));
});

test('fingerprint() requires agent and rule', () => {
  assert.throws(() => fingerprint({ rule: 'x' }), TypeError);
  assert.throws(() => fingerprint({ agent: 'x' }), TypeError);
});

test('partitionByBaseline() separates new findings from known (baselined) ones', () => {
  const known = fingerprint({ agent: 'yellow', rule: 'rule-1', file: 'a.ts', location: 'L1' });
  const findings = [
    { agent: 'yellow', rule: 'rule-1', file: 'a.ts', location: 'L1' }, // already baselined
    { agent: 'yellow', rule: 'rule-2', file: 'b.ts', location: 'L2' }, // new
  ];

  const { newFindings, knownFindings, allFindings } = partitionByBaseline(findings, [known]);

  assert.equal(allFindings.length, 2);
  assert.equal(knownFindings.length, 1);
  assert.equal(newFindings.length, 1);
  assert.equal(newFindings[0].rule, 'rule-2');
  assert.ok(allFindings.every((f) => typeof f.fingerprint === 'string'));
});

test('partitionByBaseline() accepts a Set or an array of fingerprints', () => {
  const fp = fingerprint({ agent: 'green', rule: 'r', file: 'f', location: 'l' });
  const findings = [{ agent: 'green', rule: 'r', file: 'f', location: 'l' }];

  const asArray = partitionByBaseline(findings, [fp]);
  const asSet = partitionByBaseline(findings, new Set([fp]));

  assert.equal(asArray.newFindings.length, 0);
  assert.equal(asSet.newFindings.length, 0);
});
