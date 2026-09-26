'use strict';

const https = require('node:https');
const http = require('node:http');
const { URL } = require('node:url');
const { sign, HEADER_NAME } = require('./sign');

/**
 * POST the signed report to `<apiUrl>/api/v1/mesh/runs`. No user auth; the
 * HMAC signature is the only authentication (contracts/api.md).
 *
 * @param {string} apiUrl - Pronghorn API base URL, e.g. https://api.pronghorn.example
 * @param {string} rawBody - exact JSON string being sent (must be what was signed)
 * @param {string} secret - the repository's HMAC secret
 * @param {{timeoutMs?: number, path?: string}} [opts]
 * @returns {Promise<{status:number, body:string}>}
 */
function postReport(apiUrl, rawBody, secret, opts = {}) {
  const path = opts.path || '/api/v1/mesh/runs';
  const url = new URL(path, apiUrl);
  const signature = sign(rawBody, secret);
  const client = url.protocol === 'http:' ? http : https;

  const requestOptions = {
    method: 'POST',
    hostname: url.hostname,
    port: url.port || (url.protocol === 'http:' ? 80 : 443),
    path: `${url.pathname}${url.search}`,
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(rawBody),
      [HEADER_NAME]: signature,
    },
    timeout: opts.timeoutMs || 15000,
  };

  return new Promise((resolve, reject) => {
    const req = client.request(requestOptions, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, body }));
    });
    req.on('timeout', () => req.destroy(new Error(`Request to ${url} timed out`)));
    req.on('error', reject);
    req.write(rawBody);
    req.end();
  });
}

module.exports = { postReport };
