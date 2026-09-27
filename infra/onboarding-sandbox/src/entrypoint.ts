/**
 * Onboarding sandbox job entrypoint (spec 007, epic B3, WP-BE6, T141).
 *
 * Runs as an Azure Container Apps Job execution (one execution per
 * onboarding run, manual trigger) started by
 * `app/backend/src/services/onboarding/jobDispatcher.ts`'s
 * `AzureContainerAppsJobDispatcher`, or locally via `docker run`
 * (`DockerSandboxRunner`, one container per repository, for local
 * development).
 *
 * Two modes, selected by which env vars are present:
 *
 *  - **Job mode** (`PRONGHORN_CALLBACK_URL` set): processes every repository
 *    listed in `PRONGHORN_REPOSITORIES` (JSON `[{fullName}]`), each with its
 *    own `PRONGHORN_REPO_CLONE_URL_<n>` (plain) and
 *    `PRONGHORN_REPO_AUTH_SECRET_NAME_<n>` (a name, not a value — fix round
 *    1, item 1: the Container Apps Jobs "start" REST call cannot carry
 *    secrets, so every per-run secret lives in the dedicated sandbox Key
 *    Vault at `PRONGHORN_VAULT_URI` instead, fetched here with this
 *    container's own managed identity — see `keyvault.ts`). The callback
 *    bearer token itself is never sent either: only its plaintext payload
 *    (`PRONGHORN_CALLBACK_PAYLOAD`) and its HMAC key's secret name
 *    (`PRONGHORN_CALLBACK_KEY_SECRET_NAME`); this process fetches the key
 *    and recomputes the identical token
 *    (`base64url(payload) + "." + base64url(hmacSha256(payload, key))`),
 *    the same construction `callbackAuth.ts#mintCallbackToken` used to mint
 *    it.
 *  - **Single-repository mode** (`PRONGHORN_REPO_FULL_NAME` set instead):
 *    clones one repository, detects, generates, and prints the resulting
 *    `JobRepoResult` as one line of JSON on stdout, then exits. Used by
 *    `DockerSandboxRunner` for local dev — no vault involved, the clone
 *    credential (`PRONGHORN_REPO_AUTH`) is passed directly, matching how
 *    `LocalJobDispatcher` never touches the sandbox vault either (research
 *    decision: "no vault in dev").
 *
 * Every credential this process ever sees comes in as an environment
 * variable or is fetched from Key Vault (never a CLI argument, never baked
 * into the image) and is never logged — see `clone.ts`'s docstring for how
 * it's kept out of argv too.
 *
 * Non-root, minimal base image (see `../Dockerfile`): this process only
 * ever reads (clones a shallow, single-branch checkout) and writes to its
 * own container filesystem — it never pushes, and it never has write
 * access to the repositories it inspects.
 */
import fs from "fs";
import os from "os";
import path from "path";
import crypto from "crypto";
import { cloneRepositoryShallow } from "./clone";
import { listFilesRecursive } from "./listFiles";
import { detectCiProvider, detectStack, RepositoryHost } from "./detect";
import { generateManifest } from "./generateManifest";
import { getSecret as getVaultSecret } from "./keyvault";

interface JobRepoResult {
  fullName: string;
  detectedProfile?: string;
  detectedStack?: string;
  detectedBuild?: string;
  detectedCi?: string;
  generatedManifest?: Array<{ path: string; content: string }>;
  baselineCounts?: Record<string, number>;
  error?: string;
}

function hostFromCloneUrl(cloneUrl: string): RepositoryHost {
  return cloneUrl.includes("dev.azure.com") || cloneUrl.includes("visualstudio.com") ? "azure_devops" : "github";
}

const MESH_SCRIPTS_REF = process.env.MESH_SCRIPTS_REF || "0".repeat(40);
const PRONGHORN_API_URL = process.env.PRONGHORN_API_URL || "";
const PACK_VERSION = process.env.PRONGHORN_PACK_VERSION || "2026.3";

async function runOneRepository(fullName: string, cloneUrl: string, authorizationHeader: string): Promise<JobRepoResult> {
  const destDir = fs.mkdtempSync(path.join(os.tmpdir(), "onboarding-sandbox-"));
  try {
    await cloneRepositoryShallow({ cloneUrl, authorizationHeader, destDir });

    const files = listFilesRecursive(destDir);
    const host = hostFromCloneUrl(cloneUrl);
    const detectedCi = detectCiProvider(files, host);
    const stack = detectStack(files);

    const manifest = generateManifest({
      ciProvider: detectedCi,
      defaultBranch: "main", // corrected by the API from the provider's actual default branch when opening the PR
      profile: stack.profile,
      buildCommand: stack.buildCommand,
      packVersion: PACK_VERSION,
      meshScriptsRef: MESH_SCRIPTS_REF,
      pronghornApiUrl: PRONGHORN_API_URL,
    });

    return {
      fullName,
      detectedProfile: stack.profile,
      detectedStack: stack.stackLabel,
      detectedBuild: stack.buildCommand,
      detectedCi,
      generatedManifest: manifest,
      baselineCounts: { green: 0, yellow: 0, red: 0, blue: 0 },
    };
  } catch (err: any) {
    return { fullName, error: err.message };
  } finally {
    // Read-only sandbox: clean up its own scratch clone; never writes back
    // to the repository itself.
    fs.rmSync(destDir, { recursive: true, force: true });
  }
}

async function postCallback(callbackUrl: string, token: string, body: unknown): Promise<void> {
  const res = await fetch(callbackUrl, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    // Never include the token or any repository credential in this message.
    console.error(`[onboarding-sandbox] callback POST failed: ${res.status}`);
  }
}

/**
 * Recompute the callback bearer token from its plaintext payload and the
 * HMAC key fetched from the vault — identical construction to
 * `callbackAuth.ts#mintCallbackToken`/`signPayload` on the API side, so the
 * result verifies there byte-for-byte.
 */
function buildCallbackToken(payloadB64: string, signingKey: string): string {
  const signature = crypto.createHmac("sha256", signingKey).update(payloadB64).digest().toString("base64url");
  return `${payloadB64}.${signature}`;
}

async function runJobMode(): Promise<void> {
  const runId = process.env.PRONGHORN_RUN_ID || "";
  const callbackUrl = process.env.PRONGHORN_CALLBACK_URL || "";
  const vaultUri = process.env.PRONGHORN_VAULT_URI || "";
  const callbackPayload = process.env.PRONGHORN_CALLBACK_PAYLOAD || "";
  const callbackKeySecretName = process.env.PRONGHORN_CALLBACK_KEY_SECRET_NAME || "";
  const repositories: Array<{ fullName: string }> = JSON.parse(process.env.PRONGHORN_REPOSITORIES || "[]");

  // Fetched once and reused for every callback POST in this execution — one
  // secret read, not one per call.
  let callbackToken = "";
  try {
    const signingKey = await getVaultSecret(vaultUri, callbackKeySecretName);
    callbackToken = buildCallbackToken(callbackPayload, signingKey);
  } catch (err: any) {
    // Nothing to authenticate a callback with — there is no useful way to
    // report this failure back to an API that can't verify us. Logged
    // locally (job execution logs) for an operator to notice.
    console.error(`[onboarding-sandbox] could not obtain the callback token: ${err.message}`);
    process.exitCode = 1;
    return;
  }

  const results: JobRepoResult[] = [];
  for (let i = 0; i < repositories.length; i++) {
    const fullName = repositories[i].fullName;
    const cloneUrl = process.env[`PRONGHORN_REPO_CLONE_URL_${i}`] || "";
    const authSecretName = process.env[`PRONGHORN_REPO_AUTH_SECRET_NAME_${i}`] || "";

    await postCallback(callbackUrl, callbackToken, { type: "progress", event: { type: "log", message: `Cloning ${fullName}` } });

    if (!cloneUrl || !authSecretName) {
      results.push({ fullName, error: "no clone credential was provided for this repository" });
      continue;
    }

    let authorizationHeader: string;
    try {
      authorizationHeader = await getVaultSecret(vaultUri, authSecretName);
    } catch (err: any) {
      results.push({ fullName, error: `could not read the clone credential from the sandbox vault: ${err.message}` });
      continue;
    }
    results.push(await runOneRepository(fullName, cloneUrl, authorizationHeader));
  }

  await postCallback(callbackUrl, callbackToken, { type: "progress", event: { type: "step", step: "sandbox", message: "Sandbox run complete" } });

  const allFailed = results.length > 0 && results.every((r) => r.error);
  await postCallback(callbackUrl, callbackToken, {
    type: "result",
    result: {
      runId,
      status: allFailed ? "failed" : "ready",
      error: allFailed ? results[0]?.error : undefined,
      repositories: results,
    },
  });

  await postCallback(callbackUrl, callbackToken, { type: "progress", event: { type: "done" } });
}

async function runSingleRepositoryMode(): Promise<void> {
  const fullName = process.env.PRONGHORN_REPO_FULL_NAME || "";
  const cloneUrl = process.env.PRONGHORN_REPO_CLONE_URL || "";
  const authorizationHeader = process.env.PRONGHORN_REPO_AUTH || "";

  const result = await runOneRepository(fullName, cloneUrl, authorizationHeader);
  // Exactly one line of JSON on stdout — DockerSandboxRunner parses the last
  // stdout line. Nothing else in this mode writes to stdout.
  process.stdout.write(`${JSON.stringify(result)}\n`);
  if (result.error) process.exitCode = 1;
}

async function main(): Promise<void> {
  if (process.env.PRONGHORN_CALLBACK_URL) {
    await runJobMode();
  } else if (process.env.PRONGHORN_REPO_FULL_NAME) {
    await runSingleRepositoryMode();
  } else {
    console.error("[onboarding-sandbox] neither PRONGHORN_CALLBACK_URL nor PRONGHORN_REPO_FULL_NAME is set; nothing to do");
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(`[onboarding-sandbox] fatal: ${err.message}`);
  process.exitCode = 1;
});
