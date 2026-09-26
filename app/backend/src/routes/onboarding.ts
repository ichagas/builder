/**
 * Onboarding Routes (spec 007, epic B3, WP-BE5)
 *
 * POST   /onboarding/runs                       - create a draft (team, app name)
 * GET    /onboarding/runs/:id                    - wizard state
 * GET    /onboarding/github/repos?org=&q=        - import list (GitHub App installation)
 * PUT    /onboarding/runs/:id/repositories       - selected repos
 * POST   /onboarding/runs/:id/start              - start the sandbox job
 * GET    /onboarding/runs/:id/output             - review, generated files, baselines per repo
 * POST   /onboarding/runs/:id/pull-requests      - open one PR per repo (only after confirm)
 * POST   /onboarding/runs/:id/cancel             - cancel
 *
 * Authorization: every route requires an authenticated user; run-scoped
 * routes additionally require membership of the run's team (or organization
 * admin for that team's organization) via `services/onboarding`.
 */
import { Router, Request, Response } from "express";
import { Errors } from "../middleware/errorHandler";
import * as onboarding from "../services/onboarding";

const router = Router();

function requireUserId(req: Request): string {
  const userId = req.user?.id;
  if (!userId) throw Errors.unauthorized();
  return userId;
}

/**
 * POST /onboarding/runs
 * body: { teamId, applicationName, connectionId? }
 */
router.post("/runs", async (req: Request, res: Response) => {
  const userId = requireUserId(req);
  const { teamId, applicationName, connectionId } = req.body ?? {};

  const run = await onboarding.startDraftRun(userId, { teamId, applicationName, connectionId });
  res.status(201).json(run);
});

/**
 * GET /onboarding/runs/:id
 */
router.get("/runs/:id", async (req: Request, res: Response) => {
  const userId = requireUserId(req);
  const run = await onboarding.getRun(userId, req.params.id);
  res.json(run);
});

/**
 * GET /onboarding/github/repos?org=&q=
 */
router.get("/github/repos", async (req: Request, res: Response) => {
  const userId = requireUserId(req);
  const org = typeof req.query.org === "string" ? req.query.org : undefined;
  const q = typeof req.query.q === "string" ? req.query.q : undefined;

  const repos = await onboarding.listImportableGitHubRepositories(userId, { org, query: q });
  res.json({ repositories: repos });
});

/**
 * PUT /onboarding/runs/:id/repositories
 * body: { repositories: [{ fullName, selected? }] }
 */
router.put("/runs/:id/repositories", async (req: Request, res: Response) => {
  const userId = requireUserId(req);
  const { repositories } = req.body ?? {};
  if (!Array.isArray(repositories)) {
    throw Errors.validation({ repositories: "must be an array" });
  }

  const run = await onboarding.setRunRepositories(userId, req.params.id, repositories);
  res.json(run);
});

/**
 * POST /onboarding/runs/:id/start
 */
router.post("/runs/:id/start", async (req: Request, res: Response) => {
  const userId = requireUserId(req);
  const run = await onboarding.startRun(userId, req.params.id);
  res.json(run);
});

/**
 * GET /onboarding/runs/:id/output
 */
router.get("/runs/:id/output", async (req: Request, res: Response) => {
  const userId = requireUserId(req);
  const run = await onboarding.getRunOutput(userId, req.params.id);
  res.json(run);
});

/**
 * POST /onboarding/runs/:id/pull-requests
 * body: { confirm: true }
 *
 * SECURITY: PRs are only opened when `confirm` is explicitly `true` in the
 * request body — there is no other way to reach this behavior, and the
 * check is enforced in the service layer regardless of what the frontend
 * sends. Idempotent: safe to retry.
 */
router.post("/runs/:id/pull-requests", async (req: Request, res: Response) => {
  const userId = requireUserId(req);
  const { confirm } = req.body ?? {};
  const run = await onboarding.openPullRequests(userId, req.params.id, { confirm });
  res.json(run);
});

/**
 * POST /onboarding/runs/:id/cancel
 */
router.post("/runs/:id/cancel", async (req: Request, res: Response) => {
  const userId = requireUserId(req);
  const run = await onboarding.cancelRun(userId, req.params.id);
  res.json(run);
});

export default router;
