/**
 * Shared authorization helpers for the teams / applications / assurance-mesh
 * routes (spec 007, epic B2).
 *
 * Roles (research D-8):
 *  - Organization admins (`public.user_roles.role = 'admin'`) see every team
 *    in their organization and set org-level policy.
 *  - Team `owner`s manage members and applications, and can tighten their
 *    team's mesh policy.
 *  - Team `member`s see and act on their team's applications.
 *
 * `req.user.id` is the auth identity (auth.users.id / Azure AD oid). Teams
 * reference `public.profiles(id)`, so most checks first resolve the caller's
 * profile id.
 */
import db from "../../utils/database";

export type TeamRole = "owner" | "member";

/** Resolve the caller's `profiles.id` from their auth user id, or null. */
export async function getProfileId(userId: string): Promise<string | null> {
  const { rows } = await db.query(
    `SELECT id FROM public.profiles WHERE user_id = $1`,
    [userId]
  );
  return rows[0]?.id ?? null;
}

/** The caller's organization id (from their profile), or null. */
export async function getUserOrgId(userId: string): Promise<string | null> {
  const { rows } = await db.query(
    `SELECT org_id FROM public.profiles WHERE user_id = $1`,
    [userId]
  );
  return rows[0]?.org_id ?? null;
}

/** Whether the caller holds the organization-wide `admin` role. */
export async function isOrgAdmin(userId: string): Promise<boolean> {
  const { rows } = await db.query(
    `SELECT 1 FROM public.user_roles WHERE user_id = $1 AND role = 'admin'::public.app_role LIMIT 1`,
    [userId]
  );
  return rows.length > 0;
}

/** The caller's role on a team (by profile id), or null if not a member. */
export async function getTeamRole(profileId: string, teamId: string): Promise<TeamRole | null> {
  const { rows } = await db.query(
    `SELECT role FROM public.team_members WHERE team_id = $1 AND user_id = $2`,
    [teamId, profileId]
  );
  return rows[0]?.role ?? null;
}

/** The organization a team belongs to, or null if the team doesn't exist. */
export async function getTeamOrgId(teamId: string): Promise<string | null> {
  const { rows } = await db.query(
    `SELECT organization_id FROM public.teams WHERE id = $1`,
    [teamId]
  );
  return rows[0]?.organization_id ?? null;
}

export interface TeamAccess {
  /** Team exists. */
  found: boolean;
  /** Caller is a member (owner|member) of the team, or an org admin for it. */
  authorized: boolean;
  role: TeamRole | null;
  isOrgAdmin: boolean;
  organizationId: string | null;
}

/**
 * Combined existence + authorization check for a team: members of the team
 * or organization admins for the team's organization may access it.
 */
export async function checkTeamAccess(userId: string, teamId: string): Promise<TeamAccess> {
  const organizationId = await getTeamOrgId(teamId);
  if (!organizationId) {
    return { found: false, authorized: false, role: null, isOrgAdmin: false, organizationId: null };
  }

  const [profileId, userOrgId, admin] = await Promise.all([
    getProfileId(userId),
    getUserOrgId(userId),
    isOrgAdmin(userId),
  ]);

  const orgAdminForTeam = admin && userOrgId === organizationId;
  const role = profileId ? await getTeamRole(profileId, teamId) : null;

  return {
    found: true,
    authorized: Boolean(role) || orgAdminForTeam,
    role,
    isOrgAdmin: orgAdminForTeam,
    organizationId,
  };
}

export interface ApplicationAccess {
  found: boolean;
  authorized: boolean;
  teamId: string | null;
  role: TeamRole | null;
  isOrgAdmin: boolean;
}

/**
 * Combined existence + authorization check for an application: access
 * follows the owning team (members of the team, or organization admins for
 * the team's organization).
 */
export async function checkApplicationAccess(userId: string, applicationId: string): Promise<ApplicationAccess> {
  const { rows } = await db.query(
    `SELECT team_id FROM public.applications WHERE id = $1`,
    [applicationId]
  );
  const teamId = rows[0]?.team_id ?? null;
  if (!teamId) {
    return { found: false, authorized: false, teamId: null, role: null, isOrgAdmin: false };
  }

  const teamAccess = await checkTeamAccess(userId, teamId);
  return {
    found: true,
    authorized: teamAccess.authorized,
    teamId,
    role: teamAccess.role,
    isOrgAdmin: teamAccess.isOrgAdmin,
  };
}
