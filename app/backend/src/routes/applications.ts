/**
 * Applications Routes (spec 007, epic B2 — Option B)
 *
 * GET /applications/:appId - repositories, pack adoption, exceptions.
 */
import { Router, Request, Response } from "express";
import { Errors } from "../middleware/errorHandler";
import db from "../utils/database";
import { checkApplicationAccess } from "../services/teams/authorization";

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

export default router;
