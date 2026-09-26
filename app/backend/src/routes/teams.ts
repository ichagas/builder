/**
 * Teams Routes (spec 007, epic B2 — Option B)
 *
 * GET /teams/mine                    - teams the caller belongs to (switcher)
 * GET /teams                         - all teams in the caller's organization (org admins only)
 * GET /teams/:teamId/portfolio       - applications + repositories + totals, one query
 */
import { Router, Request, Response } from "express";
import { Errors } from "../middleware/errorHandler";
import db from "../utils/database";
import {
  getProfileId,
  getUserOrgId,
  isOrgAdmin,
  checkTeamAccess,
} from "../services/teams/authorization";

const router = Router();

/**
 * GET /teams/mine
 * Teams the authenticated user is a member of, with their role.
 */
router.get("/mine", async (req: Request, res: Response) => {
  const userId = req.user?.id;
  if (!userId) throw Errors.unauthorized();

  const profileId = await getProfileId(userId);
  if (!profileId) return res.json([]);

  const { rows } = await db.query(
    `SELECT t.id, t.name, t.organization_id, tm.role
     FROM public.team_members tm
     JOIN public.teams t ON t.id = tm.team_id
     WHERE tm.user_id = $1
     ORDER BY t.name`,
    [profileId]
  );

  return res.json(rows);
});

/**
 * GET /teams
 * All teams in the caller's organization. Organization admins only (D-8).
 */
router.get("/", async (req: Request, res: Response) => {
  const userId = req.user?.id;
  if (!userId) throw Errors.unauthorized();

  const admin = await isOrgAdmin(userId);
  if (!admin) throw Errors.forbidden("Organization admin role required");

  const orgId = await getUserOrgId(userId);
  if (!orgId) return res.json([]);

  const { rows } = await db.query(
    `SELECT t.id, t.name, t.organization_id,
            (SELECT count(*) FROM public.team_members WHERE team_id = t.id) AS member_count,
            (SELECT count(*) FROM public.applications WHERE team_id = t.id) AS application_count
     FROM public.teams t
     WHERE t.organization_id = $1
     ORDER BY t.name`,
    [orgId]
  );

  return res.json(rows);
});

/**
 * GET /teams/:teamId/portfolio
 * Applications, their repositories and portfolio totals in one query.
 * Members of the team, or organization admins for the team's organization.
 */
router.get("/:teamId/portfolio", async (req: Request, res: Response) => {
  const userId = req.user?.id;
  if (!userId) throw Errors.unauthorized();

  const { teamId } = req.params;
  const access = await checkTeamAccess(userId, teamId);
  if (!access.found) throw Errors.notFound("Team");
  if (!access.authorized) throw Errors.forbidden("Not a member of this team");

  // Single aggregate query: applications for the team, each with its
  // repositories (including a per-repo "not reporting" flag), plus rolled-up
  // totals for the portfolio header.
  const { rows } = await db.query(
    `WITH repo_rows AS (
       SELECT
         ar.application_id,
         jsonb_build_object(
           'id', ar.id,
           'provider', ar.provider,
           'full_name', ar.full_name,
           'default_branch', ar.default_branch,
           'ci_provider', ar.ci_provider,
           'profile', ar.profile,
           'stack_label', ar.stack_label,
           'part', ar.part,
           'pinned_pack', ar.pinned_pack,
           'update_pr_number', ar.update_pr_number,
           'update_pr_state', ar.update_pr_state,
           'last_report_at', ar.last_report_at,
           'not_reporting', (
             a.onboarded_at IS NOT NULL
             AND (ar.last_report_at IS NULL OR ar.last_report_at < now() - interval '7 days')
           )
         ) AS repo,
         (
           a.onboarded_at IS NOT NULL
           AND (ar.last_report_at IS NULL OR ar.last_report_at < now() - interval '7 days')
         ) AS is_not_reporting
       FROM public.application_repositories ar
       JOIN public.applications a ON a.id = ar.application_id
       WHERE a.team_id = $1
     ),
     app_rows AS (
       SELECT
         a.id,
         a.name,
         a.owner_label,
         a.onboarded_at,
         COALESCE(jsonb_agg(rr.repo) FILTER (WHERE rr.repo IS NOT NULL), '[]'::jsonb) AS repositories,
         COUNT(rr.repo) AS repository_count,
         COUNT(rr.repo) FILTER (WHERE rr.is_not_reporting) AS not_reporting_count
       FROM public.applications a
       LEFT JOIN repo_rows rr ON rr.application_id = a.id
       WHERE a.team_id = $1
       GROUP BY a.id
     )
     SELECT
       COALESCE(
         (SELECT jsonb_agg(
             jsonb_build_object(
               'id', ar2.id,
               'name', ar2.name,
               'owner_label', ar2.owner_label,
               'onboarded_at', ar2.onboarded_at,
               'repositories', ar2.repositories,
               'repository_count', ar2.repository_count,
               'not_reporting_count', ar2.not_reporting_count
             ) ORDER BY ar2.name
           )
          FROM app_rows ar2),
         '[]'::jsonb
       ) AS applications,
       (SELECT COUNT(*) FROM app_rows) AS total_applications,
       (SELECT COALESCE(SUM(repository_count), 0) FROM app_rows) AS total_repositories,
       (SELECT COALESCE(SUM(not_reporting_count), 0) FROM app_rows) AS total_not_reporting`,
    [teamId]
  );

  const row = rows[0] || { applications: [], total_applications: 0, total_repositories: 0, total_not_reporting: 0 };

  res.json({
    teamId,
    applications: row.applications,
    totals: {
      applications: Number(row.total_applications) || 0,
      repositories: Number(row.total_repositories) || 0,
      notReporting: Number(row.total_not_reporting) || 0,
    },
  });
});

export default router;
