/**
 * Release service (WP-BE2, T102).
 *
 * Implements the release / first-release / release-checks business logic
 * `routes/versions.ts` delegates to (in-order semver release rule,
 * carry-over of unfinished work items, merging reviewed branches into the
 * repo's default branch, drafting release notes, tagging, best-effort
 * deploy, and locking the baseline on the first release).
 *
 * Design notes (see specs/007-frontend-new/data-model.md §1 and the
 * `approach-3-versions` prototype for the release-checklist UI this backs):
 *
 * - Before the first release, everything built goes out as v1.0.0 built
 *   directly on the repo's default branch (no real per-change branch yet —
 *   see `branchService.ts` / D-9). `firstRelease()` checks are therefore
 *   "every non-declined change is shipped" and "a repository is linked";
 *   there is no earlier version and no branch to merge.
 * - After the first release, each open version's checks add "no open
 *   earlier version" (releases go out in semver order) and "reviewed
 *   branches are mergeable" (`phase_state.build === 'done'`, matching the
 *   prototype's "Reviewed, tests pass, no regressions" state).
 * - `deployment-configured` is reported as a check but never blocks
 *   `canRelease` — deploy is best-effort: skip and report when nothing is
 *   configured (see `DeployTrigger`).
 *
 * GitHub access (merge, tag) and the deploy dispatch are behind small
 * injectable interfaces ({@link ReleaseGitHubClient}, {@link DeployTrigger})
 * so tests can supply mocks instead of hitting api.github.com or the
 * deployment-service action registry.
 */
import type { Request as ExpressRequest, Response as ExpressResponse } from "express";
import { createError, Errors } from "../../middleware/errorHandler";
import { logger } from "../../utils/logger";
import db from "../../utils/database";
import { broadcast } from "../../websocket";
import { gitHubApiHeaders, resolveGitHubToken } from "../../utils/githubAuth";
import { resolveDefaultRepo, type RepoForBranch } from "./branchService";
import * as dockerDeploymentService from "../deployment/docker/dockerDeploymentService";

// ============================================================================
// Public interface (owned by WP-BE1; WP-BE2 supplies the implementation)
// ============================================================================

export interface ReleaseCheck {
  id: string;
  label: string;
  passed: boolean;
  detail?: string;
}

export interface ReleaseChecksResult {
  projectId: string;
  checks: ReleaseCheck[];
  canRelease: boolean;
}

export interface ReleaseResult {
  version: Record<string, unknown>;
  carriedOverWorkItemIds: string[];
}

export interface FirstReleaseResult {
  version: Record<string, unknown>;
  project: Record<string, unknown>;
}

export interface ReleaseService {
  /**
   * Release `versionId` for `projectId`. Enforces the in-order (semver
   * ascending) release rule, carries unfinished work items to the next
   * open version, tags the release, and deploys through existing settings.
   */
  release(projectId: string, versionId: string, actorId?: string): Promise<ReleaseResult>;

  /**
   * First release for `projectId`: runs the first-release checks, tags
   * `v1.0.0`, locks the baseline, and sets `projects.stage = 'released'`.
   */
  firstRelease(projectId: string, actorId?: string): Promise<FirstReleaseResult>;

  /** Checks for the first or next release, without performing it. */
  releaseChecks(projectId: string, versionId?: string): Promise<ReleaseChecksResult>;
}

const NOT_IMPLEMENTED_MESSAGE =
  "Release business logic is owned by WP-BE2 and has not been implemented yet.";

/**
 * Placeholder implementation kept for tests that want to exercise the
 * routes' auth/validation/response-shape wiring without the real business
 * logic (see `__tests__/routes/versions.test.ts`).
 */
export class NotImplementedReleaseService implements ReleaseService {
  async release(): Promise<ReleaseResult> {
    throw createError(501, NOT_IMPLEMENTED_MESSAGE, "NOT_IMPLEMENTED");
  }

  async firstRelease(): Promise<FirstReleaseResult> {
    throw createError(501, NOT_IMPLEMENTED_MESSAGE, "NOT_IMPLEMENTED");
  }

  async releaseChecks(): Promise<ReleaseChecksResult> {
    throw createError(501, NOT_IMPLEMENTED_MESSAGE, "NOT_IMPLEMENTED");
  }
}

// ============================================================================
// Injectable GitHub client (merge + tag)
// ============================================================================

export type MergeOutcome = { sha: string } | { conflict: true; message: string };

export interface ReleaseGitHubClient {
  /** Current commit sha at the tip of `branch`, or null if it doesn't exist. */
  getBranchSha(org: string, repo: string, branch: string, token: string): Promise<string | null>;

  /**
   * Merge `head` into `base` (GitHub's Merges API — a real server-side git
   * merge, not a rebuild-the-tree push). A merge conflict comes back as
   * `{ conflict: true, message }` rather than throwing, so the caller can
   * report exactly which change failed.
   */
  mergeBranch(
    org: string,
    repo: string,
    base: string,
    head: string,
    commitMessage: string,
    token: string
  ): Promise<MergeOutcome>;

  /**
   * Create (or, retrying a previously-failed release, repoint) the
   * lightweight tag `tagName` at `sha`. Idempotent.
   */
  ensureTag(org: string, repo: string, tagName: string, sha: string, token: string): Promise<void>;
}

async function ghFetch(
  path: string,
  token: string,
  options: { method?: string; body?: unknown } = {}
): Promise<Response> {
  const { method = "GET", body } = options;
  return fetch(`https://api.github.com${path}`, {
    method,
    headers: gitHubApiHeaders(token),
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

export const defaultReleaseGitHubClient: ReleaseGitHubClient = {
  async getBranchSha(org, repo, branch, token) {
    const resp = await ghFetch(`/repos/${org}/${repo}/git/refs/heads/${encodeURIComponent(branch)}`, token);
    if (resp.status === 404) return null;
    if (!resp.ok) {
      const body = await resp.text().catch(() => "");
      throw new Error(`Failed to resolve '${branch}' HEAD (${resp.status}): ${body}`);
    }
    const data = (await resp.json()) as any;
    return data?.object?.sha ?? null;
  },

  async mergeBranch(org, repo, base, head, commitMessage, token) {
    const resp = await ghFetch(`/repos/${org}/${repo}/merges`, token, {
      method: "POST",
      body: { base, head, commit_message: commitMessage },
    });
    if (resp.status === 409) {
      return { conflict: true, message: `Merge conflict merging '${head}' into '${base}'` };
    }
    if (resp.status === 204) {
      // Base already contains head — nothing to merge, not a failure.
      const sha = await defaultReleaseGitHubClient.getBranchSha(org, repo, base, token);
      return { sha: sha ?? "" };
    }
    if (!resp.ok) {
      const body = await resp.text().catch(() => "");
      throw new Error(`Failed to merge '${head}' into '${base}' (${resp.status}): ${body}`);
    }
    const data = (await resp.json()) as any;
    return { sha: data.sha };
  },

  async ensureTag(org, repo, tagName, sha, token) {
    const existing = await ghFetch(`/repos/${org}/${repo}/git/refs/tags/${encodeURIComponent(tagName)}`, token);
    if (existing.status === 404) {
      const createResp = await ghFetch(`/repos/${org}/${repo}/git/refs`, token, {
        method: "POST",
        body: { ref: `refs/tags/${tagName}`, sha },
      });
      // 422 "Reference already exists" — a concurrent/retried caller won the race.
      if (!createResp.ok && createResp.status !== 422) {
        const body = await createResp.text().catch(() => "");
        throw new Error(`Failed to create tag '${tagName}' (${createResp.status}): ${body}`);
      }
      return;
    }
    if (!existing.ok) {
      const body = await existing.text().catch(() => "");
      throw new Error(`Failed to look up tag '${tagName}' (${existing.status}): ${body}`);
    }
    // Retrying a previously-failed release attempt: repoint the tag.
    const patchResp = await ghFetch(`/repos/${org}/${repo}/git/refs/tags/${encodeURIComponent(tagName)}`, token, {
      method: "PATCH",
      body: { sha, force: true },
    });
    if (!patchResp.ok) {
      const body = await patchResp.text().catch(() => "");
      throw new Error(`Failed to update tag '${tagName}' (${patchResp.status}): ${body}`);
    }
  },
};

// ============================================================================
// Injectable deploy trigger
// ============================================================================

export interface DeployOutcome {
  triggered: boolean;
  reason: string;
}

export interface DeployTrigger {
  /** Best-effort: never throws. Skips and reports when nothing is configured. */
  deploy(projectId: string, actorId?: string): Promise<DeployOutcome>;
}

/**
 * Reuses the existing Docker deployment-service action registry
 * (`services/deployment/docker/dockerDeploymentService.handle`) by
 * dispatching its `deploy` verb against the project's most recent
 * `project_deployments` row. A project with no deployment configured skips
 * cleanly; any failure from the deploy action is caught and reported
 * rather than failing the release.
 */
export const defaultDeployTrigger: DeployTrigger = {
  async deploy(projectId, actorId) {
    try {
      const { rows } = await db.query(
        `SELECT id FROM project_deployments WHERE project_id = $1 ORDER BY created_at DESC LIMIT 1`,
        [projectId]
      );
      const deployment = rows[0];
      if (!deployment) {
        return { triggered: false, reason: "no-deployment-configured" };
      }

      let statusCode = 200;
      // `actorId` is undefined for a token-only (share-link) release with no
      // `req.user` — this is not an error: `fakeReq.user` is simply left
      // unset, and any failure the deploy action hits for such a caller is
      // reported back as `deploy-service-error*` below rather than
      // attributed to a user.
      const fakeReq = { user: actorId ? { id: actorId } : undefined } as unknown as ExpressRequest;
      const fakeRes = {
        status(code: number) {
          statusCode = code;
          return this;
        },
        json() {
          return this;
        },
      } as unknown as ExpressResponse;

      await dockerDeploymentService.handle(
        fakeReq,
        fakeRes,
        { action: "deploy", deploymentId: deployment.id, shareToken: null },
        async () => null
      );

      if (statusCode >= 400) {
        return { triggered: false, reason: `deploy-service-error-${statusCode}` };
      }
      return { triggered: true, reason: "dispatched" };
    } catch (err: any) {
      logger.warn("[release-service] Deploy trigger failed", {
        project_id: projectId,
        error: err?.message,
      });
      return { triggered: false, reason: `deploy-service-error: ${err?.message ?? "unknown"}` };
    }
  },
};

// ============================================================================
// Semver helpers (mirrors routes/versions.ts's own copy — kept local so
// neither WP has to import across ownership boundaries)
// ============================================================================

const SEMVER_RE = /^v?(\d+)(?:\.(\d+))?(?:\.(\d+))?/i;

type SemverRank = [number, number, number];

function semverRank(name: string | null | undefined): SemverRank {
  const match = SEMVER_RE.exec(name ?? "");
  if (!match) return [0, 0, 0];
  return [Number(match[1] ?? 0), Number(match[2] ?? 0), Number(match[3] ?? 0)];
}

function compareSemverRank(a: SemverRank, b: SemverRank): number {
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return 0;
}

/** `v1.4.2` -> `v1.5.0` (bump minor, reset patch) — the "next" version. */
function bumpMinor(name: string): string {
  const [major, minor] = semverRank(name);
  return `v${major}.${minor + 1}.0`;
}

// ============================================================================
// Row shapes
// ============================================================================

interface VersionRow {
  id: string;
  project_id: string;
  name: string;
  kind: string;
  is_current: boolean;
  [key: string]: unknown;
}

interface WorkItemRow {
  id: string;
  key: string;
  type: string;
  title: string;
  status: string;
  branch: string | null;
  phase_state: Record<string, string> | null;
  [key: string]: unknown;
}

interface ProjectRow {
  id: string;
  stage: string;
  [key: string]: unknown;
}

// ============================================================================
// Shared data access
// ============================================================================

async function loadProject(projectId: string): Promise<ProjectRow> {
  const { rows } = await db.query(`SELECT * FROM projects WHERE id = $1`, [projectId]);
  if (rows.length === 0) throw Errors.notFound("Project");
  return rows[0];
}

async function loadVersion(projectId: string, versionId: string): Promise<VersionRow> {
  const { rows } = await db.query(`SELECT * FROM versions WHERE id = $1 AND project_id = $2`, [
    versionId,
    projectId,
  ]);
  if (rows.length === 0) throw Errors.notFound("Version");
  return rows[0];
}

/** The earliest (semver-ascending) still-open version for a project, if any. */
async function loadNextOpenVersion(projectId: string): Promise<VersionRow | null> {
  const { rows } = await db.query(`SELECT * FROM versions WHERE project_id = $1 AND kind <> 'released'`, [
    projectId,
  ]);
  if (rows.length === 0) return null;
  return [...rows].sort((a, b) => compareSemverRank(semverRank(a.name), semverRank(b.name)))[0];
}

async function loadWorkItemsForVersion(versionId: string): Promise<WorkItemRow[]> {
  const { rows } = await db.query(`SELECT * FROM work_items WHERE version_id = $1`, [versionId]);
  return rows;
}

/** Before the first release, every non-scheduled change belongs to the implicit v1.0.0. */
async function loadWorkItemsForFirstRelease(projectId: string): Promise<WorkItemRow[]> {
  const { rows } = await db.query(
    `SELECT wi.* FROM work_items wi
     LEFT JOIN versions v ON v.id = wi.version_id
     WHERE wi.project_id = $1 AND (wi.version_id IS NULL OR v.kind = 'building')`,
    [projectId]
  );
  return rows;
}

async function hasDeploymentConfigured(projectId: string): Promise<boolean> {
  const { rows } = await db.query(`SELECT 1 FROM project_deployments WHERE project_id = $1 LIMIT 1`, [
    projectId,
  ]);
  return rows.length > 0;
}

/** `Fixed: <title>` for bugs, `New: <title>` for enhancements/features (matches the prototype). */
function draftReleaseNotes(shippedItems: WorkItemRow[]): string {
  if (shippedItems.length === 0) return "No changes shipped in this release.";
  return shippedItems.map((item) => `- ${item.type === "bug" ? "Fixed" : "New"}: ${item.title}`).join("\n");
}

// ============================================================================
// Default implementation
// ============================================================================

export class DefaultReleaseService implements ReleaseService {
  constructor(
    private readonly githubClient: ReleaseGitHubClient = defaultReleaseGitHubClient,
    private readonly deployTrigger: DeployTrigger = defaultDeployTrigger
  ) {}

  async releaseChecks(projectId: string, versionId?: string): Promise<ReleaseChecksResult> {
    const project = await loadProject(projectId);

    let version: VersionRow | null = null;
    if (versionId) {
      version = await loadVersion(projectId, versionId);
    } else if (project.stage !== "building") {
      version = await loadNextOpenVersion(projectId);
    }

    // Post-first-release with nothing open: nothing to check.
    if (!version && project.stage !== "building") {
      return { projectId, checks: [], canRelease: false };
    }

    const isFirstRelease = !version;
    const workItems = version ? await loadWorkItemsForVersion(version.id) : await loadWorkItemsForFirstRelease(projectId);

    const checks: ReleaseCheck[] = [];

    const unresolved = workItems.filter((wi) => wi.status !== "shipped" && wi.status !== "declined");
    checks.push({
      id: "work-items-resolved",
      label: "All changes are shipped or declined",
      passed: unresolved.length === 0,
      detail:
        unresolved.length > 0
          ? `${unresolved.length} change(s) still in progress (${unresolved.map((wi) => wi.key).join(", ")}); unfinished changes carry over automatically`
          : undefined,
    });

    if (!isFirstRelease && version) {
      const shipped = workItems.filter((wi) => wi.status === "shipped");
      const notReviewed = shipped.filter((wi) => wi.branch && wi.phase_state?.build !== "done");
      checks.push({
        id: "branches-reviewed",
        label: "Reviewed branches are mergeable",
        passed: notReviewed.length === 0,
        detail:
          notReviewed.length > 0
            ? `${notReviewed.map((wi) => wi.key).join(", ")} not reviewed yet`
            : undefined,
      });

      const earlier = await findOpenEarlierVersion(projectId, version);
      checks.push({
        id: "no-open-earlier-version",
        label: "Versions release in order",
        passed: !earlier,
        detail: earlier ? `Release ${earlier.name} first` : undefined,
      });
    }

    const repo = await resolveDefaultRepo(projectId);
    checks.push({
      id: "repository-linked",
      label: "A repository is linked for tagging and merges",
      passed: !!repo,
      detail: repo ? undefined : "Link a repository before releasing",
    });

    // Informational only — never gates canRelease. Deploy is best-effort.
    const deploymentConfigured = await hasDeploymentConfigured(projectId);
    checks.push({
      id: "deployment-configured",
      label: "Deployment settings are configured",
      passed: deploymentConfigured,
      detail: deploymentConfigured ? undefined : "No deployment configured — release will skip deploy",
    });

    // "work-items-resolved" only gates the first release (before the first
    // release, there is no next version to carry unfinished items into);
    // for every release after that it is informational, matching its own
    // detail text ("unfinished changes carry over automatically") and
    // data-model.md §1's release rule.
    const canRelease = checks
      .filter((c) => c.id !== "deployment-configured" && !(c.id === "work-items-resolved" && !isFirstRelease))
      .every((c) => c.passed);

    return { projectId, checks, canRelease };
  }

  async release(projectId: string, versionId: string, actorId?: string): Promise<ReleaseResult> {
    const project = await loadProject(projectId);
    if (project.stage !== "released") {
      throw Errors.conflict("Run the first release before releasing subsequent versions");
    }

    const version = await loadVersion(projectId, versionId);
    if (version.kind === "released") {
      throw Errors.conflict(`${version.name} is already released and read-only`);
    }

    const earlier = await findOpenEarlierVersion(projectId, version);
    if (earlier) {
      throw Errors.conflict(`Release ${earlier.name} first — versions release in order`);
    }

    // Enforce every release check (branches-reviewed, repository-linked, ...)
    // before touching GitHub — `firstRelease()` already does this; `release()`
    // must too, so a change whose branch hasn't been reviewed can't be merged
    // out from under the checklist UI.
    const checks = await this.releaseChecks(projectId, versionId);
    // Same exclusions releaseChecks() uses for its own `canRelease`:
    // "deployment-configured" is best-effort/informational, and
    // "work-items-resolved" doesn't gate a non-first release since unfinished
    // items are carried over automatically below.
    const failingChecks = checks.checks.filter(
      (c) => c.id !== "deployment-configured" && c.id !== "work-items-resolved" && !c.passed
    );
    if (failingChecks.length > 0) {
      throw Errors.validation({
        checks: failingChecks.map((c) => ({ id: c.id, label: c.label, detail: c.detail })),
      });
    }

    const workItems = await loadWorkItemsForVersion(version.id);
    const shipped = workItems.filter((wi) => wi.status === "shipped");
    const carry = workItems.filter((wi) => wi.status === "triage" || wi.status === "active");

    const repo = await resolveDefaultRepo(projectId);
    if (!repo) {
      throw Errors.validation({ repo: "No repository is linked to this project; link one before releasing" });
    }
    const resolvedToken = await resolveGitHubToken({ repoId: repo.id, isDefaultRepo: true });
    if (!resolvedToken) {
      throw Errors.validation({ github: "No GitHub token is available to merge and tag this release" });
    }
    const defaultBranch = repo.branch || "main";

    // Merge each shipped change's reviewed branch into the default branch.
    // Any conflict aborts here, before any DB write, so the version stays
    // unreleased and the caller learns exactly which change failed.
    for (const item of shipped) {
      if (!item.branch) continue; // built directly on the default branch (no real branch yet)
      const outcome = await this.githubClient.mergeBranch(
        repo.organization,
        repo.repo,
        defaultBranch,
        item.branch,
        `Merge ${item.key}: ${item.title} (${version.name})`,
        resolvedToken.token
      );
      if ("conflict" in outcome) {
        throw createError(
          409,
          `Merge conflict on ${item.key} (${item.branch}); resolve it and release ${version.name} again.`,
          "MERGE_CONFLICT",
          { workItemId: item.id, workItemKey: item.key, branch: item.branch }
        );
      }
    }

    const headSha = await this.githubClient.getBranchSha(repo.organization, repo.repo, defaultBranch, resolvedToken.token);
    if (!headSha) {
      throw new Error(`Could not resolve '${defaultBranch}' HEAD to tag ${version.name}`);
    }
    await this.githubClient.ensureTag(repo.organization, repo.repo, version.name, headSha, resolvedToken.token);

    const releaseNotes = draftReleaseNotes(shipped);

    const { updatedVersion, nextVersion } = await db.transaction(async (client: any) => {
      // Concurrency guard (same convention as routes/workItems.ts's
      // createWorkItemWithKey): a transaction-scoped advisory lock keyed by
      // the project id serializes concurrent release() calls for the same
      // project. Two callers can both pass the checks above (plain,
      // unlocked reads) and both merge/tag on GitHub before either writes
      // here; only one of them proceeds past this point, the other blocks
      // until it commits, then re-reads the now-released version under
      // `FOR UPDATE` and fails cleanly instead of double-releasing.
      //
      // The two-key form (fix round 2, item 5) namespaces this lock under
      // the 'release' domain — hashtext($1) alone would collide with any
      // other advisory lock keyed by the same project id for an unrelated
      // purpose (e.g. workItems.ts's 'work_item_key' domain), since
      // Postgres advisory locks share one global keyspace.
      await client.query("SELECT pg_advisory_xact_lock(hashtext('release'), hashtext($1))", [projectId]);

      const { rows: lockedVersionRows } = await client.query(
        `SELECT kind FROM versions WHERE id = $1 AND project_id = $2 FOR UPDATE`,
        [version.id, projectId]
      );
      if (lockedVersionRows.length === 0) {
        throw Errors.notFound("Version");
      }
      if (lockedVersionRows[0].kind === "released") {
        throw Errors.conflict(`${version.name} is already released and read-only`);
      }

      const { rows: lockedProjectRows } = await client.query(
        `SELECT stage FROM projects WHERE id = $1 FOR UPDATE`,
        [projectId]
      );
      if (lockedProjectRows[0]?.stage !== "released") {
        throw Errors.conflict("Run the first release before releasing subsequent versions");
      }

      let next: VersionRow | null = null;
      if (carry.length > 0) {
        const bumpedName = bumpMinor(version.name);
        // Look up the bumped name regardless of kind: a version with that
        // name may already exist (e.g. a "planned" version created by hand,
        // or one a concurrent release() just carried over into) and must be
        // reused rather than colliding with UNIQUE(project_id, name).
        const { rows: nextRows } = await client.query(
          `SELECT * FROM versions WHERE project_id = $1 AND name = $2`,
          [projectId, bumpedName]
        );
        next = nextRows[0] ?? null;
        if (!next) {
          try {
            const { rows: createdRows } = await client.query(
              `INSERT INTO versions (project_id, name, kind) VALUES ($1, $2, 'next') RETURNING *`,
              [projectId, bumpedName]
            );
            next = createdRows[0];
          } catch (err: any) {
            if (err?.code === "23505") {
              // Lost the race to create it — reuse the row the winner made.
              const { rows: raceRows } = await client.query(
                `SELECT * FROM versions WHERE project_id = $1 AND name = $2`,
                [projectId, bumpedName]
              );
              next = raceRows[0] ?? null;
              if (!next) {
                throw Errors.conflict(`Version "${bumpedName}" already exists for this project`);
              }
            } else {
              throw err;
            }
          }
        }
        await client.query(`UPDATE work_items SET version_id = $2, updated_at = NOW() WHERE id = ANY($1)`, [
          carry.map((wi) => wi.id),
          next!.id,
        ]);
      }

      await client.query(`UPDATE versions SET is_current = false WHERE project_id = $1 AND is_current = true`, [
        projectId,
      ]);
      const { rows } = await client.query(
        `UPDATE versions
         SET kind = 'released', is_current = true, released_at = NOW(), released_by = $2,
             release_notes = $3, git_tag = $4, updated_at = NOW()
         WHERE id = $1
         RETURNING *`,
        [version.id, actorId || null, releaseNotes, version.name]
      );
      return { updatedVersion: rows[0], nextVersion: next };
    });

    for (const item of carry) {
      broadcast(`versions-${projectId}`, "item_moved", { ...item, version_id: nextVersion?.id ?? null });
    }

    // `versions-{projectId}` "version_released" is broadcast by
    // routes/versions.ts after this call returns — not duplicated here.
    const deploy = await this.deployTrigger.deploy(projectId, actorId);

    return {
      version: { ...updatedVersion, deployTriggered: deploy.triggered, deployReason: deploy.reason },
      carriedOverWorkItemIds: carry.map((wi) => wi.id),
    };
  }

  async firstRelease(projectId: string, actorId?: string): Promise<FirstReleaseResult> {
    const project = await loadProject(projectId);
    if (project.stage === "released") {
      throw Errors.conflict("This project already had its first release");
    }

    const checks = await this.releaseChecks(projectId);
    const failing = checks.checks.filter((c) => c.id !== "deployment-configured" && !c.passed);
    if (failing.length > 0) {
      throw Errors.validation({
        checks: failing.map((c) => ({ id: c.id, label: c.label, detail: c.detail })),
      });
    }

    const repo = await resolveDefaultRepo(projectId);
    if (!repo) {
      // Already covered by releaseChecks(), but guard defensively.
      throw Errors.validation({ repo: "No repository is linked to this project; link one before releasing" });
    }
    const resolvedToken = await resolveGitHubToken({ repoId: repo.id, isDefaultRepo: true });
    if (!resolvedToken) {
      throw Errors.validation({ github: "No GitHub token is available to tag this release" });
    }
    const defaultBranch = repo.branch || "main";

    const headSha = await this.githubClient.getBranchSha(repo.organization, repo.repo, defaultBranch, resolvedToken.token);
    if (!headSha) {
      throw new Error(`Could not resolve '${defaultBranch}' HEAD to tag v1.0.0`);
    }
    await this.githubClient.ensureTag(repo.organization, repo.repo, "v1.0.0", headSha, resolvedToken.token);

    const workItems = await loadWorkItemsForFirstRelease(projectId);
    const shipped = workItems.filter((wi) => wi.status === "shipped");
    const releaseNotes = draftReleaseNotes(shipped);

    const { versionRow, projectRow } = await db.transaction(async (client: any) => {
      // Concurrency guard: see release()'s identical lock for why — two
      // concurrent first-release calls could otherwise both pass the
      // `project.stage !== "released"` check above and both tag/flip stage.
      await client.query("SELECT pg_advisory_xact_lock(hashtext('release'), hashtext($1))", [projectId]);

      const { rows: lockedProjectRows } = await client.query(
        `SELECT stage FROM projects WHERE id = $1 FOR UPDATE`,
        [projectId]
      );
      if (lockedProjectRows[0]?.stage === "released") {
        throw Errors.conflict("This project already had its first release");
      }

      const { rows: buildingRows } = await client.query(
        `SELECT * FROM versions WHERE project_id = $1 AND kind = 'building' ORDER BY created_at ASC LIMIT 1`,
        [projectId]
      );
      let version: VersionRow = buildingRows[0];
      if (!version) {
        const { rows: createdRows } = await client.query(
          `INSERT INTO versions (project_id, name, kind) VALUES ($1, 'v1.0.0', 'building') RETURNING *`,
          [projectId]
        );
        version = createdRows[0];
      }

      await client.query(`UPDATE versions SET is_current = false WHERE project_id = $1 AND is_current = true`, [
        projectId,
      ]);
      const { rows: releasedRows } = await client.query(
        `UPDATE versions
         SET kind = 'released', is_first_release = true, is_current = true, released_at = NOW(),
             released_by = $2, release_notes = $3, git_tag = 'v1.0.0', updated_at = NOW()
         WHERE id = $1
         RETURNING *`,
        [version.id, actorId || null, releaseNotes]
      );
      const { rows: projectRows } = await client.query(
        `UPDATE projects SET stage = 'released', updated_at = NOW() WHERE id = $1 RETURNING *`,
        [projectId]
      );
      return { versionRow: releasedRows[0], projectRow: projectRows[0] };
    });

    // `versions-{projectId}` "version_released" is broadcast by
    // routes/versions.ts after this call returns — not duplicated here.
    const deploy = await this.deployTrigger.deploy(projectId, actorId);

    return {
      version: { ...versionRow, deployTriggered: deploy.triggered, deployReason: deploy.reason },
      project: projectRow,
    };
  }
}

/** The lowest-semver still-open version *other than* `version`, if it ranks before it. */
async function findOpenEarlierVersion(projectId: string, version: VersionRow): Promise<VersionRow | null> {
  const { rows } = await db.query(
    `SELECT * FROM versions WHERE project_id = $1 AND kind <> 'released' AND id <> $2`,
    [projectId, version.id]
  );
  const targetRank = semverRank(version.name);
  const earlier = rows.filter((v: VersionRow) => compareSemverRank(semverRank(v.name), targetRank) < 0);
  if (earlier.length === 0) return null;
  return earlier.sort((a: VersionRow, b: VersionRow) => compareSemverRank(semverRank(a.name), semverRank(b.name)))[0];
}

// ============================================================================
// Module-level singleton the routes call through
// ============================================================================

/**
 * Module-level singleton the routes call through. Defaults to the real
 * implementation; swappable for tests via {@link setReleaseService}.
 */
export let releaseService: ReleaseService = new DefaultReleaseService();

/** Test/DI hook: swap the singleton implementation. */
export function setReleaseService(service: ReleaseService): void {
  releaseService = service;
}
