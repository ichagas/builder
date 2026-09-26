/**
 * Work Items Routes - Changes tracked against a Builder project (Epic B1)
 *
 * Exports two routers (see `routes/v1/index.ts`):
 *   - `default` (project-scoped): mounted at `/projects`, list/create.
 *   - `workItemByIdRouter`: mounted at `/work-items`, everything keyed by
 *     the work item's own id.
 *
 * Auth: authenticated user (project owner) OR `?token=` authorized through
 * the same `authorize_project_access` rule the RPCs use (see
 * `services/versions/access.ts`). `viewer` tokens are read-only.
 *
 * @swagger
 * tags:
 *   name: Work Items
 *   description: Changes (bugs, enhancements, features) tracked against a Builder project
 */
import { Router, Request, Response } from "express";
import { Errors } from "../middleware/errorHandler";
import db from "../utils/database";
import { broadcast } from "../websocket";
import { authorizeProject, tokenFromQuery } from "../services/versions/access";

const WORK_ITEM_TYPES = ["bug", "enhancement", "feature"] as const;
const WORK_ITEM_SEVERITIES = ["high", "medium", "low"] as const;
const WORK_ITEM_STATUSES = ["triage", "active", "shipped", "declined"] as const;
const PHASE_STEPS = ["define", "design", "build", "ship"] as const;
const REQUIREMENT_CHANGE_KINDS = ["new", "changed", "regression"] as const;

type PhaseStep = (typeof PHASE_STEPS)[number];

/** Fetch a work item along with its project id, 404ing if missing. */
async function loadWorkItem(id: string): Promise<any> {
  const { rows } = await db.query("SELECT * FROM work_items WHERE id = $1", [id]);
  if (rows.length === 0) throw Errors.notFound("Work item");
  return rows[0];
}

/** Max attempts for the `INSERT` retry loop in {@link createWorkItemWithKey}. */
const MAX_KEY_ALLOCATION_ATTEMPTS = 5;

/** A `client`-like object exposing just the `query` method transactions use. */
interface QueryableClient {
  query(text: string, params?: unknown[]): Promise<{ rows: any[] }>;
}

/** Compute the next sequential `WI-<n>` key for a project, given a client/pool. */
async function computeNextWorkItemKey(client: QueryableClient, projectId: string): Promise<string> {
  const { rows } = await client.query(
    `SELECT COALESCE(MAX((regexp_match(key, '^WI-(\\d+)$'))[1]::int), 0) AS max_num
     FROM work_items WHERE project_id = $1`,
    [projectId]
  );
  const maxNum = Number(rows[0]?.max_num ?? 0);
  return `WI-${maxNum + 1}`;
}

/**
 * Insert a new work item with an atomically-allocated, sequential `WI-<n>`
 * key. Two mechanisms make concurrent creates for the same project safe:
 *
 *   1. Primary: the whole allocate-then-insert sequence runs inside a
 *      single transaction that first takes a transaction-scoped advisory
 *      lock keyed by the project id (`pg_advisory_xact_lock(hashtext($1))`).
 *      Concurrent transactions for the *same* project queue up on this lock
 *      and are fully serialized, so each one computes MAX(key) over a
 *      distinct, already-committed state -- no two creates can compute the
 *      same next key. The lock releases automatically at COMMIT/ROLLBACK.
 *   2. Defense in depth: the `INSERT` is wrapped in a bounded retry loop
 *      that recomputes the key and retries if it still hits the
 *      `work_items_project_id_key_key` unique-constraint violation (23505)
 *      -- e.g. if a caller ever bypasses the lock via a different code path.
 *
 * Before this fix, key computation and the `INSERT` were two independent,
 * unserialized statements: 10 concurrent creates against a real database
 * produced 7 raw 500s from unhandled 23505s.
 */
async function createWorkItemWithKey(
  projectId: string,
  fields: {
    versionId: string | null;
    type: string;
    severity: string | null;
    title: string;
    source: string | null;
    evidence: string | null;
    components: string[];
    bugReport: unknown;
  }
): Promise<any> {
  return db.transaction(async (client: QueryableClient) => {
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [projectId]);

    let lastError: unknown;
    for (let attempt = 0; attempt < MAX_KEY_ALLOCATION_ATTEMPTS; attempt++) {
      const key = await computeNextWorkItemKey(client, projectId);
      try {
        const { rows } = await client.query(
          `INSERT INTO work_items
             (project_id, key, version_id, type, severity, title, source, evidence, status, components, bug_report)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'triage', $9, $10)
           RETURNING *`,
          [
            projectId,
            key,
            fields.versionId,
            fields.type,
            fields.severity,
            fields.title,
            fields.source,
            fields.evidence,
            fields.components,
            fields.bugReport,
          ]
        );
        return rows[0];
      } catch (err: any) {
        if (err?.code === "23505" && attempt < MAX_KEY_ALLOCATION_ATTEMPTS - 1) {
          lastError = err;
          continue;
        }
        throw err;
      }
    }
    throw lastError;
  });
}

// ============================================================================
// Project-scoped: list / create (mounted at /projects)
// ============================================================================

const projectWorkItemsRouter = Router();

/**
 * @swagger
 * /projects/{projectId}/work-items:
 *   get:
 *     summary: Changes list and triage
 *     tags: [Work Items]
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema: { type: string, format: uuid }
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [triage, active, shipped, declined] }
 *       - in: query
 *         name: versionId
 *         schema: { type: string, format: uuid }
 *       - in: query
 *         name: token
 *         schema: { type: string }
 *     responses:
 *       200: { description: Work items }
 */
projectWorkItemsRouter.get("/:projectId/work-items", async (req: Request, res: Response) => {
  const { projectId } = req.params;
  const token = tokenFromQuery(req.query.token);
  await authorizeProject(projectId, req.user?.id, token);

  const { status, versionId } = req.query;
  const conditions: string[] = ["project_id = $1"];
  const params: unknown[] = [projectId];

  if (typeof status === "string" && status.length > 0) {
    if (!WORK_ITEM_STATUSES.includes(status as any)) {
      throw Errors.validation({ status: `status must be one of: ${WORK_ITEM_STATUSES.join(", ")}` });
    }
    params.push(status);
    conditions.push(`status = $${params.length}`);
  }

  if (typeof versionId === "string" && versionId.length > 0) {
    params.push(versionId);
    conditions.push(`version_id = $${params.length}`);
  }

  const { rows } = await db.query(
    `SELECT * FROM work_items WHERE ${conditions.join(" AND ")} ORDER BY created_at DESC`,
    params
  );
  res.json(rows);
});

/**
 * @swagger
 * /projects/{projectId}/work-items:
 *   post:
 *     summary: New change (type, title, optional version)
 *     tags: [Work Items]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [type, title]
 *             properties:
 *               type: { type: string, enum: [bug, enhancement, feature] }
 *               title: { type: string }
 *               severity: { type: string, enum: [high, medium, low] }
 *               source: { type: string }
 *               evidence: { type: string }
 *               versionId: { type: string, format: uuid }
 *               components: { type: array, items: { type: string } }
 *               bugReport: { type: object }
 *     responses:
 *       201: { description: Work item created }
 *       422: { description: Validation error }
 */
projectWorkItemsRouter.post("/:projectId/work-items", async (req: Request, res: Response) => {
  const { projectId } = req.params;
  const token = tokenFromQuery(req.query.token);
  await authorizeProject(projectId, req.user?.id, token, { mutating: true });

  const {
    type,
    title,
    severity = null,
    source = null,
    evidence = null,
    versionId = null,
    components = [],
    bugReport = null,
  } = req.body ?? {};

  if (!WORK_ITEM_TYPES.includes(type)) {
    throw Errors.validation({ type: `type must be one of: ${WORK_ITEM_TYPES.join(", ")}` });
  }
  if (typeof title !== "string" || title.trim().length === 0) {
    throw Errors.validation({ title: "title is required" });
  }
  if (severity !== null && !WORK_ITEM_SEVERITIES.includes(severity)) {
    throw Errors.validation({ severity: `severity must be one of: ${WORK_ITEM_SEVERITIES.join(", ")}` });
  }
  if (!Array.isArray(components)) {
    throw Errors.validation({ components: "components must be an array of node ids" });
  }

  const workItem = await createWorkItemWithKey(projectId, {
    versionId,
    type,
    severity,
    title: title.trim(),
    source,
    evidence,
    components,
    bugReport,
  });

  broadcast(`versions-${projectId}`, "work_item_created", workItem);
  res.status(201).json(workItem);
});

// ============================================================================
// By-id: change page, scheduling, phases, requirement changes
// (mounted at /work-items)
// ============================================================================

const workItemByIdRouter = Router();

/**
 * @swagger
 * /work-items/{id}:
 *   get:
 *     summary: Change page
 *     tags: [Work Items]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *       - in: query
 *         name: token
 *         schema: { type: string }
 *     responses:
 *       200: { description: Work item }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
workItemByIdRouter.get("/:id", async (req: Request, res: Response) => {
  const { id } = req.params;
  const workItem = await loadWorkItem(id);
  const token = tokenFromQuery(req.query.token);
  await authorizeProject(workItem.project_id, req.user?.id, token);
  res.json(workItem);
});

/**
 * @swagger
 * /work-items/{id}:
 *   patch:
 *     summary: Schedule or move version, edit, decline
 *     tags: [Work Items]
 *     responses:
 *       200: { description: Updated work item }
 *       422: { description: Validation error }
 */
workItemByIdRouter.patch("/:id", async (req: Request, res: Response) => {
  const { id } = req.params;
  const existing = await loadWorkItem(id);
  const token = tokenFromQuery(req.query.token);
  await authorizeProject(existing.project_id, req.user?.id, token, { mutating: true });

  const body = req.body ?? {};
  const updates: string[] = [];
  const params: unknown[] = [];

  const push = (column: string, value: unknown) => {
    params.push(value);
    updates.push(`${column} = $${params.length}`);
  };

  if ("versionId" in body) {
    push("version_id", body.versionId ?? null);
  }
  if ("title" in body) {
    if (typeof body.title !== "string" || body.title.trim().length === 0) {
      throw Errors.validation({ title: "title must be a non-empty string" });
    }
    push("title", body.title.trim());
  }
  if ("source" in body) push("source", body.source ?? null);
  if ("evidence" in body) push("evidence", body.evidence ?? null);
  if ("severity" in body) {
    if (body.severity !== null && !WORK_ITEM_SEVERITIES.includes(body.severity)) {
      throw Errors.validation({ severity: `severity must be one of: ${WORK_ITEM_SEVERITIES.join(", ")}` });
    }
    push("severity", body.severity ?? null);
  }
  if ("status" in body) {
    if (!WORK_ITEM_STATUSES.includes(body.status)) {
      throw Errors.validation({ status: `status must be one of: ${WORK_ITEM_STATUSES.join(", ")}` });
    }
    push("status", body.status);
  }
  if ("components" in body) {
    if (!Array.isArray(body.components)) {
      throw Errors.validation({ components: "components must be an array of node ids" });
    }
    push("components", body.components);
  }
  if ("branch" in body) push("branch", body.branch ?? null);
  if ("previewUrl" in body) push("preview_url", body.previewUrl ?? null);

  if (updates.length === 0) {
    throw Errors.validation({ body: "no updatable fields provided" });
  }

  params.push(id);
  const { rows } = await db.query(
    `UPDATE work_items SET ${updates.join(", ")}, updated_at = NOW() WHERE id = $${params.length} RETURNING *`,
    params
  );
  if (rows.length === 0) throw Errors.notFound("Work item");
  const workItem = rows[0];

  if ("versionId" in body && body.versionId !== existing.version_id) {
    broadcast(`versions-${existing.project_id}`, "item_moved", workItem);
  }
  broadcast(`work-item-${id}`, "work_item_updated", workItem);

  res.json(workItem);
});

/**
 * @swagger
 * /work-items/{id}/steps/{step}/complete:
 *   post:
 *     summary: Mark ready, approve, send for review
 *     tags: [Work Items]
 *     responses:
 *       200: { description: Updated work item }
 *       422: { description: Invalid step }
 */
workItemByIdRouter.post("/:id/steps/:step/complete", async (req: Request, res: Response) => {
  const { id, step } = req.params;
  if (!PHASE_STEPS.includes(step as PhaseStep)) {
    throw Errors.validation({ step: `step must be one of: ${PHASE_STEPS.join(", ")}` });
  }

  const existing = await loadWorkItem(id);
  const token = tokenFromQuery(req.query.token);
  await authorizeProject(existing.project_id, req.user?.id, token, { mutating: true });

  const phaseState = { ...(existing.phase_state ?? {}) };
  phaseState[step] = "done";

  // Advance the next todo phase to active, "Send for review" style flow.
  const stepIndex = PHASE_STEPS.indexOf(step as PhaseStep);
  const nextStep = PHASE_STEPS[stepIndex + 1];
  if (nextStep && phaseState[nextStep] === "todo") {
    phaseState[nextStep] = "active";
  }

  const previewUrl = step === "ship" ? existing.preview_url : req.body?.previewUrl ?? existing.preview_url;

  const { rows } = await db.query(
    `UPDATE work_items SET phase_state = $2, preview_url = $3, updated_at = NOW() WHERE id = $1 RETURNING *`,
    [id, JSON.stringify(phaseState), previewUrl]
  );
  const workItem = rows[0];
  broadcast(`work-item-${id}`, "phase_changed", workItem);
  res.json(workItem);
});

/**
 * @swagger
 * /work-items/{id}/steps/design/unskip:
 *   post:
 *     summary: Add a design step (undo a previously skipped design phase)
 *     tags: [Work Items]
 *     responses:
 *       200: { description: Updated work item }
 */
workItemByIdRouter.post("/:id/steps/design/unskip", async (req: Request, res: Response) => {
  const { id } = req.params;
  const existing = await loadWorkItem(id);
  const token = tokenFromQuery(req.query.token);
  await authorizeProject(existing.project_id, req.user?.id, token, { mutating: true });

  const phaseState = { ...(existing.phase_state ?? {}) };
  phaseState.design = "todo";

  const { rows } = await db.query(
    `UPDATE work_items SET phase_state = $2, updated_at = NOW() WHERE id = $1 RETURNING *`,
    [id, JSON.stringify(phaseState)]
  );
  const workItem = rows[0];
  broadcast(`work-item-${id}`, "phase_changed", workItem);
  res.json(workItem);
});

/**
 * @swagger
 * /work-items/{id}/requirement-changes:
 *   get:
 *     summary: Requirement deltas for a work item
 *     tags: [Work Items]
 *     responses:
 *       200: { description: Requirement changes }
 *   post:
 *     summary: Record a requirement delta for a work item
 *     tags: [Work Items]
 *     responses:
 *       201: { description: Requirement change created }
 *       422: { description: Validation error }
 */
workItemByIdRouter.get("/:id/requirement-changes", async (req: Request, res: Response) => {
  const { id } = req.params;
  const existing = await loadWorkItem(id);
  const token = tokenFromQuery(req.query.token);
  await authorizeProject(existing.project_id, req.user?.id, token);

  const { rows } = await db.query(
    "SELECT * FROM work_item_requirement_changes WHERE work_item_id = $1 ORDER BY created_at ASC",
    [id]
  );
  res.json(rows);
});

workItemByIdRouter.post("/:id/requirement-changes", async (req: Request, res: Response) => {
  const { id } = req.params;
  const existing = await loadWorkItem(id);
  const token = tokenFromQuery(req.query.token);
  await authorizeProject(existing.project_id, req.user?.id, token, { mutating: true });

  const { requirementId = null, kind, title, criterion = null } = req.body ?? {};
  if (!REQUIREMENT_CHANGE_KINDS.includes(kind)) {
    throw Errors.validation({ kind: `kind must be one of: ${REQUIREMENT_CHANGE_KINDS.join(", ")}` });
  }
  if (kind !== "new" && !requirementId) {
    throw Errors.validation({ requirementId: "requirementId is required unless kind is 'new'" });
  }
  if (typeof title !== "string" || title.trim().length === 0) {
    throw Errors.validation({ title: "title is required" });
  }

  const { rows } = await db.query(
    `INSERT INTO work_item_requirement_changes (work_item_id, requirement_id, kind, title, criterion)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [id, requirementId, kind, title.trim(), criterion]
  );
  const change = rows[0];
  broadcast(`work-item-${id}`, "requirement_change_added", change);
  res.status(201).json(change);
});

export { workItemByIdRouter };
export default projectWorkItemsRouter;
