'use strict';

/*
 * End-to-end simulation of the "report" stage: runs report-cli.js's real
 * `main()` (the exact same entry point the GitHub workflow / Azure template
 * invoke as `node report-cli.js ...`) against a tiny local HTTP server
 * standing in for the Pronghorn API. The server independently verifies the
 * HMAC signature (mirroring what WP-BE4 does on the real ingest endpoint)
 * and returns an authoritative `new_findings_by_agent`, so these tests
 * exercise the full sign -> POST -> verify -> policy -> exit-code path,
 * including each policy mode (issue, notify, block, off).
 *
 * `main()` is called in-process (not via a spawned child process): the CLI's
 * own POST goes over a real loopback TCP socket to the server started in
 * this same test file, so signing and verification are genuinely exercised
 * end-to-end. `main()` calls `process.exit()`, so it is invoked through
 * `callMain()` below, which intercepts that single call and returns the
 * exit code instead of killing the test process (test-only instrumentation;
 * report-cli.js itself is not modified).
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');

const { verify, HEADER_NAME } = require('../lib/sign');
const { main } = require('../report-cli');

const SECRET = 'e2e-test-secret';

function mkTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'mesh-e2e-'));
}

function writeAgentResult(dir, name, contents) {
  const file = path.join(dir, `${name}.json`);
  fs.writeFileSync(file, JSON.stringify(contents));
  return file;
}

/**
 * Starts a local HTTP server standing in for the Pronghorn API. It
 * independently verifies the signature against SECRET (returning 401
 * otherwise, so a broken signature never silently "passes"), and otherwise
 * responds 200 with { run_id, new_findings_by_agent: newFindingsByAgent }.
 */
function startFakeApi(newFindingsByAgent) {
  const received = [];
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let body = '';
      req.on('data', (chunk) => { body += chunk; });
      req.on('end', () => {
        const sigHeader = req.headers[HEADER_NAME.toLowerCase()];
        const signatureValid = verify(body, SECRET, sigHeader);
        received.push({ url: req.url, body, signatureValid, sigHeader });

        if (!signatureValid) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'invalid signature' }));
          return;
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ run_id: 'run-e2e-1', new_findings_by_agent: newFindingsByAgent }));
      });
    });
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({ server, url: `http://127.0.0.1:${port}`, received });
    });
  });
}

/** Marker thrown by the patched process.exit so callMain() can recover the code. */
class ExitSignal {
  constructor(code) { this.code = code; }
}

/**
 * Runs report-cli.js's exported main(argv) in-process, intercepting
 * process.exit (which main() calls on every path) and console output, so
 * the real code executes exactly as it does under `node report-cli.js …`
 * but without tearing down the test process.
 *
 * @returns {Promise<{status:number, stdout:string, stderr:string}>}
 */
async function callMain(argv, env) {
  const originalExit = process.exit;
  const originalLog = console.log;
  const originalError = console.error;
  const originalEnv = { ...process.env };

  let stdout = '';
  let stderr = '';
  process.exit = (code) => { throw new ExitSignal(code || 0); };
  console.log = (...a) => { stdout += `${a.join(' ')}\n`; };
  console.error = (...a) => { stderr += `${a.join(' ')}\n`; };
  Object.assign(process.env, env);

  try {
    await main(argv);
    return { status: 0, stdout, stderr };
  } catch (err) {
    if (err instanceof ExitSignal) {
      return { status: err.code, stdout, stderr };
    }
    throw err;
  } finally {
    process.exit = originalExit;
    console.log = originalLog;
    console.error = originalError;
    process.env = originalEnv;
  }
}

function buildArgv(dir, apiUrl, { policy = {}, findings = {} } = {}) {
  const green = writeAgentResult(dir, 'green', findings.green || { verdict: 'pass', findings: [] });
  const yellow = writeAgentResult(dir, 'yellow', findings.yellow || { verdict: 'pass', findings: [] });
  const red = writeAgentResult(dir, 'red', findings.red || { verdict: 'pass', findings: [] });
  const blue = writeAgentResult(dir, 'blue', findings.blue || { verdict: 'pass', findings: [] });

  const policyFile = path.join(dir, 'policy.json');
  fs.writeFileSync(policyFile, JSON.stringify(policy));

  const outputFile = path.join(dir, 'report.json');
  const policyOutputFile = path.join(dir, 'policy-evaluation.json');

  const argv = [
    '--repository', 'goa/permits-api',
    '--commit', 'abc123def4567890abc123def4567890abcdef1',
    '--pr-number', '214',
    '--base-branch', 'main',
    '--pr-state', 'open',
    '--trigger', 'pull_request',
    '--pack-version', '2026.3',
    '--green', green,
    '--yellow', yellow,
    '--red', red,
    '--blue', blue,
    '--report-url', 'https://example.blob.core.windows.net/mesh-reports/permits-api/214/report.json',
    '--api-url', apiUrl,
    '--secret-env', 'PRONGHORN_REPORT_SECRET',
    '--policy-file', policyFile,
    '--output', outputFile,
    '--policy-output', policyOutputFile,
  ];

  return { argv, outputFile, policyOutputFile };
}

async function runCli(dir, apiUrl, opts) {
  const { argv, outputFile, policyOutputFile } = buildArgv(dir, apiUrl, opts);
  const result = await callMain(argv, { PRONGHORN_REPORT_SECRET: SECRET });

  const report = fs.existsSync(outputFile) ? JSON.parse(fs.readFileSync(outputFile, 'utf8')) : null;
  const policyEvaluation = fs.existsSync(policyOutputFile)
    ? JSON.parse(fs.readFileSync(policyOutputFile, 'utf8'))
    : null;

  return { ...result, report, policyEvaluation };
}

test('e2e: report-cli signs the exact report bytes and the fake API verifies them', async () => {
  const dir = mkTmpDir();
  const { server, url, received } = await startFakeApi({ green: 0, yellow: 0, red: 0, blue: 0 });
  try {
    const { status, report } = await runCli(dir, url);

    assert.equal(status, 0, 'exits 0 when there are no new findings');
    assert.equal(received.length, 1, 'the CLI POSTs exactly once');
    assert.equal(received[0].url, '/api/v1/mesh/runs');
    assert.equal(received[0].signatureValid, true, 'the fake API independently verifies the HMAC signature');
    // The raw bytes received by the server must be exactly what was written
    // to --output (no re-serialization between signing and sending).
    assert.equal(received[0].body, JSON.stringify(report));
  } finally {
    server.close();
  }
});

test('e2e: a wrong secret produces a signature the API rejects, and the CLI fails the job', async () => {
  const dir = mkTmpDir();
  const { server, url } = await startFakeApi({ green: 0, yellow: 0, red: 0, blue: 0 });
  try {
    const { argv } = buildArgv(dir, url);
    const { status, stderr } = await callMain(argv, { PRONGHORN_REPORT_SECRET: 'wrong-secret' });

    assert.notEqual(status, 0, 'a rejected (401) report POST fails the job outright');
    assert.match(stderr, /HTTP 401/);
  } finally {
    server.close();
  }
});

test('e2e policy mode "issue" (default): exits 0, records the agent to open an issue for, does not block', async () => {
  const dir = mkTmpDir();
  const { server, url } = await startFakeApi({ green: 0, yellow: 2, red: 0, blue: 0 });
  try {
    const { status, policyEvaluation } = await runCli(dir, url, { policy: {} });

    assert.equal(status, 0);
    assert.deepEqual(policyEvaluation.agentsToOpenIssue, ['yellow']);
    assert.deepEqual(policyEvaluation.agentsToNotify, ['yellow']);
    assert.deepEqual(policyEvaluation.agentsToBlock, []);
    assert.equal(policyEvaluation.shouldBlockJob, false);
  } finally {
    server.close();
  }
});

test('e2e policy mode "notify": exits 0, notifies but never opens an issue', async () => {
  const dir = mkTmpDir();
  const { server, url } = await startFakeApi({ green: 0, yellow: 1, red: 0, blue: 0 });
  try {
    const { status, policyEvaluation } = await runCli(dir, url, { policy: { yellow: 'notify' } });

    assert.equal(status, 0);
    assert.deepEqual(policyEvaluation.agentsToNotify, ['yellow']);
    assert.deepEqual(policyEvaluation.agentsToOpenIssue, []);
    assert.deepEqual(policyEvaluation.agentsToBlock, []);
  } finally {
    server.close();
  }
});

test('e2e policy mode "block": exits non-zero (fails the CI job) when there are new findings', async () => {
  const dir = mkTmpDir();
  const { server, url } = await startFakeApi({ green: 0, yellow: 0, red: 0, blue: 3 });
  try {
    const { status, stderr, policyEvaluation } = await runCli(dir, url, { policy: { blue: 'block' } });

    assert.notEqual(status, 0, 'the CI job fails when a "block"-mode check has new findings');
    assert.deepEqual(policyEvaluation.agentsToBlock, ['blue']);
    assert.equal(policyEvaluation.shouldBlockJob, true);
    assert.match(stderr, /Blocking: new findings in blue/);
  } finally {
    server.close();
  }
});

test('e2e policy mode "block" with zero new findings does not fail the job', async () => {
  const dir = mkTmpDir();
  // Verdict can still be "fail" (a pre-existing/baselined issue), but the API
  // says there are no NEW findings for blue this run.
  const { server, url } = await startFakeApi({ green: 0, yellow: 0, red: 0, blue: 0 });
  try {
    const { status, policyEvaluation } = await runCli(dir, url, {
      policy: { blue: 'block' },
      findings: { blue: { verdict: 'fail', findings: [] } },
    });

    assert.equal(status, 0, 'a "fail" verdict alone must not block when new findings == 0 (D-11)');
    assert.equal(policyEvaluation.perAgent.blue.block, false);
  } finally {
    server.close();
  }
});

test('e2e policy mode "off": exits 0 and takes no action regardless of new findings', async () => {
  const dir = mkTmpDir();
  const { server, url } = await startFakeApi({ green: 0, yellow: 5, red: 0, blue: 5 });
  try {
    const { status, policyEvaluation } = await runCli(dir, url, { policy: { yellow: 'off', blue: 'off' } });

    assert.equal(status, 0);
    assert.deepEqual(policyEvaluation.agentsToOpenIssue, []);
    assert.deepEqual(policyEvaluation.agentsToNotify, []);
    assert.deepEqual(policyEvaluation.agentsToBlock, []);
    assert.equal(policyEvaluation.perAgent.yellow.mode, 'off');
    assert.equal(policyEvaluation.perAgent.blue.mode, 'off');
  } finally {
    server.close();
  }
});

test('e2e: the API response\'s new_findings_by_agent is authoritative over the local finding count', async () => {
  const dir = mkTmpDir();
  // The run itself carries 3 yellow findings, but the fake API (which owns
  // mesh_baselines) says only 1 is actually new.
  const { server, url } = await startFakeApi({ green: 0, yellow: 1, red: 0, blue: 0 });
  try {
    const { policyEvaluation } = await runCli(dir, url, {
      policy: {},
      findings: {
        yellow: {
          verdict: 'fail',
          findings: [
            { rule: 'plain-language-01', file: 'a.ts', location: 'L1' },
            { rule: 'plain-language-02', file: 'b.ts', location: 'L2' },
            { rule: 'plain-language-03', file: 'c.ts', location: 'L3' },
          ],
        },
      },
    });

    assert.equal(policyEvaluation.perAgent.yellow.newFindings, 1, 'uses the API count (1), not the local count (3)');
  } finally {
    server.close();
  }
});
