/**
 * Applications Routes (spec 007, epic B2 — Option B)
 *
 * GET  /applications/:appId            - repositories, pack adoption, exceptions.
 * GET  /applications/:appId/runs       - mesh runs on PRs to the default branch, grouped by day (T122).
 * POST /applications/:appId/update-prs - open update PRs that bump the pinned pack (T123).
 */
import { Router, Request, Response } from "express";
import { Errors } from "../middleware/errorHandler";
import db from "../utils/database";
import { logger } from "../utils/logger";
import { broadcast } from "../websocket";
import { checkApplicationAccess } from "../services/teams/authorization";
import { openUpdatePr, RepoToUpdate, UpdatePrResult } from "../services/github/updatePrs";

const router = Router();

/**
 * GET /applications/:appId
 * Members of the owning team, or organization admins for that team's
 * organization (403 for anyone else, 404 if the application doesn't exist).
 */
router.get("/:appId", async (req: Request, res: Response) => {
  const userId = req.user?.id;
  if (!userId) throw Errors.unauthorized();

  const { appId } = req.params;
  const access = await checkApplicationAccess(userId, appId);
  if (!access.found) throw Errors.notFound("Application");
  if (!access.authorized) throw Errors.forbidden("Not a member of this application's team");

  const { rows: appRows } = await db.query(
    `SELECT id, team_id, name, owner_label, onboarded_at, created_at, updated_at
     FROM public.applications WHERE id = $1`,
    [appId]
  );
  const application = appRows[0];
  if (!application) throw Errors.notFound("Application");

  const { rows: repoRows } = await db.query(
    `SELECT id, provider, full_name, default_branch, ci_provider, profile, stack_label,
            part, build_command, pinned_pack, update_pr_number, update_pr_state,
            last_report_at
     FROM public.application_repositories
     WHERE application_id = $1
     ORDER BY full_name`,
    [appId]
  );

  const { rows: latestPackRows } = await db.query(
    `SELECT version FROM public.standards_packs ORDER BY published_at DESC LIMIT 1`
  );
  const latestPackVersion: string | null = latestPackRows[0]?.version ?? null;

  const totalRepos = repoRows.length;
  const onLatest = latestPackVersion
    ? repoRows.filter((r: any) => r.pinned_pack === latestPackVersion).length
    : 0;
  const adoption = totalRepos > 0 ? onLatest / totalRepos : null;

  const { rows: exceptionRows } = await db.query(
    `SELECT me.id, me.repository_id, me.rule, me.reason, me.approved_by, me.expires_at, me.created_at
     FROM public.mesh_exceptions me
     JOIN public.application_repositories ar ON ar.id = me.repository_id
     WHERE ar.application_id = $1
     ORDER BY me.expires_at`,
    [appId]
  );

  res.json({
    ...application,
    repositories: repoRows,
    adoption: {
      latestPackVersion,
      reposOnLatest: onLatest,
      totalRepos,
      ratio: adoption,
    },
    exceptions: exceptionRows,
  });
});

/**
 * GET /applications/:appId/runs?days=7
 * Mesh runs on PRs to the default branch, grouped by day (open and merged
 * only — a closed-unmerged PR isn't evidence of anything and is omitted).
 * Members of the owning team, or organization admins for that team's
 * organization.
 */
router.get("/:appId/runs", async (req: Request, res: Response) => {
  const userId = req.user?.id;
  if (!userId) throw Errors.unauthorized();

  const { appId } = req.params;
  const access = await checkApplicationAccess(userId, appId);
  if (!access.found) throw Errors.notFound("Application");
  if (!access.authorized) throw Errors.forbidden("Not a member of this application's team");

  const daysParam = Number.parseInt(String(req.query.days ?? "7"), 10);
  const days = Number.isFinite(daysParam) && daysParam > 0 && daysParam <= 90 ? daysParam : 7;

  const { rows } = await db.query(
    `SELECT mr.id, mr.repository_id, ar.full_name AS repository_full_name, mr.commit_sha,
            mr.pr_number, mr.pr_state, mr.trigger, mr.pack_version, mr.verdicts,
            mr.new_findings, mr.asvs_passed, mr.alberta_passed, mr.report_url, mr.received_at,
            date_trunc('day', mr.received_at) AS day
     FROM public.mesh_runs mr
     JOIN public.application_repositories ar ON ar.id = mr.repository_id
     WHERE ar.application_id = $1
       AND mr.received_at >= now() - ($2 || ' days')::interval
       AND mr.pr_state IN ('open', 'merged')
     ORDER BY mr.received_at DESC`,
    [appId, days],
  );

  const byDay = new Map<string, any[]>();
  for (const row of rows) {
    const key = new Date(row.day).toISOString().slice(0, 10);
    const list = byDay.get(key) || [];
    const { day, ...run } = row;
    list.push(run);
    byDay.set(key, list);
  }

  res.json({
    appId,
    days,
    runsByDay: [...byDay.entries()]
      .sort((a, b) => (a[0] < b[0] ? 1 : -1))
      .map(([day, runs]) => ({ day, runs })),
  });
});

/**
 * POST /applications/:appId/update-prs
 * Open update PRs bumping the pinned Standards pack (T123). Body:
 * `{ repositoryIds?: string[], group?: string, packVersion?: string }` —
 * `group` selects every repository whose `part` matches (e.g. "APIs");
 * omitting both selects every repository in the application. Defaults to
 * the latest published pack. Team owners/members of the app's team only.
 */
router.post("/:appId/update-prs", async (req: Request, res: Response) => {
  const userId = req.user?.id;
  if (!userId) throw Errors.unauthorized();

  const { appId } = req.params;
  const access = await checkApplicationAccess(userId, appId);
  if (!access.found) throw Errors.notFound("Application");
  if (!access.authorized) throw Errors.forbidden("Not a member of this application's team");

  const { repositoryIds, group, packVersion } = req.body || {};
  if (repositoryIds !== undefined && !Array.isArray(repositoryIds)) {
    throw Errors.badRequest("repositoryIds must be an array of repository ids");
  }

  let targetPackVersion = packVersion;
  let workflowRef: string | undefined;
  if (!targetPackVersion) {
    const { rows: latestPackRows } = await db.query(
      `SELECT version, workflow_ref FROM public.standards_packs ORDER BY published_at DESC LIMIT 1`,
    );
    if (!latestPackRows[0]) throw Errors.badRequest("No published standards pack to update to");
    targetPackVersion = latestPackRows[0].version;
    workflowRef = latestPackRows[0].workflow_ref;
  } else {
    const { rows: packRows } = await db.query(
      `SELECT workflow_ref FROM public.standards_packs WHERE version = $1`,
      [targetPackVersion],
    );
    if (!packRows[0]) throw Errors.badRequest(`Unknown pack version: ${targetPackVersion}`);
    workflowRef = packRows[0].workflow_ref;
  }

  const conditions = ["application_id = $1"];
  const params: any[] = [appId];
  if (repositoryIds && repositoryIds.length > 0) {
    params.push(repositoryIds);
    conditions.push(`id = ANY($${params.length})`);
  } else if (group) {
    params.push(group);
    conditions.push(`part = $${params.length}`);
  }

  const { rows: repoRows } = await db.query(
    `SELECT id, provider, full_name, default_branch, ci_provider, pinned_pack
     FROM public.application_repositories
     WHERE ${conditions.join(" AND ")}`,
    params,
  );
  if (repoRows.length === 0) {
    throw Errors.badRequest("No matching repositories for this application");
  }

  const results: UpdatePrResult[] = [];
  for (const row of repoRows) {
    const repo: RepoToUpdate = {
      id: row.id,
      fullName: row.full_name,
      provider: row.provider,
      ciProvider: row.ci_provider,
      defaultBranch: row.default_branch,
      pinnedPack: row.pinned_pack,
    };
    try {
      const result = await openUpdatePr(repo, { packVersion: targetPackVersion, workflowRef: workflowRef || "" });
      if (result.opened && result.prNumber) {
        await db.query(
          `UPDATE public.application_repositories SET update_pr_number = $1, update_pr_state = 'open' WHERE id = $2`,
          [result.prNumber, repo.id],
        );
      }
      results.push(result);
    } catch (err: any) {
      logger.error(`[applications] update-prs failed for ${repo.fullName}: ${err?.message}`);
      results.push({ repositoryId: repo.id, opened: false, reason: err?.message || "Unknown error" });
    }
  }

  if (access.teamId) {
    broadcast(`team-${access.teamId}`, "pr_state_changed", {
      teamId: access.teamId,
      applicationId: appId,
      results: results.map((r) => ({ repositoryId: r.repositoryId, opened: r.opened })),
    });
  }

  res.status(207).json({ packVersion: targetPackVersion, results });
});

export default router;
