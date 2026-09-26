/**
 * Assurance Mesh Routes (spec 007, epic B2 — Option B; WP-BE4, T122).
 *
 *   POST   /mesh/runs                 - ingest a signed report from the generated CI (no user auth)
 *   GET    /mesh/runs/:runId          - evidence for one run
 *   GET    /mesh/exceptions           - list exceptions (?repositoryId= or ?applicationId=)
 *   POST   /mesh/exceptions           - request an exception
 *   GET    /mesh/policy               - effective + explicit policy for a scope (?scope=&scopeId=)
 *   PUT    /mesh/policy               - set policy for a scope (tighten-only for team/app/repo owners)
 *   POST   /mesh/runs/:runId/issue    - open an issue/work item for a run's new findings (T125)
 *
 * Mounted with `optionalAuthMiddleware` (see routes/v1/index.ts) because
 * `POST /runs` authenticates via HMAC, not a user session; every other route
 * here requires `req.user`.
 */
import { Router, Request, Response } from "express";
import { Errors } from "../middleware/errorHandler";
import { logger } from "../utils/logger";
import db from "../utils/database";
import { broadcastMeshRunReceived, broadcastPrStateChanged } from "../services/mesh/realtime";
import {
  getProfileId,
  isOrgAdmin,
  checkTeamAccess,
  checkApplicationAccess,
  getTeamOrgId,
} from "../services/teams/authorization";
import { getSecretResolver } from "../services/mesh/secretResolver";
import {
  SIGNATURE_HEADER,
  MAX_INGEST_BODY_BYTES,
  verifySignature,
  ratchetFindings,
  isStaleReport,
  MeshFinding,
} from "../services/mesh/ingest";
import {
  AGENTS,
  MeshAgent,
  PolicyMode,
  PolicyScope,
  MODE_RANK,
  isPolicyMode,
  resolveEffectiveMode,
  resolveEffectivePolicy,
  resolveEffectiveSandbox,
  resolveScopeChain,
  isTightenOrEqual,
} from "../services/mesh/policy";
import { openIssueForNewFindings } from "../services/mesh/issueService";
import { inferRepositoryProvider } from "../services/repositories/fullName";

const router = Router();

const VALID_TRIGGERS = new Set(["pull_request", "manual", "baseline"]);
const VALID_PR_STATES = new Set(["open", "merged", "closed"]);
const VALID_VERDICTS = new Set(["pass", "warn", "fail", "skip"]);
const VALID_SCOPES = new Set<PolicyScope>(["organization", "team", "application", "repository"]);

/**
 * Uniform rejection for anything wrong with the ingest request's
 * authenticity (unknown repository, missing/malformed/incorrect signature).
 * Deliberately identical in every one of these cases so a caller cannot use
 * the response to enumerate valid repository names or probe secrets.
 */
function rejectIngestAuth(res: Response): void {
  res.status(401).json({
    error: "Unauthorized",
    message: "Unknown repository or invalid signature",
    code: "MESH_INGEST_UNAUTHORIZED",
  });
}

/**
 * `report_url` is stored and later rendered as a link on the evidence page
 * (T122/T132) — reject anything but an `https://` URL so a malicious CI
 * (or a compromised repository secret) can't smuggle a `javascript:`/`data:`
 * URL into a field a browser might later navigate to, or an `http://` URL
 * that would leak the evidence blob's SAS token over plaintext.
 */
function isValidReportUrl(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  return url.protocol === "https:";
}

/**
 * POST /mesh/runs
 * Ingest a signed evidence report from the generated CI (GitHub Actions or
 * Azure Pipelines) for a PR targeting the repository's default branch
 * (research D-10). No user auth — authenticated solely by
 * `X-Pronghorn-Signature`, an HMAC-SHA256 over the raw request body keyed by
 * the repository's `report_secret_ref` secret.
 */
router.post("/runs", async (req: Request, res: Response) => {
  // index.ts mounts a route-scoped express.raw() ahead of the global
  // express.json() for this exact path+method, so req.body is the exact
  // bytes the CI sent (a Buffer) — required to HMAC-verify them, and to
  // reject an oversized report before it is ever parsed. That parser also
  // enforces the 2 MiB limit itself (413), but the length check below is
  // kept as defense in depth for any caller that reaches this handler with
  // the body already read some other way (e.g. a unit test of the router in
  // isolation).
  if (!Buffer.isBuffer(req.body)) {
    throw Errors.badRequest("Missing request body");
  }
  const rawBody = req.body;
  if (rawBody.length > MAX_INGEST_BODY_BYTES) {
    res.status(413).json({ error: "PayloadTooLarge", message: "Report body exceeds the size limit" });
    return;
  }

  let body: any;
  try {
    body = JSON.parse(rawBody.toString("utf8"));
  } catch {
    throw Errors.badRequest("Body is not valid JSON");
  }

  // `repository` must be the canonical `application_repositories.full_name`
  // ("<owner>/<repo>" for GitHub, "<adoOrg>/<project>/<repo>" for Azure
  // Repos — contracts/api.md `POST /mesh/runs`); the mesh CI templates send
  // exactly that and this endpoint does no normalization, only an exact
  // lookup. Anything that isn't one of those two shapes can't match a row,
  // so it's rejected (with the same generic 401) before touching the DB.
  const repositoryFullName: unknown = body?.repository;
  if (typeof repositoryFullName !== "string" || inferRepositoryProvider(repositoryFullName) === null) {
    return rejectIngestAuth(res);
  }

  const { rows: repoRows } = await db.query(
    `SELECT ar.id, ar.application_id, ar.default_branch, ar.report_secret_ref,
            a.team_id, a.onboarded_at
     FROM public.application_repositories ar
     JOIN public.applications a ON a.id = ar.application_id
     WHERE ar.full_name = $1`,
    [repositoryFullName],
  );
  const repo = repoRows[0];
  if (!repo || !repo.report_secret_ref) {
    return rejectIngestAuth(res);
  }

  const secret = await getSecretResolver().resolveReportSecret(repo.report_secret_ref);
  if (!secret) {
    logger.warn(`[mesh] No secret resolved for repository ${repositoryFullName} (ref=${repo.report_secret_ref})`);
    return rejectIngestAuth(res);
  }

  const signatureHeader = req.header(SIGNATURE_HEADER);
  if (!verifySignature(rawBody, secret, signatureHeader)) {
    return rejectIngestAuth(res);
  }

  // Past this point the caller has proven it holds the repository's secret;
  // ordinary validation errors (400/422) are safe to be specific about.
  const {
    commit_sha: commitSha,
    pr_number: prNumber = null,
    base_branch: baseBranch,
    pr_state: prState,
    trigger,
    pack_version: packVersion,
    verdicts,
    findings = [],
    asvs_passed: asvsPassed = null,
    alberta_passed: albertaPassed = null,
    report_url: reportUrl,
    received_at: receivedAt,
  } = body;

  const errors: string[] = [];
  if (!commitSha || typeof commitSha !== "string") errors.push("commit_sha is required");
  if (!baseBranch || typeof baseBranch !== "string") errors.push("base_branch is required");
  if (!VALID_PR_STATES.has(prState)) errors.push(`pr_state must be one of ${[...VALID_PR_STATES].join(", ")}`);
  if (!VALID_TRIGGERS.has(trigger)) errors.push(`trigger must be one of ${[...VALID_TRIGGERS].join(", ")}`);
  if (!packVersion || typeof packVersion !== "string") errors.push("pack_version is required");
  if (!reportUrl || typeof reportUrl !== "string") errors.push("report_url is required");
  if (!receivedAt || typeof receivedAt !== "string") errors.push("received_at is required");
  if (!verdicts || typeof verdicts !== "object") {
    errors.push("verdicts is required");
  } else {
    for (const agent of AGENTS) {
      if (!VALID_VERDICTS.has(verdicts[agent])) {
        errors.push(`verdicts.${agent} must be one of ${[...VALID_VERDICTS].join(", ")}`);
      }
    }
  }
  if (!Array.isArray(findings)) errors.push("findings must be an array");
  if (reportUrl && typeof reportUrl === "string" && !isValidReportUrl(reportUrl)) {
    errors.push("report_url must be an https:// URL");
  }
  if (errors.length) throw Errors.validation(errors);

  if (baseBranch !== repo.default_branch) {
    throw Errors.badRequest(
      `base_branch "${baseBranch}" is not this repository's default branch ("${repo.default_branch}")`,
    );
  }

  if (isStaleReport(receivedAt)) {
    res.status(409).json({
      error: "Conflict",
      message: "received_at is too old to accept (stale or replayed report)",
      code: "MESH_REPORT_STALE",
    });
    return;
  }

  const typedFindings: MeshFinding[] = (findings as any[]).filter(
    (f) => f && typeof f.fingerprint === "string" && typeof f.agent === "string",
  );

  const { rows: baselineRows } = await db.query(
    `SELECT fingerprint FROM public.mesh_baselines WHERE repository_id = $1`,
    [repo.id],
  );
  const baselineFingerprints = new Set<string>(baselineRows.map((r: any) => r.fingerprint));

  const isBaselineRun = trigger === "baseline";
  const { newFindings, newFindingsByAgent } = isBaselineRun
    ? { newFindings: [], newFindingsByAgent: { green: 0, yellow: 0, red: 0, blue: 0 } }
    : ratchetFindings(typedFindings, baselineFingerprints);

  const totalNewFindings = Object.values(newFindingsByAgent).reduce((a, b) => a + b, 0);

  const runId: string = await db.transaction(async (client) => {
    const { rows: insertedRun } = await client.query(
      `INSERT INTO public.mesh_runs
         (repository_id, commit_sha, pr_number, base_branch, pr_state, trigger,
          pack_version, verdicts, new_findings, asvs_passed, alberta_passed,
          report_url, received_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       RETURNING id`,
      [
        repo.id,
        commitSha,
        prNumber,
        baseBranch,
        prState,
        trigger,
        packVersion,
        JSON.stringify(verdicts),
        totalNewFindings,
        asvsPassed,
        albertaPassed,
        reportUrl,
        receivedAt,
      ],
    );

    // Baseline ratchet (research D-11): a `baseline` trigger seeds the
    // baseline outright; a merged PR's findings become part of the baseline
    // going forward (the ratchet only ever grows — a resolved finding
    // simply never resurfaces, it is not actively pruned).
    if (isBaselineRun || prState === "merged") {
      for (const finding of typedFindings) {
        await client.query(
          `INSERT INTO public.mesh_baselines (repository_id, agent, fingerprint)
           VALUES ($1, $2, $3)
           ON CONFLICT (repository_id, fingerprint) DO NOTHING`,
          [repo.id, finding.agent, finding.fingerprint],
        );
      }
    }

    await client.query(
      `UPDATE public.application_repositories SET last_report_at = now() WHERE id = $1`,
      [repo.id],
    );
    if (!repo.onboarded_at) {
      await client.query(`UPDATE public.applications SET onboarded_at = now() WHERE id = $1`, [repo.application_id]);
    }

    return insertedRun[0].id;
  });

  const policy = await resolveEffectivePolicy("repository", repo.id);
  const cyberRiskSandbox = await resolveEffectiveSandbox("repository", repo.id);

  if (repo.team_id) {
    broadcastMeshRunReceived({
      teamId: repo.team_id,
      applicationId: repo.application_id,
      repositoryId: repo.id,
      runId,
      prNumber,
      prState,
      newFindings: totalNewFindings,
    });
    if (prState === "merged" || prState === "closed") {
      broadcastPrStateChanged({
        teamId: repo.team_id,
        applicationId: repo.application_id,
        repositoryId: repo.id,
        runId,
        prNumber,
        prState,
      });
    }
  }

  // Automatic issue/work-item filing: any agent with new findings whose
  // effective policy is `issue` (D-15). Idempotent per run (issueService
  // checks mesh_runs.issue_opened_at).
  const agentsNeedingIssue = (Object.keys(newFindingsByAgent) as MeshAgent[]).filter(
    (agent) => newFindingsByAgent[agent] > 0 && policy[agent] === "issue",
  );
  if (agentsNeedingIssue.length > 0) {
    openIssueForNewFindings(runId).catch((err) => {
      logger.error(`[mesh] Automatic issue filing failed for run ${runId}: ${err?.message}`);
    });
  }

  res.status(201).json({
    run_id: runId,
    new_findings_by_agent: newFindingsByAgent,
    policy,
    cyber_risk_sandbox: cyberRiskSandbox,
  });
});

/**
 * GET /mesh/runs/:runId
 * Evidence for one run: verdicts per agent, counts, report URL. Members of
 * the owning team, or organization admins for that team's organization.
 */
router.get("/runs/:runId", async (req: Request, res: Response) => {
  const userId = req.user?.id;
  if (!userId) throw Errors.unauthorized();

  const { runId } = req.params;
  const { rows } = await db.query(
    `SELECT mr.*, ar.application_id, ar.full_name AS repository_full_name
     FROM public.mesh_runs mr
     JOIN public.application_repositories ar ON ar.id = mr.repository_id
     WHERE mr.id = $1`,
    [runId],
  );
  const run = rows[0];
  if (!run) throw Errors.notFound("Mesh run");

  const access = await checkApplicationAccess(userId, run.application_id);
  if (!access.authorized) throw Errors.forbidden("Not a member of this application's team");

  res.json(run);
});

/**
 * GET /mesh/exceptions?repositoryId=&applicationId=
 * List exceptions (Red recon without a test environment, or an approved
 * deviation). At least one filter is required.
 */
router.get("/exceptions", async (req: Request, res: Response) => {
  const userId = req.user?.id;
  if (!userId) throw Errors.unauthorized();

  const repositoryId = req.query.repositoryId as string | undefined;
  const applicationId = req.query.applicationId as string | undefined;
  if (!repositoryId && !applicationId) {
    throw Errors.badRequest("repositoryId or applicationId query parameter is required");
  }

  let effectiveApplicationId = applicationId;
  if (!effectiveApplicationId && repositoryId) {
    const { rows } = await db.query(
      `SELECT application_id FROM public.application_repositories WHERE id = $1`,
      [repositoryId],
    );
    effectiveApplicationId = rows[0]?.application_id;
    if (!effectiveApplicationId) throw Errors.notFound("Repository");
  }

  const access = await checkApplicationAccess(userId, effectiveApplicationId!);
  if (!access.found) throw Errors.notFound("Application");
  if (!access.authorized) throw Errors.forbidden("Not a member of this application's team");

  const { rows } = await db.query(
    `SELECT me.id, me.repository_id, me.rule, me.reason, me.approved_by, me.expires_at, me.created_at
     FROM public.mesh_exceptions me
     JOIN public.application_repositories ar ON ar.id = me.repository_id
     WHERE ${repositoryId ? "ar.id = $1" : "ar.application_id = $1"}
     ORDER BY me.expires_at`,
    [repositoryId || effectiveApplicationId],
  );

  res.json(rows);
});

/**
 * POST /mesh/exceptions
 * Request an exception for a repository. Members and owners of the owning
 * team (or organization admins) may request one; the requester is recorded
 * as the approver since there is no separate approval workflow in this spec.
 */
router.post("/exceptions", async (req: Request, res: Response) => {
  const userId = req.user?.id;
  if (!userId) throw Errors.unauthorized();

  const { repositoryId, rule, reason, expiresAt } = req.body || {};
  if (!repositoryId || typeof repositoryId !== "string") throw Errors.badRequest("repositoryId is required");
  if (!rule || typeof rule !== "string") throw Errors.badRequest("rule is required");
  if (!expiresAt || Number.isNaN(Date.parse(expiresAt))) throw Errors.badRequest("expiresAt must be a valid date");

  const { rows: repoRows } = await db.query(
    `SELECT application_id FROM public.application_repositories WHERE id = $1`,
    [repositoryId],
  );
  const applicationId = repoRows[0]?.application_id;
  if (!applicationId) throw Errors.notFound("Repository");

  const access = await checkApplicationAccess(userId, applicationId);
  if (!access.authorized) throw Errors.forbidden("Not a member of this application's team");

  const approverProfileId = await getProfileId(userId);
  const { rows } = await db.query(
    `INSERT INTO public.mesh_exceptions (repository_id, rule, reason, approved_by, expires_at)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, repository_id, rule, reason, approved_by, expires_at, created_at`,
    [repositoryId, rule, reason || null, approverProfileId, expiresAt],
  );

  res.status(201).json(rows[0]);
});

/**
 * GET /mesh/policy?scope=&scopeId=
 * Effective mode per agent plus the effective `cyber_risk_sandbox` flag for
 * one scope. Any member with access to that scope may read it.
 */
router.get("/policy", async (req: Request, res: Response) => {
  const userId = req.user?.id;
  if (!userId) throw Errors.unauthorized();

  const scope = req.query.scope as PolicyScope | undefined;
  const scopeId = req.query.scopeId as string | undefined;
  if (!scope || !VALID_SCOPES.has(scope) || !scopeId) {
    throw Errors.badRequest(`scope must be one of ${[...VALID_SCOPES].join(", ")} and scopeId is required`);
  }

  const access = await checkPolicyScopeAccess(userId, scope, scopeId);
  if (!access.found) throw Errors.notFound("Scope");
  if (!access.authorized) throw Errors.forbidden("Not authorized for this scope");

  const policy = await resolveEffectivePolicy(scope, scopeId);
  const cyberRiskSandbox = await resolveEffectiveSandbox(scope, scopeId);

  const { rows: explicitRows } = await db.query(
    `SELECT agent, mode, cyber_risk_sandbox FROM public.mesh_policy WHERE scope = $1 AND scope_id = $2`,
    [scope, scopeId],
  );

  res.json({
    scope,
    scopeId,
    effective: policy,
    cyberRiskSandbox,
    explicit: explicitRows,
  });
});

/**
 * PUT /mesh/policy?scope=&scopeId=
 * Set the mode for one agent (and/or `cyberRiskSandbox`) at a scope.
 * Organization admins may set anything for their organization. Team owners
 * (and application/repository "owners", i.e. owners of the owning team) may
 * only tighten relative to what currently applies (see services/mesh/policy.ts).
 * Members are read-only.
 */
router.put("/policy", async (req: Request, res: Response) => {
  const userId = req.user?.id;
  if (!userId) throw Errors.unauthorized();

  const scope = req.query.scope as PolicyScope | undefined;
  const scopeId = req.query.scopeId as string | undefined;
  if (!scope || !VALID_SCOPES.has(scope) || !scopeId) {
    throw Errors.badRequest(`scope must be one of ${[...VALID_SCOPES].join(", ")} and scopeId is required`);
  }

  const { agent, mode, cyberRiskSandbox } = req.body || {};
  if (agent !== undefined && !AGENTS.includes(agent)) {
    throw Errors.badRequest(`agent must be one of ${AGENTS.join(", ")}`);
  }
  if (mode !== undefined && !isPolicyMode(mode)) {
    throw Errors.badRequest(`mode must be one of ${Object.keys(MODE_RANK).join(", ")}`);
  }
  if (mode !== undefined && agent === undefined) {
    throw Errors.badRequest("agent is required when setting mode");
  }
  if (cyberRiskSandbox !== undefined && scope !== "application" && scope !== "repository") {
    throw Errors.badRequest("cyberRiskSandbox may only be set at application or repository scope");
  }
  if (mode === undefined && cyberRiskSandbox === undefined) {
    throw Errors.badRequest("mode or cyberRiskSandbox is required");
  }

  const access = await checkPolicyScopeAccess(userId, scope, scopeId);
  if (!access.found) throw Errors.notFound("Scope");
  if (!access.authorized) throw Errors.forbidden("Not authorized for this scope");
  if (!access.canWrite) throw Errors.forbidden("Members may only read the mesh policy");

  if (mode !== undefined) {
    if (!access.isOrgAdmin) {
      const currentMode = await resolveEffectiveMode(scope, scopeId, agent as MeshAgent);
      if (!isTightenOrEqual(MODE_RANK[currentMode], MODE_RANK[mode as PolicyMode])) {
        throw Errors.forbidden(
          `Team/application/repository owners may only tighten policy (current: ${currentMode}, requested: ${mode})`,
        );
      }
    }
    await upsertPolicyRow(scope, scopeId, agent, { mode });
  }

  if (cyberRiskSandbox !== undefined) {
    if (!access.isOrgAdmin) {
      const currentSandbox = await resolveEffectiveSandbox(scope, scopeId);
      if (currentSandbox && !cyberRiskSandbox) {
        throw Errors.forbidden("Team/application/repository owners may only enable the Cyber Risk sandbox, not disable it");
      }
    }
    // cyber_risk_sandbox lives per-row like mode; agent-less rows use a
    // sentinel agent value so the (scope, scope_id, agent) unique index can
    // still hold it without a schema change.
    await upsertPolicyRow(scope, scopeId, agent || "_sandbox", { cyberRiskSandbox });
  }

  const policy = await resolveEffectivePolicy(scope, scopeId);
  const sandbox = await resolveEffectiveSandbox(scope, scopeId);
  res.json({ scope, scopeId, effective: policy, cyberRiskSandbox: sandbox });
});

/**
 * POST /mesh/runs/:runId/issue
 * Manually (re-)trigger issue/work-item filing for a run's new findings
 * (T125). Idempotent — see services/mesh/issueService.ts.
 */
router.post("/runs/:runId/issue", async (req: Request, res: Response) => {
  const userId = req.user?.id;
  if (!userId) throw Errors.unauthorized();

  const { runId } = req.params;
  const { rows } = await db.query(
    `SELECT mr.id, ar.application_id
     FROM public.mesh_runs mr
     JOIN public.application_repositories ar ON ar.id = mr.repository_id
     WHERE mr.id = $1`,
    [runId],
  );
  const run = rows[0];
  if (!run) throw Errors.notFound("Mesh run");

  const access = await checkApplicationAccess(userId, run.application_id);
  if (!access.authorized) throw Errors.forbidden("Not a member of this application's team");

  const result = await openIssueForNewFindings(runId);
  res.status(result.created ? 201 : 200).json(result);
});

// ---------------------------------------------------------------------------
// Scope access helper (mesh_policy specific: repository scope isn't covered
// by services/teams/authorization.ts's checkApplicationAccess/checkTeamAccess).
// ---------------------------------------------------------------------------

interface PolicyScopeAccess {
  found: boolean;
  authorized: boolean;
  /** Org admin (for the organization owning this scope) — bypasses tighten-only. */
  isOrgAdmin: boolean;
  /** Team owner (or org admin) — may write, subject to tighten-only unless isOrgAdmin. */
  canWrite: boolean;
}

async function checkPolicyScopeAccess(userId: string, scope: PolicyScope, scopeId: string): Promise<PolicyScopeAccess> {
  if (scope === "organization") {
    const admin = await isOrgAdmin(userId);
    // Organization-scope access is admin-only, for both read and write —
    // there is no "member" notion at the organization level.
    return { found: true, authorized: admin, isOrgAdmin: admin, canWrite: admin };
  }

  if (scope === "team") {
    const access = await checkTeamAccess(userId, scopeId);
    return {
      found: access.found,
      authorized: access.authorized,
      isOrgAdmin: access.isOrgAdmin,
      canWrite: access.isOrgAdmin || access.role === "owner",
    };
  }

  if (scope === "application") {
    const access = await checkApplicationAccess(userId, scopeId);
    return {
      found: access.found,
      authorized: access.authorized,
      isOrgAdmin: access.isOrgAdmin,
      canWrite: access.isOrgAdmin || access.role === "owner",
    };
  }

  // repository
  const { rows } = await db.query(
    `SELECT application_id FROM public.application_repositories WHERE id = $1`,
    [scopeId],
  );
  const applicationId = rows[0]?.application_id;
  if (!applicationId) return { found: false, authorized: false, isOrgAdmin: false, canWrite: false };

  const access = await checkApplicationAccess(userId, applicationId);
  return {
    found: true,
    authorized: access.authorized,
    isOrgAdmin: access.isOrgAdmin,
    canWrite: access.isOrgAdmin || access.role === "owner",
  };
}

async function upsertPolicyRow(
  scope: PolicyScope,
  scopeId: string,
  agent: string,
  fields: { mode?: PolicyMode; cyberRiskSandbox?: boolean },
): Promise<void> {
  const { rows } = await db.query(
    `SELECT id FROM public.mesh_policy WHERE scope = $1 AND scope_id = $2 AND agent = $3`,
    [scope, scopeId, agent],
  );
  if (rows[0]) {
    const sets: string[] = [];
    const values: any[] = [];
    if (fields.mode !== undefined) {
      values.push(fields.mode);
      sets.push(`mode = $${values.length}`);
    }
    if (fields.cyberRiskSandbox !== undefined) {
      values.push(fields.cyberRiskSandbox);
      sets.push(`cyber_risk_sandbox = $${values.length}`);
    }
    sets.push(`updated_at = now()`);
    values.push(rows[0].id);
    await db.query(`UPDATE public.mesh_policy SET ${sets.join(", ")} WHERE id = $${values.length}`, values);
    return;
  }

  await db.query(
    `INSERT INTO public.mesh_policy (scope, scope_id, agent, mode, cyber_risk_sandbox)
     VALUES ($1, $2, $3, COALESCE($4, 'issue'), COALESCE($5, false))`,
    [scope, scopeId, agent, fields.mode ?? null, fields.cyberRiskSandbox ?? null],
  );
}

export default router;
