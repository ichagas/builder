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
 *    own `PRONGHORN_REPO_CLONE_URL_<n>`/`PRONGHORN_REPO_AUTH_<n>`, reporting
 *    progress and the final result back to the API over HTTP, authenticated
 *    by `PRONGHORN_CALLBACK_TOKEN` (per-run, short-lived — see
 *    `callbackAuth.ts`).
 *  - **Single-repository mode** (`PRONGHORN_REPO_FULL_NAME` set instead):
 *    clones one repository, detects, generates, and prints the resulting
 *    `JobRepoResult` as one line of JSON on stdout, then exits. Used by
 *    `DockerSandboxRunner` for local dev; nothing is POSTed anywhere.
 *
 * Every credential this process ever sees comes in as an environment
 * variable (never a CLI argument, never baked into the image) and is never
 * logged — see `clone.ts`'s docstring for how it's kept out of argv too.
 *
 * Non-root, minimal base image (see `../Dockerfile`): this process only
 * ever reads (clones a shallow, single-branch checkout) and writes to its
 * own container filesystem — it never pushes, and it never has write
 * access to the repositories it inspects.
 */
import fs from "fs";
import os from "os";
import path from "path";
import { cloneRepositoryShallow } from "./clone";
import { listFilesRecursive } from "./listFiles";
import { detectCiProvider, detectStack, RepositoryHost } from "./detect";
import { generateManifest } from "./generateManifest";

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

async function runJobMode(): Promise<void> {
  const runId = process.env.PRONGHORN_RUN_ID || "";
  const callbackUrl = process.env.PRONGHORN_CALLBACK_URL || "";
  const callbackToken = process.env.PRONGHORN_CALLBACK_TOKEN || "";
  const repositories: Array<{ fullName: string }> = JSON.parse(process.env.PRONGHORN_REPOSITORIES || "[]");

  const results: JobRepoResult[] = [];
  for (let i = 0; i < repositories.length; i++) {
    const fullName = repositories[i].fullName;
    const cloneUrl = process.env[`PRONGHORN_REPO_CLONE_URL_${i}`] || "";
    const authorizationHeader = process.env[`PRONGHORN_REPO_AUTH_${i}`] || "";

    await postCallback(callbackUrl, callbackToken, { type: "progress", event: { type: "log", message: `Cloning ${fullName}` } });

    if (!cloneUrl || !authorizationHeader) {
      results.push({ fullName, error: "no clone credential was provided for this repository" });
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
