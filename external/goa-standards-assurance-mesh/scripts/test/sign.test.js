'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { sign, verify, HEADER_NAME } = require('../lib/sign');

test('sign() matches the shared test vector (scripts/test-vectors/signature.json)', () => {
  const vectorPath = path.join(__dirname, '..', 'test-vectors', 'signature.json');
  const vector = JSON.parse(fs.readFileSync(vectorPath, 'utf8'));

  const header = sign(vector.body, vector.secret);

  assert.equal(header, vector.header_value);
  assert.equal(header, `sha256=${vector.signature}`);
  assert.equal(HEADER_NAME, vector.header_name);
});

test('verify() accepts the correct signature and rejects a tampered body', () => {
  const body = JSON.stringify({ hello: 'world' });
  const secret = 'super-secret';
  const header = sign(body, secret);

  assert.equal(verify(body, secret, header), true);
  assert.equal(verify(body + ' ', secret, header), false);
  assert.equal(verify(body, 'wrong-secret', header), false);
  assert.equal(verify(body, secret, 'sha256=deadbeef'), false);
  assert.equal(verify(body, secret, undefined), false);
});

test('sign() requires a string body and a non-empty secret', () => {
  assert.throws(() => sign(42, 'secret'), TypeError);
  assert.throws(() => sign('{}', ''), TypeError);
});
