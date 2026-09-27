/**
 * Onboarding Routes (spec 007, epic B3, WP-BE5)
 *
 * POST   /onboarding/runs                       - create a draft (team, app name)
 * GET    /onboarding/runs/:id                    - wizard state
 * GET    /onboarding/github/repos?teamId=&q=     - import list (GitHub App installation, scoped to the team's org)
 * GET    /onboarding/azure/repos?teamId=&connectionId=&q= - import list (Azure Repos, via the org's connection)
 * PUT    /onboarding/runs/:id/repositories       - selected repos
 * POST   /onboarding/runs/:id/start              - start the sandbox job
 * GET    /onboarding/runs/:id/output             - review, generated files, baselines per repo
 * POST   /onboarding/runs/:id/pull-requests      - open one PR per repo (only after confirm)
 * POST   /onboarding/runs/:id/cancel             - cancel
 * POST   /onboarding/runs/:id/callback           - sandbox job -> API progress/result (WP-BE6)
 *
 * Authorization: every route except the last requires an authenticated
 * user; run-scoped routes additionally require membership of the run's team
 * (or organization admin for that team's organization) via
 * `services/onboarding`. `/callback` has no user session at all — it's
 * called by the sandbox job, authenticated by a per-run bearer token
 * (`services/onboarding/callbackAuth.ts`), the same "mixed auth" shape as
 * `POST /mesh/runs` (see `routes/v1/index.ts`'s mount comment).
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
 * GET /onboarding/github/repos?teamId=&q=
 *
 * SECURITY: `teamId` (not a client-supplied `org`) is what scopes the
 * result — the GitHub org(s) it's allowed to return come from the caller's
 * own organization's configured integration connection, never from the
 * request. See services/onboarding#listImportableGitHubRepositories.
 */
router.get("/github/repos", async (req: Request, res: Response) => {
  const userId = requireUserId(req);
  const teamId = typeof req.query.teamId === "string" ? req.query.teamId : "";
  const q = typeof req.query.q === "string" ? req.query.q : undefined;

  const repos = await onboarding.listImportableGitHubRepositories(userId, { teamId, query: q });
  res.json({ repositories: repos });
});

/**
 * GET /onboarding/azure/repos?teamId=&connectionId=&q=
 */
router.get("/azure/repos", async (req: Request, res: Response) => {
  const userId = requireUserId(req);
  const teamId = typeof req.query.teamId === "string" ? req.query.teamId : "";
  const connectionId = typeof req.query.connectionId === "string" ? req.query.connectionId : undefined;
  const q = typeof req.query.q === "string" ? req.query.q : undefined;

  const repos = await onboarding.listImportableAzureRepositories(userId, { teamId, connectionId, query: q });
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

/**
 * POST /onboarding/runs/:id/callback
 * headers: Authorization: Bearer <per-run token>
 * body: {type:"progress", ...} | {type:"result", ...JobResult}
 *
 * No `requireUserId` here on purpose — see the module docstring. Every
 * failure (unknown run, wrong/expired/tampered token) is the same generic
 * 401, thrown by `onboarding.handleJobCallback` itself.
 */
router.post("/runs/:id/callback", async (req: Request, res: Response) => {
  const auth = req.headers.authorization ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice("Bearer ".length) : undefined;
  await onboarding.handleJobCallback(req.params.id, token, req.body ?? {});
  res.status(204).end();
});

export default router;
