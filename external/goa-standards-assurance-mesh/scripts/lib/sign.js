'use strict';

const crypto = require('node:crypto');

const HEADER_NAME = 'X-Pronghorn-Signature';
const PREFIX = 'sha256=';

/**
 * Sign the raw request body with the repository's per-repo HMAC key
 * (data-model.md `application_repositories.report_secret_ref`, resolved to
 * the actual secret value by the caller before this runs).
 *
 * The signature is computed over the exact bytes that will be POSTed, so the
 * caller must sign the same string it sends (no re-serialization in between).
 *
 * @param {string} rawBody - the exact JSON string to be sent as the request body
 * @param {string} secret - the shared HMAC secret for this repository
 * @returns {string} the full header value, e.g. "sha256=<hex>"
 */
function sign(rawBody, secret) {
  if (typeof rawBody !== 'string') {
    throw new TypeError('sign() requires the raw body as a string');
  }
  if (!secret) {
    throw new TypeError('sign() requires a non-empty secret');
  }
  const hex = crypto.createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex');
  return `${PREFIX}${hex}`;
}

/**
 * Constant-time verification of an incoming signature header against the
 * raw body and secret. Used by tests here, and mirrors what the Pronghorn
 * API (WP-BE4) does on `POST /api/v1/mesh/runs`.
 *
 * @param {string} rawBody
 * @param {string} secret
 * @param {string} headerValue - e.g. "sha256=<hex>"
 * @returns {boolean}
 */
function verify(rawBody, secret, headerValue) {
  if (!headerValue || !headerValue.startsWith(PREFIX)) return false;
  const expected = sign(rawBody, secret);
  const a = Buffer.from(expected);
  const b = Buffer.from(headerValue);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

module.exports = { sign, verify, HEADER_NAME, PREFIX };
