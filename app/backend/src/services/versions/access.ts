/**
 * Project access authorization for the B1 (versions/work-items) routes.
 *
 * Mirrors the `authorize_project_access` RPC (see `routes/rpc.ts`): an
 * authenticated user who created the project is the "owner"; anyone else
 * needs a valid, unexpired `project_tokens` row for the project, whose role
 * (`owner` | `editor` | `viewer`) is returned as-is. `viewer` is read-only.
 */
import db from "../../utils/database";
import { Errors } from "../../middleware/errorHandler";

export type ProjectRole = "owner" | "editor" | "viewer";

export interface ProjectAccess {
  projectExists: boolean;
  role: ProjectRole | null;
}

/**
 * Look up whether `userId` and/or `token` grant access to `projectId`.
 * Does not throw — callers combine this with {@link requireAccess} once
 * they know whether the endpoint is read-only or mutating.
 */
export async function checkProjectAccess(
  projectId: string,
  userId: string | undefined,
  token: string | undefined
): Promise<ProjectAccess> {
  const projectResult = await db.query(
    "SELECT created_by FROM projects WHERE id = $1",
    [projectId]
  );
  if (projectResult.rows.length === 0) {
    return { projectExists: false, role: null };
  }

  if (userId && projectResult.rows[0].created_by === userId) {
    return { projectExists: true, role: "owner" };
  }

  if (!token) {
    return { projectExists: true, role: null };
  }

  const tokenResult = await db.query(
    "SELECT role FROM project_tokens WHERE project_id = $1 AND token = $2 AND (expires_at IS NULL OR expires_at > NOW())",
    [projectId, token]
  );
  if (tokenResult.rows.length === 0) {
    return { projectExists: true, role: null };
  }
  return { projectExists: true, role: tokenResult.rows[0].role as ProjectRole };
}

/**
 * Enforce access: 404 when the project doesn't exist, 403 when neither the
 * user nor the token grant access, 403 when the caller only has `viewer`
 * but the endpoint mutates state. Returns the resolved role otherwise.
 */
export function requireAccess(
  access: ProjectAccess,
  opts: { mutating?: boolean } = {}
): ProjectRole {
  if (!access.projectExists) {
    throw Errors.notFound("Project");
  }
  if (!access.role) {
    throw Errors.forbidden("Access denied");
  }
  if (opts.mutating && access.role === "viewer") {
    throw Errors.forbidden("Viewer role is read-only");
  }
  return access.role;
}

/** Convenience: check + require in one call for the common case. */
export async function authorizeProject(
  projectId: string,
  userId: string | undefined,
  token: string | undefined,
  opts: { mutating?: boolean } = {}
): Promise<ProjectRole> {
  const access = await checkProjectAccess(projectId, userId, token);
  return requireAccess(access, opts);
}

/** Extract the `?token=` query param as a plain string, if present. */
export function tokenFromQuery(token: unknown): string | undefined {
  if (typeof token === "string" && token.length > 0) return token;
  return undefined;
}
