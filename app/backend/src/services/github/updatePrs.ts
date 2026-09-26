/**
 * Open update PRs that bump a repository's pinned Standards pack (spec 007,
 * WP-BE4, T123).
 *
 * Onboarding drops two generated files into a repository (research D-12,
 * `external/goa-standards-assurance-mesh/examples/`):
 *  - `pronghorn.standards.yml` — `pack_version: "2026.3"` (every profile/CI)
 *  - `.github/workflows/assurance-mesh.yml` (GitHub Actions repos only —
 *    Azure Pipelines' `azure-pipelines/assurance-mesh.yml` uses different
 *    field names/casing and PR support for it needs an Azure Repos
 *    connection, which is WP-BE8's `integration_connections`; out of scope
 *    here, see the TODO below) — `pack_version: "2026.3"` and
 *    `mesh_scripts_ref: "<sha>"`.
 *
 * "Keeping local edits (only change the version fields)" means this bumps
 * those two fields with a targeted regex substitution on the fetched file
 * text, not a full YAML parse/re-serialize (which would reformat comments,
 * quoting style, key order — exactly the local edits this must not touch).
 */
import { logger } from "../../utils/logger";
import { getInstallationToken, isGitHubAppConfigured } from "../../utils/githubAppAuth";

const MANIFEST_PATH = "pronghorn.standards.yml";
const GITHUB_ACTIONS_WORKFLOW_PATH = ".github/workflows/assurance-mesh.yml";

export interface RepoToUpdate {
  id: string;
  fullName: string;
  provider: "github" | "azure_devops";
  ciProvider: "github_actions" | "azure_pipelines" | null;
  defaultBranch: string;
  pinnedPack: string | null;
}

export interface UpdatePrTarget {
  packVersion: string;
  /** e.g. "goa-standards/assurance-mesh@v3" (standards_packs.workflow_ref). */
  workflowRef: string;
}

export interface UpdatePrResult {
  repositoryId: string;
  opened: boolean;
  prNumber?: number;
  prUrl?: string;
  reason?: string;
}

/** Replace only `pack_version: "..."` (any quoting), leaving everything else untouched. */
export function bumpPackVersion(content: string, newPackVersion: string): string {
  return content.replace(/(pack_version:\s*)"[^"]*"/, `$1"${newPackVersion}"`);
}

/** Replace only `mesh_scripts_ref: "..."`, leaving everything else untouched. */
export function bumpWorkflowRef(content: string, newWorkflowRef: string): string {
  return content.replace(/(mesh_scripts_ref:\s*)"[^"]*"/, `$1"${newWorkflowRef}"`);
}

interface GitHubContentsResponse {
  content: string;
  sha: string;
}

async function githubRequest(token: string, path: string, init: RequestInit = {}): Promise<Response> {
  const res = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(init.headers || {}),
    },
  });
  return res;
}

async function getFileContents(token: string, fullName: string, path: string, ref: string): Promise<GitHubContentsResponse | null> {
  const res = await githubRequest(token, `/repos/${fullName}/contents/${path}?ref=${encodeURIComponent(ref)}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GET contents/${path} failed: ${res.status} ${await res.text()}`);
  const data = (await res.json()) as { content: string; encoding: string; sha: string };
  const content = Buffer.from(data.content, (data.encoding as BufferEncoding) || "base64").toString("utf8");
  return { content, sha: data.sha };
}

async function putFileContents(
  token: string,
  fullName: string,
  path: string,
  branch: string,
  content: string,
  sha: string,
  message: string,
): Promise<void> {
  const res = await githubRequest(token, `/repos/${fullName}/contents/${path}`, {
    method: "PUT",
    body: JSON.stringify({
      message,
      content: Buffer.from(content, "utf8").toString("base64"),
      sha,
      branch,
    }),
  });
  if (!res.ok) throw new Error(`PUT contents/${path} failed: ${res.status} ${await res.text()}`);
}

/**
 * Open (or reuse) a branch on the repository, bump the manifest (and the
 * GitHub Actions workflow file, when present) to `target`, and open a PR
 * against the repository's default branch.
 *
 * Azure DevOps repositories are not supported yet — TODO(WP-BE8): once an
 * Azure Repos connection exists in `integration_connections`, add an
 * equivalent path here using it (pull request creation via the Azure Repos
 * REST API), mirroring this function's shape.
 */
export async function openUpdatePr(repo: RepoToUpdate, target: UpdatePrTarget): Promise<UpdatePrResult> {
  if (repo.provider !== "github") {
    return {
      repositoryId: repo.id,
      opened: false,
      reason: "Azure DevOps update PRs are not supported yet (TODO: WP-BE8 Azure Repos connection)",
    };
  }
  if (!isGitHubAppConfigured()) {
    return { repositoryId: repo.id, opened: false, reason: "GitHub App is not configured" };
  }

  const token = await getInstallationToken();
  const branchName = `pronghorn/update-pack-${target.packVersion}`;

  // Base branch tip.
  const refRes = await githubRequest(token, `/repos/${repo.fullName}/git/ref/heads/${repo.defaultBranch}`);
  if (!refRes.ok) {
    throw new Error(`Failed to read default branch ref: ${refRes.status} ${await refRes.text()}`);
  }
  const { object } = (await refRes.json()) as { object: { sha: string } };
  const baseSha = object.sha;

  // Create (or reuse) the update branch.
  const createBranchRes = await githubRequest(token, `/repos/${repo.fullName}/git/refs`, {
    method: "POST",
    body: JSON.stringify({ ref: `refs/heads/${branchName}`, sha: baseSha }),
  });
  if (!createBranchRes.ok && createBranchRes.status !== 422) {
    // 422 = ref already exists (a previous update PR's branch); reuse it.
    throw new Error(`Failed to create update branch: ${createBranchRes.status} ${await createBranchRes.text()}`);
  }

  let filesChanged = 0;

  const manifest = await getFileContents(token, repo.fullName, MANIFEST_PATH, branchName);
  if (manifest) {
    const bumped = bumpPackVersion(manifest.content, target.packVersion);
    if (bumped !== manifest.content) {
      await putFileContents(
        token,
        repo.fullName,
        MANIFEST_PATH,
        branchName,
        bumped,
        manifest.sha,
        `Bump Standards pack to ${target.packVersion}`,
      );
      filesChanged++;
    }
  } else {
    logger.warn(`[update-prs] ${repo.fullName}: ${MANIFEST_PATH} not found, skipping`);
  }

  if (repo.ciProvider === "github_actions") {
    const workflow = await getFileContents(token, repo.fullName, GITHUB_ACTIONS_WORKFLOW_PATH, branchName);
    if (workflow) {
      let bumped = bumpPackVersion(workflow.content, target.packVersion);
      bumped = bumpWorkflowRef(bumped, target.workflowRef);
      if (bumped !== workflow.content) {
        await putFileContents(
          token,
          repo.fullName,
          GITHUB_ACTIONS_WORKFLOW_PATH,
          branchName,
          bumped,
          workflow.sha,
          `Bump Standards pack to ${target.packVersion}`,
        );
        filesChanged++;
      }
    } else {
      logger.warn(`[update-prs] ${repo.fullName}: ${GITHUB_ACTIONS_WORKFLOW_PATH} not found, skipping`);
    }
  }

  if (filesChanged === 0) {
    return { repositoryId: repo.id, opened: false, reason: "Already on the target pack version; nothing to change" };
  }

  const prRes = await githubRequest(token, `/repos/${repo.fullName}/pulls`, {
    method: "POST",
    body: JSON.stringify({
      title: `Update Standards pack to ${target.packVersion}`,
      head: branchName,
      base: repo.defaultBranch,
      body:
        `Bumps the pinned Standards pack from \`${repo.pinnedPack ?? "unknown"}\` to \`${target.packVersion}\`` +
        ` and the mesh workflow reference, without touching any other local edits.`,
    }),
  });
  if (!prRes.ok) {
    // A PR already open for this branch (422) is not an error — surface it as such.
    if (prRes.status === 422) {
      return { repositoryId: repo.id, opened: false, reason: "An update PR is already open for this repository" };
    }
    throw new Error(`Failed to open PR: ${prRes.status} ${await prRes.text()}`);
  }
  const pr = (await prRes.json()) as { number: number; html_url: string };

  return { repositoryId: repo.id, opened: true, prNumber: pr.number, prUrl: pr.html_url };
}
