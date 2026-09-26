'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { evaluatePolicy } = require('../lib/policy');

const verdicts = { green: 'pass', yellow: 'fail', red: 'pass', blue: 'fail' };

test('default policy (no mode configured) is "issue" and only fires on new findings', () => {
  const result = evaluatePolicy(verdicts, { green: 0, yellow: 2, red: 0, blue: 0 }, {});

  assert.equal(result.perAgent.green.openIssue, false);
  assert.equal(result.perAgent.yellow.openIssue, true);
  assert.equal(result.perAgent.yellow.notify, true);
  assert.equal(result.perAgent.yellow.block, false);
  assert.equal(result.shouldBlockJob, false);
  assert.deepEqual(result.agentsToOpenIssue, ['yellow']);
});

test('"block" mode fails the job only when there are new findings', () => {
  const result = evaluatePolicy(verdicts, { green: 0, yellow: 0, red: 0, blue: 3 }, { blue: 'block' });

  assert.equal(result.perAgent.blue.block, true);
  assert.equal(result.shouldBlockJob, true);
  assert.deepEqual(result.agentsToBlock, ['blue']);
});

test('"block" mode with zero new findings does not block, even on a "fail" verdict', () => {
  // A pre-existing (baselined) failure resurfacing should not block by itself (D-11).
  const result = evaluatePolicy(verdicts, { green: 0, yellow: 0, red: 0, blue: 0 }, { blue: 'block' });

  assert.equal(result.perAgent.blue.block, false);
  assert.equal(result.shouldBlockJob, false);
});

test('"notify" mode notifies but never opens an issue or blocks', () => {
  const result = evaluatePolicy(verdicts, { green: 0, yellow: 1, red: 0, blue: 0 }, { yellow: 'notify' });

  assert.equal(result.perAgent.yellow.notify, true);
  assert.equal(result.perAgent.yellow.openIssue, false);
  assert.equal(result.perAgent.yellow.block, false);
});

test('"off" mode takes no action regardless of new findings', () => {
  const result = evaluatePolicy(verdicts, { green: 0, yellow: 5, red: 0, blue: 5 }, { yellow: 'off', blue: 'off' });

  assert.equal(result.perAgent.yellow.openIssue, false);
  assert.equal(result.perAgent.yellow.notify, false);
  assert.equal(result.perAgent.blue.block, false);
  assert.equal(result.shouldBlockJob, false);
});

test('an invalid mode throws', () => {
  assert.throws(() => evaluatePolicy(verdicts, { green: 0, yellow: 0, red: 0, blue: 0 }, { green: 'bogus' }), /Invalid policy mode/);
});

test('missing newFindingsByAgent defaults every agent to zero', () => {
  const result = evaluatePolicy(verdicts, undefined, {});
  for (const agent of ['green', 'yellow', 'red', 'blue']) {
    assert.equal(result.perAgent[agent].newFindings, 0);
    assert.equal(result.perAgent[agent].openIssue, false);
  }
});
