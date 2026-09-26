/**
 * Real Git branch creation for a work item (WP-BE2, T104, D-9).
 *
 * When a change is scheduled into a version or accepted (status -> active),
 * it gets a real Git branch off the project's default repo:
 *   - bugs:                    fix/wi-<n>-<slug>
 *   - enhancements/features:   feat/wi-<n>-<slug>
 *
 * The branch name is persisted on `work_items.branch` (see
 * `infra/migrations/012_versions_work_items.sql`). Callers (routes/workItems.ts)
 * invoke {@link ensureBranchForWorkItem} best-effort: a project without a
 * linked repo, or without any resolvable GitHub token, is not an error — the
 * change simply stays without a real branch (`skipped` explains why) and its
 * staged commits keep going to the repo's default branch.
 *
 * Idempotent: a work item that already has `branch` set is returned as-is
 * without calling GitHub again; a branch that already exists on GitHub (e.g.
 * a retried call, or manual creation) is reused rather than recreated.
 */
import db from "../../utils/database";
import { logger } from "../../utils/logger";
import { gitHubApiHeaders, resolveGitHubToken } from "../../utils/githubAuth";

// ============================================================================
// Types
// ============================================================================

export type BranchSkipReason = "no-repo" | "no-token" | "already-set" | "not-found" | "error";

export interface BranchResult {
  /** The work item's real Git branch name, or null when it was skipped. */
  branch: string | null;
  /** True when this call created the branch on GitHub (vs. reusing one). */
  created: boolean;
  /** Set when no branch was created/looked up, with the reason why. */
  skipped?: BranchSkipReason;
}

/** Minimal work-item shape this module needs. */
interface WorkItemForBranch {
  id: string;
  project_id: string;
  key: string;
  type: "bug" | "enhancement" | "feature" | string;
  title: string;
  branch: string | null;
}

/** Minimal repo shape this module needs (project_repos row). */
export interface RepoForBranch {
  id: string;
  organization: string;
  repo: string;
  branch: string | null;
}

/**
 * GitHub operations {@link ensureBranchForWorkItem} needs, isolated behind an
 * interface so tests can supply a mock instead of hitting api.github.com.
 */
export interface BranchGitHubClient {
  /**
   * Ensure `branchName` exists in `org/repo`, branching from `baseBranch` if
   * it doesn't. Returns whether the branch already existed.
   */
  ensureBranch(
    org: string,
    repo: string,
    branchName: string,
    baseBranch: string,
    token: string
  ): Promise<{ existed: boolean }>;
}

// ============================================================================
// Branch naming
// ============================================================================

/** Slugify a work item title into the tail of a branch name. */
export function slugifyTitle(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");
  return slug || "change";
}

/** `WI-42` -> `42`. Falls back to the raw key (sanitized) if it doesn't match. */
function workItemNumber(key: string): string {
  const match = /^WI-(\d+)$/i.exec(key ?? "");
  return match ? match[1] : (key ?? "0").replace(/[^0-9a-z]/gi, "");
}

/**
 * `fix/wi-42-heic` for bugs, `feat/wi-38-bulk-export` for
 * enhancements/features (D-9).
 */
export function computeBranchName(workItem: Pick<WorkItemForBranch, "key" | "type" | "title">): string {
  const prefix = workItem.type === "bug" ? "fix" : "feat";
  return `${prefix}/wi-${workItemNumber(workItem.key)}-${slugifyTitle(workItem.title)}`;
}

// ============================================================================
// Default GitHub client (real fetch against api.github.com)
// ============================================================================

async function getRefSha(
  org: string,
  repo: string,
  branch: string,
  token: string
): Promise<string | null> {
  const resp = await fetch(
    `https://api.github.com/repos/${org}/${repo}/git/refs/heads/${encodeURIComponent(branch)}`,
    { headers: gitHubApiHeaders(token) }
  );
  if (resp.status === 404) return null;
  if (!resp.ok) {
    const body = await resp.text().catch(() => "");
    throw new Error(`Failed to look up branch '${branch}' (${resp.status}): ${body}`);
  }
  const data = (await resp.json()) as any;
  return data?.object?.sha ?? null;
}

export const defaultBranchGitHubClient: BranchGitHubClient = {
  async ensureBranch(org, repo, branchName, baseBranch, token) {
    const existingSha = await getRefSha(org, repo, branchName, token);
    if (existingSha) {
      return { existed: true };
    }

    const baseSha = await getRefSha(org, repo, baseBranch, token);
    if (!baseSha) {
      throw new Error(`Base branch '${baseBranch}' not found in ${org}/${repo}`);
    }

    const createResp = await fetch(`https://api.github.com/repos/${org}/${repo}/git/refs`, {
      method: "POST",
      headers: gitHubApiHeaders(token),
      body: JSON.stringify({ ref: `refs/heads/${branchName}`, sha: baseSha }),
    });
    if (!createResp.ok) {
      // 422 "Reference already exists" — a concurrent caller won the race.
      // Treat it the same as "existed" (idempotent).
      if (createResp.status === 422) {
        return { existed: true };
      }
      const body = await createResp.text().catch(() => "");
      throw new Error(`Failed to create branch '${branchName}' (${createResp.status}): ${body}`);
    }
    return { existed: false };
  },
};

// ============================================================================
// Repo resolution
// ============================================================================

/**
 * The project's default repo for branching, merging, and tagging: the
 * `is_default` row, or the oldest linked repo. Shared with
 * `services/versions/releaseService.ts`.
 */
export async function resolveDefaultRepo(projectId: string): Promise<RepoForBranch | null> {
  const { rows } = await db.query(
    `SELECT id, organization, repo, branch FROM project_repos
     WHERE project_id = $1
     ORDER BY is_default DESC, created_at ASC
     LIMIT 1`,
    [projectId]
  );
  return rows[0] ?? null;
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Ensure `workItemId` has a real Git branch, creating one off the project's
 * default repo's default branch if it doesn't. Best-effort: never throws —
 * a project without a linked repo, or without a resolvable GitHub token,
 * comes back as `{ branch: null, skipped: ... }` instead.
 */
export async function ensureBranchForWorkItem(
  workItemId: string,
  githubClient: BranchGitHubClient = defaultBranchGitHubClient
): Promise<BranchResult> {
  try {
    const { rows } = await db.query(
      `SELECT id, project_id, key, type, title, branch FROM work_items WHERE id = $1`,
      [workItemId]
    );
    const workItem: WorkItemForBranch | undefined = rows[0];
    if (!workItem) {
      return { branch: null, created: false, skipped: "not-found" };
    }
    if (workItem.branch) {
      return { branch: workItem.branch, created: false, skipped: "already-set" };
    }

    const repo = await resolveDefaultRepo(workItem.project_id);
    if (!repo) {
      return { branch: null, created: false, skipped: "no-repo" };
    }

    const resolved = await resolveGitHubToken({ repoId: repo.id, isDefaultRepo: true });
    if (!resolved) {
      return { branch: null, created: false, skipped: "no-token" };
    }

    const branchName = computeBranchName(workItem);
    const baseBranch = repo.branch || "main";

    const { existed } = await githubClient.ensureBranch(
      repo.organization,
      repo.repo,
      branchName,
      baseBranch,
      resolved.token
    );

    await db.query(`UPDATE work_items SET branch = $2, updated_at = NOW() WHERE id = $1`, [
      workItemId,
      branchName,
    ]);

    return { branch: branchName, created: !existed };
  } catch (err: any) {
    logger.warn("[branch-service] Failed to ensure branch for work item", {
      work_item_id: workItemId,
      error: err?.message,
    });
    return { branch: null, created: false, skipped: "error" };
  }
}

/**
 * The Git branch a work item's staged commits should be routed to (the
 * staging `branch` dimension, see `repo_staging.branch` /
 * `services/versions/releaseService.ts`). Falls back to `'main'` for a work
 * item without a real branch yet (pre-first-release / no linked repo) —
 * identical to legacy behaviour.
 */
export async function stagingBranchForWorkItem(workItemId: string): Promise<string> {
  const { rows } = await db.query(`SELECT branch FROM work_items WHERE id = $1`, [workItemId]);
  return rows[0]?.branch || "main";
}
