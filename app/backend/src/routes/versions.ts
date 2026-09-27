/**
 * Versions Routes - Version timeline for Builder projects (Epic B1)
 *
 * Mounted at `/projects` in `routes/v1/index.ts`. Auth: authenticated user
 * (project owner) OR `?token=` authorized through the same
 * `authorize_project_access` rule the RPCs use (see
 * `services/versions/access.ts`). `viewer` tokens are read-only.
 *
 * The release / first-release / release-checks business logic belongs to
 * WP-BE2 (`services/versions/releaseService.ts`); this file only validates
 * input, authorizes, and delegates.
 *
 * @swagger
 * tags:
 *   name: Versions
 *   description: Version timeline and releases for a Builder project
 */
import { Router, Request, Response } from "express";
import { Errors } from "../middleware/errorHandler";
import db from "../utils/database";
import { broadcast } from "../websocket";
import { authorizeProject, tokenFromQuery } from "../services/versions/access";
import { releaseService } from "../services/versions/releaseService";

const router = Router();

const CREATABLE_VERSION_KINDS = ["hotfix", "planned"] as const;

/** Matches an optional leading `v`, then up to three dot-separated numeric parts. */
const SEMVER_RE = /^v?(\d+)(?:\.(\d+))?(?:\.(\d+))?/i;

/**
 * Parse `name` (e.g. `v1.4.3`, `1.4`, `v2`) into a `[major, minor, patch]`
 * sort key. Anything that doesn't start with a recognizable numeric version
 * (e.g. a free-form label) sorts as `[0, 0, 0]`, i.e. first/oldest.
 */
function semverSortKey(name: string | null | undefined): [number, number, number] {
  const match = SEMVER_RE.exec(name ?? "");
  if (!match) return [0, 0, 0];
  return [Number(match[1] ?? 0), Number(match[2] ?? 0), Number(match[3] ?? 0)];
}

/**
 * Releases go out in semver-ascending order (data-model.md §1 "Rules").
 * `name` isn't guaranteed to be strictly numeric/well-formed, so we sort in
 * application code by parsed `[major, minor, patch]`, falling back to
 * `created_at` ascending as a stable tiebreak (equal or unparsable names).
 */
function compareVersionsBySemver(a: { name: string; created_at: string | Date }, b: { name: string; created_at: string | Date }): number {
  const [aMajor, aMinor, aPatch] = semverSortKey(a.name);
  const [bMajor, bMinor, bPatch] = semverSortKey(b.name);
  if (aMajor !== bMajor) return aMajor - bMajor;
  if (aMinor !== bMinor) return aMinor - bMinor;
  if (aPatch !== bPatch) return aPatch - bPatch;
  return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
}

/**
 * @swagger
 * /projects/{projectId}/versions:
 *   get:
 *     summary: Version timeline (with work-item counts)
 *     tags: [Versions]
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema: { type: string, format: uuid }
 *       - in: query
 *         name: token
 *         schema: { type: string }
 *         description: Share token (viewer/editor/owner)
 *     responses:
 *       200: { description: Versions with counts }
 *       403: { $ref: '#/components/responses/Unauthorized' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.get("/:projectId/versions", async (req: Request, res: Response) => {
  const { projectId } = req.params;
  const token = tokenFromQuery(req.query.token);
  await authorizeProject(projectId, req.user?.id, token);

  const { rows } = await db.query(
    `SELECT v.*,
       COUNT(wi.id) FILTER (WHERE wi.status <> 'declined') AS work_item_count,
       COUNT(wi.id) FILTER (WHERE wi.status = 'active') AS active_work_item_count
     FROM versions v
     LEFT JOIN work_items wi ON wi.version_id = v.id
     WHERE v.project_id = $1
     GROUP BY v.id
     ORDER BY v.created_at ASC`,
    [projectId]
  );
  // Releases go out in semver-ascending order (data-model.md §1); re-sort
  // by parsed semver here since `name` isn't a SQL-sortable numeric type.
  res.json([...rows].sort(compareVersionsBySemver));
});

/**
 * @swagger
 * /projects/{projectId}/versions:
 *   post:
 *     summary: Create a hotfix or planned version
 *     tags: [Versions]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, kind]
 *             properties:
 *               name: { type: string, example: v1.4.3 }
 *               kind: { type: string, enum: [hotfix, planned] }
 *     responses:
 *       201: { description: Version created }
 *       422: { description: Validation error }
 */
router.post("/:projectId/versions", async (req: Request, res: Response) => {
  const { projectId } = req.params;
  const token = tokenFromQuery(req.query.token);
  await authorizeProject(projectId, req.user?.id, token, { mutating: true });

  const { name, kind } = req.body ?? {};
  if (typeof name !== "string" || name.trim().length === 0) {
    throw Errors.validation({ name: "name is required" });
  }
  if (!CREATABLE_VERSION_KINDS.includes(kind)) {
    throw Errors.validation({
      kind: `kind must be one of: ${CREATABLE_VERSION_KINDS.join(", ")}`,
    });
  }

  let rows;
  try {
    ({ rows } = await db.query(
      `INSERT INTO versions (project_id, name, kind) VALUES ($1, $2, $3) RETURNING *`,
      [projectId, name.trim(), kind]
    ));
  } catch (err: any) {
    if (err?.code === "23505") {
      throw Errors.conflict(`Version "${name}" already exists for this project`);
    }
    throw err;
  }

  const version = rows[0];
  broadcast(`versions-${projectId}`, "version_created", version);
  res.status(201).json(version);
});

/**
 * @swagger
 * /projects/{projectId}/release-checks:
 *   get:
 *     summary: Checks for the first or next release
 *     tags: [Versions]
 *     responses:
 *       200: { description: Release checks }
 *       501: { description: Not implemented (WP-BE2) }
 */
router.get("/:projectId/release-checks", async (req: Request, res: Response) => {
  const { projectId } = req.params;
  const token = tokenFromQuery(req.query.token);
  await authorizeProject(projectId, req.user?.id, token);

  // Optional: check a specific version (e.g. a planned/hotfix version not
  // yet the earliest open one) rather than the default next-open-version.
  const versionId = typeof req.query.versionId === "string" ? req.query.versionId : undefined;
  const result = await releaseService.releaseChecks(projectId, versionId);
  res.json(result);
});

/**
 * @swagger
 * /projects/{projectId}/versions/{versionId}/release:
 *   post:
 *     summary: Release a version (in-order rule, carry-over, tag, deploy)
 *     tags: [Versions]
 *     responses:
 *       200: { description: Release result }
 *       501: { description: Not implemented (WP-BE2) }
 */
router.post("/:projectId/versions/:versionId/release", async (req: Request, res: Response) => {
  const { projectId, versionId } = req.params;
  const token = tokenFromQuery(req.query.token);
  await authorizeProject(projectId, req.user?.id, token, { mutating: true });

  const result = await releaseService.release(projectId, versionId, req.user?.id);
  broadcast(`versions-${projectId}`, "version_released", result.version);
  res.json(result);
});

/**
 * @swagger
 * /projects/{projectId}/first-release:
 *   post:
 *     summary: First release (checks, tag v1.0.0, lock baseline, projects.stage = released)
 *     tags: [Versions]
 *     responses:
 *       200: { description: First release result }
 *       501: { description: Not implemented (WP-BE2) }
 */
router.post("/:projectId/first-release", async (req: Request, res: Response) => {
  const { projectId } = req.params;
  const token = tokenFromQuery(req.query.token);
  await authorizeProject(projectId, req.user?.id, token, { mutating: true });

  const result = await releaseService.firstRelease(projectId, req.user?.id);
  broadcast(`versions-${projectId}`, "version_released", result.version);
  res.json(result);
});

export default router;
