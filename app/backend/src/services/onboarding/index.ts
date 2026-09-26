/**
 * Onboarding service (spec 007, epic B3, WP-BE5).
 *
 * Orchestrates the five-step wizard (team & app -> connect repos -> run in
 * sandbox -> review output -> open pull requests) behind
 * `routes/onboarding.ts`: authorization, the `onboarding_runs` state
 * machine, GitHub import, dispatching the sandbox job (via
 * `JobDispatcher`), and opening pull requests **only after an explicit,
 * server-enforced confirm step**.
 */
import crypto from "crypto";
import { Errors } from "../../middleware/errorHandler";
import { logger } from "../../utils/logger";
import db from "../../utils/database";
import { escapeMarkdown } from "../mesh/issueService";
import { getSecretStore, getDefaultConnectionForProvider, getConnectionForOrg } from "../integrations";
import {
  checkTeamAccess,
  getProfileId,
  getTeamOrgId,
} from "../teams/authorization";
import {
  createRun,
  getRunById,
  listRepositoriesForRun,
  replaceRunRepositories,
  updateRun,
  updateRunRepositoryByFullName,
  claimRunTransition,
  claimPrLease,
  releasePrLease,
  OnboardingRunRow,
  OnboardingRunRepositoryRow,
  RepositorySelectionInput,
} from "./repository";
import { canTransition, describeInvalidTransition, isTerminal } from "./stateMachine";
import { getJobDispatcher } from "./jobDispatcher";
import type { JobResult, JobProgressEvent } from "./jobDispatcher";
import { broadcastOnboardingProgress } from "./realtime";
import { listGitHubRepositories, ImportableRepository } from "./githubImport";
import { listAzureDevOpsRepositories, ImportableAzureRepository } from "./azureImport";
import { openRepositoryPullRequest } from "./pullRequests";
import { findDisallowedPath } from "./pathValidation";
import { inferRepositoryProvider, RepositoryProvider } from "../repositories/fullName";

export interface OnboardingRunView extends OnboardingRunRow {
  repositories: OnboardingRunRepositoryRow[];
  /**
   * Fix round 1, item 10: generic, per-repository messages for a PR that
   * could not be opened on the most recent confirm (e.g. "no generated
   * files", an upstream API failure) — never the raw upstream error (see
   * item 9's {@link sanitizeUpstreamError}). Empty once every selected
   * repository has an open PR. Sourced from each repository's
   * `review.prError` (cleared there on a later, successful open).
   */
  warnings: string[];
}

async function requireTeamAccess(userId: string, teamId: string) {
  const access = await checkTeamAccess(userId, teamId);
  if (!access.found) throw Errors.notFound("Team");
  if (!access.authorized) throw Errors.forbidden("Not a member of this team");
  return access;
}

async function loadRunOrThrow(runId: string): Promise<OnboardingRunRow> {
  const run = await getRunById(runId);
  if (!run) throw Errors.notFound("Onboarding run");
  return run;
}

/** Resolve the run and enforce team-membership access for it, or throw 404/403. */
async function requireRunAccess(userId: string, runId: string): Promise<OnboardingRunRow> {
  const run = await loadRunOrThrow(runId);
  await requireTeamAccess(userId, run.team_id);
  return run;
}

function repositoryWarning(repo: OnboardingRunRepositoryRow): string | null {
  const review = (repo.review ?? {}) as { prError?: string; applicationLinkWarning?: string };
  const message = review.prError || review.applicationLinkWarning;
  return typeof message === "string" && message.length > 0 ? `${repo.full_name}: ${message}` : null;
}

async function toView(run: OnboardingRunRow): Promise<OnboardingRunView> {
  const repositories = await listRepositoriesForRun(run.id);
  const warnings = repositories.map(repositoryWarning).filter((w): w is string => w !== null);
  return { ...run, repositories, warnings };
}

/**
 * Fix round 1, item 9: never echo a raw upstream (GitHub/Azure DevOps) error
 * body back to the client — it can contain provider-internal detail that
 * isn't ours to expose, and unbounded text from a third party. The full
 * `err.message` (which `pullRequests.ts` already truncates before throwing)
 * is logged for operators; callers only ever see this fixed, generic string.
 */
function sanitizeUpstreamError(_err: unknown): string {
  return "could not open the pull request (see server logs for details)";
}

// Fix round 1, item 7: bound and sanitize user-controlled input that later
// flows into DB rows, GitHub/Azure API calls and PR titles/bodies.
const MAX_APPLICATION_NAME_LENGTH = 200;
const MAX_REPOSITORIES_PER_RUN = 200;
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/;

function isValidApplicationName(name: string): boolean {
  return name.length > 0 && name.length <= MAX_APPLICATION_NAME_LENGTH && !CONTROL_CHARS.test(name);
}

async function getLatestPackVersion(): Promise<string | null> {
  const { rows } = await db.query(`SELECT version FROM public.standards_packs ORDER BY published_at DESC LIMIT 1`);
  return rows[0]?.version ?? null;
}

// ---------------------------------------------------------------------------
// POST /onboarding/runs
// ---------------------------------------------------------------------------

export interface CreateRunParams {
  teamId: string;
  applicationName: string;
  connectionId?: string;
}

export async function startDraftRun(userId: string, params: CreateRunParams): Promise<OnboardingRunView> {
  if (!params.teamId || typeof params.teamId !== "string") {
    throw Errors.validation({ teamId: "required" });
  }
  if (!params.applicationName || typeof params.applicationName !== "string" || !params.applicationName.trim()) {
    throw Errors.validation({ applicationName: "required" });
  }
  const applicationName = params.applicationName.trim();
  if (!isValidApplicationName(applicationName)) {
    throw Errors.validation({
      applicationName: `must be 1-${MAX_APPLICATION_NAME_LENGTH} characters with no control characters`,
    });
  }

  const teamAccess = await requireTeamAccess(userId, params.teamId);

  if (params.connectionId !== undefined) {
    if (typeof params.connectionId !== "string" || !params.connectionId) {
      throw Errors.validation({ connectionId: "must be a non-empty string" });
    }
    // Fix round 2, item 10: a connectionId is only ever accepted when it
    // belongs to this team's own organization — never another
    // organization's integration connection.
    if (!teamAccess.organizationId) throw Errors.notFound("Team");
    const connection = await getConnectionForOrg(params.connectionId, teamAccess.organizationId);
    if (!connection) throw Errors.notFound("Integration connection");
  }

  const profileId = await getProfileId(userId);
  if (!profileId) throw Errors.forbidden("No profile for this account");

  const packVersion = await getLatestPackVersion();

  const run = await createRun({
    teamId: params.teamId,
    applicationName,
    startedBy: profileId,
    packVersion,
    connectionId: params.connectionId ?? null,
  });

  logger.info(`[onboarding] draft run created (id=${run.id}, team=${params.teamId})`);
  return toView(run);
}

// ---------------------------------------------------------------------------
// GET /onboarding/runs/:id
// ---------------------------------------------------------------------------

export async function getRun(userId: string, runId: string): Promise<OnboardingRunView> {
  const run = await requireRunAccess(userId, runId);
  return toView(run);
}

// ---------------------------------------------------------------------------
// GET /onboarding/github/repos
// ---------------------------------------------------------------------------

interface GitHubConnectionScope {
  owner?: string;
  owners?: string[];
}

/**
 * The GitHub org(s) an organization's `github_app` integration connection is
 * scoped to, or `[]` if none is configured — never derived from anything the
 * caller supplies. See {@link listImportableGitHubRepositories}.
 */
async function getAllowedGitHubOwners(organizationId: string): Promise<string[]> {
  const connection = await getDefaultConnectionForProvider(organizationId, "github_app");
  const scope = (connection?.scope ?? {}) as GitHubConnectionScope;
  if (Array.isArray(scope.owners) && scope.owners.length > 0) return scope.owners;
  if (scope.owner) return [scope.owner];
  return [];
}

/**
 * Fix round 1, item 6: repositories are scoped to the caller's own
 * organization, never to an arbitrary `org` the caller could otherwise pass
 * in — that would let one organization enumerate another's repository names
 * through the platform's single, shared GitHub App installation. `teamId` is
 * required so the organization is derived server-side (same authorization
 * as every other run-scoped route), and only repositories owned by a GitHub
 * login in that organization's configured `github_app` integration
 * connection scope are ever returned. An organization with no such
 * connection configured gets an empty list, not every installation repo.
 */
export async function listImportableGitHubRepositories(
  userId: string,
  options: { teamId: string; query?: string }
): Promise<ImportableRepository[]> {
  if (!options.teamId || typeof options.teamId !== "string") {
    throw Errors.validation({ teamId: "required" });
  }
  await requireTeamAccess(userId, options.teamId);
  const organizationId = await getTeamOrgId(options.teamId);
  if (!organizationId) throw Errors.notFound("Team");

  const owners = await getAllowedGitHubOwners(organizationId);
  if (owners.length === 0) {
    logger.info(`[onboarding] no GitHub scope configured for organization ${organizationId}; returning no repositories`);
    return [];
  }

  // Fix round 2, item 8: one pagination pass over the installation,
  // filtered by every configured owner at once — not one pass per owner.
  return listGitHubRepositories({ owners, query: options.query });
}

// ---------------------------------------------------------------------------
// GET /onboarding/azure/repos
// ---------------------------------------------------------------------------

/**
 * Same authorization shape as the GitHub import above: `teamId` is
 * required, the organization is derived server-side, and
 * `getAzureDevOpsClient` (WP-BE8) itself only resolves a connection scoped
 * to that organization — an unconfigured or cross-organization
 * `connectionId` surfaces as a 400, never another organization's data.
 */
export async function listImportableAzureRepositories(
  userId: string,
  options: { teamId: string; connectionId?: string; query?: string }
): Promise<ImportableAzureRepository[]> {
  if (!options.teamId || typeof options.teamId !== "string") {
    throw Errors.validation({ teamId: "required" });
  }
  await requireTeamAccess(userId, options.teamId);
  const organizationId = await getTeamOrgId(options.teamId);
  if (!organizationId) throw Errors.notFound("Team");

  try {
    return await listAzureDevOpsRepositories(organizationId, options.connectionId, options.query);
  } catch (err: any) {
    throw Errors.badRequest(err.message ?? "Could not list Azure DevOps repositories");
  }
}

// ---------------------------------------------------------------------------
// PUT /onboarding/runs/:id/repositories
// ---------------------------------------------------------------------------

export interface RepositorySelectionParam {
  fullName: string;
  selected?: boolean;
}

export async function setRunRepositories(
  userId: string,
  runId: string,
  repositories: RepositorySelectionParam[]
): Promise<OnboardingRunView> {
  const run = await requireRunAccess(userId, runId);

  if (run.status !== "draft") {
    throw Errors.conflict(`Repository selection can only be changed while the run is in "draft" (currently "${run.status}")`);
  }

  if (!Array.isArray(repositories) || repositories.length === 0) {
    throw Errors.validation({ repositories: "at least one repository is required" });
  }
  if (repositories.length > MAX_REPOSITORIES_PER_RUN) {
    throw Errors.validation({ repositories: `at most ${MAX_REPOSITORIES_PER_RUN} repositories are allowed per run` });
  }
  for (const repo of repositories) {
    // Strictly validated by the shared full_name parser
    // (services/repositories/fullName) — the same one PR opening, mesh
    // ingest and work-item filing use — so a name accepted here can never
    // fail to split (or split into the wrong segments) later.
    if (!repo || inferRepositoryProvider(repo.fullName) === null) {
      throw Errors.validation({
        repositories: `each entry needs a "fullName" like "owner/repo" (GitHub) or "adoOrg/project/repo" (Azure Repos)`,
      });
    }
  }

  const input: RepositorySelectionInput[] = repositories.map((r) => ({
    fullName: r.fullName,
    selected: r.selected ?? true,
  }));

  await replaceRunRepositories(runId, input);

  const updated = await updateRun(runId, { step: "connect" });
  logger.info(`[onboarding] repositories set (run=${runId}, count=${repositories.length})`);
  return toView(updated);
}

// ---------------------------------------------------------------------------
// POST /onboarding/runs/:id/start
// ---------------------------------------------------------------------------

/**
 * Applies a completed (or failed) sandbox job result to a run: fills in
 * per-repository detection/generation results and advances the state
 * machine. Exported so a real dispatcher (WP-BE6) or a future job-status
 * webhook can call it directly with a `JobResult`, not only the in-memory
 * dispatcher's synchronous callback.
 */
export async function applySandboxResult(result: JobResult): Promise<void> {
  const run = await getRunById(result.runId);
  if (!run) {
    logger.warn(`[onboarding] sandbox result for unknown run ${result.runId}`);
    return;
  }
  if (run.status !== "running") {
    // Already moved on (e.g. cancelled) — ignore a late/duplicate callback.
    logger.info(`[onboarding] ignoring sandbox result for run ${result.runId} in status "${run.status}"`);
    return;
  }

  if (result.status === "failed") {
    await updateRun(result.runId, { status: "failed", logBlob: result.logBlob ?? null });
    logger.warn(`[onboarding] sandbox run failed (run=${result.runId}): ${result.error ?? "unknown error"}`);
    return;
  }

  for (const repo of result.repositories) {
    await updateRunRepositoryByFullName(result.runId, repo.fullName, {
      detectedProfile: repo.detectedProfile ?? null,
      detectedStack: repo.detectedStack ?? null,
      detectedBuild: repo.detectedBuild ?? null,
      detectedCi: repo.detectedCi ?? null,
      part: repo.part ?? null,
      review: repo.review ?? {},
      generatedManifest: repo.generatedManifest ?? [],
      baselineCounts: repo.baselineCounts ?? {},
    });
  }

  await updateRun(result.runId, { status: "ready", step: "output", logBlob: result.logBlob ?? null });
  logger.info(`[onboarding] sandbox run ready (run=${result.runId})`);
}

export async function startRun(userId: string, runId: string): Promise<OnboardingRunView> {
  const run = await requireRunAccess(userId, runId);

  const repositories = await listRepositoriesForRun(runId);
  const selected = repositories.filter((r) => r.selected);
  if (selected.length === 0) {
    throw Errors.validation({ repositories: "select at least one repository before starting" });
  }

  // Atomic claim (fix round 1, item 1): only a run whose status is still
  // "draft" *at the moment Postgres applies this UPDATE* is claimed. Two
  // concurrent POST /start calls for the same run race here, not after —
  // exactly one gets the row back and goes on to dispatch the sandbox job;
  // the other gets `null` and 409s without ever dispatching a second job.
  const claimed = await claimRunTransition(runId, "draft", { status: "running", step: "sandbox" });
  if (!claimed) {
    throw Errors.conflict(describeInvalidTransition(run.status, "running"));
  }

  const dispatcher = getJobDispatcher();
  // Fix round 2, item 6: forward the dispatcher's progress onto this run's
  // `onboarding-{runId}` realtime channel (contracts/api.md), so the wizard
  // sees log/step/done events as the sandbox job runs, not just the final
  // ready/failed state.
  const { jobExecutionId } = await dispatcher.dispatch(
    { runId, teamId: run.team_id, packVersion: run.pack_version, repositories: selected.map((r) => ({ fullName: r.full_name })) },
    applySandboxResult,
    (event: JobProgressEvent) => broadcastOnboardingProgress(runId, event)
  );

  const updated = await updateRun(runId, { jobExecutionId });
  logger.info(`[onboarding] sandbox job dispatched (run=${runId}, jobExecutionId=${jobExecutionId})`);
  return toView(updated);
}

// ---------------------------------------------------------------------------
// GET /onboarding/runs/:id/output
// ---------------------------------------------------------------------------

const OUTPUT_READY_STATUSES = ["ready", "prs_open", "completed"];

export async function getRunOutput(userId: string, runId: string): Promise<OnboardingRunView> {
  const run = await requireRunAccess(userId, runId);
  if (!OUTPUT_READY_STATUSES.includes(run.status)) {
    throw Errors.conflict(`Output is not available while the run is "${run.status}"`);
  }
  return toView(run);
}

// ---------------------------------------------------------------------------
// POST /onboarding/runs/:id/pull-requests
// ---------------------------------------------------------------------------

const PR_ELIGIBLE_STATUSES = ["ready", "prs_open"];

/**
 * The source-control provider hosting a repository, from its `full_name`
 * shape (2 segments → GitHub, 3 → Azure Repos; services/repositories/
 * fullName). Fix round 3: this used to be inferred from `detected_ci`, which
 * is the CI system the sandbox detected, not where the repository lives — a
 * GitHub repository built with Azure Pipelines was routed to the Azure Repos
 * PR code (and vice versa) and its `full_name` split the wrong way.
 */
function providerForRepository(fullName: string): RepositoryProvider | null {
  return inferRepositoryProvider(fullName);
}

/**
 * The onboarding PR's body (fix round 1, item 2): tells the repository
 * owner how the mesh CI authenticates its report submissions — by name only,
 * matching the pack's own setup docs (research D-10, WP-BE7's templates) —
 * and never includes the secret's actual value. `applicationName` and
 * `packVersion` are user/pack-controlled strings, so both are Markdown-escaped
 * (fix round 1, item 7) before going into the PR body.
 */
function buildOnboardingPrBody(run: OnboardingRunRow, reportSecretRef: string): string {
  return (
    `Opened automatically by Pronghorn onboarding for **${escapeMarkdown(run.application_name)}**` +
    ` (pack ${escapeMarkdown(run.pack_version ?? "latest")}).\n\n` +
    "This adds the standards pack's CI workflow so pull requests to the default branch run the mesh.\n\n" +
    `Before merging, add the repository secret referenced as \`${reportSecretRef}\` ` +
    "(see the pack's CI setup docs for the exact secret/variable name your CI needs) so the mesh run " +
    "can sign its report submissions. Do not commit the secret value anywhere in this repository."
  );
}

interface ExistingRegistration {
  applicationId: string;
  organizationId: string;
  reportSecretRef: string | null;
  defaultBranch: string | null;
}

/**
 * The `application_repositories` row already registered for `fullName`, if
 * any, plus which organization owns it (via `applications.team_id ->
 * teams.organization_id`). Shared by {@link resolveReportSecretRef} (must
 * never reuse a secret across organizations — fix round 2, item 1) and
 * {@link linkApplicationForRun} (must never silently reassign a repository
 * to a different application — same item).
 */
async function getExistingRegistration(fullName: string): Promise<ExistingRegistration | null> {
  const { rows } = await db.query(
    `SELECT ar.application_id, ar.report_secret_ref, ar.default_branch, t.organization_id
     FROM public.application_repositories ar
     JOIN public.applications a ON a.id = ar.application_id
     JOIN public.teams t ON t.id = a.team_id
     WHERE ar.full_name = $1`,
    [fullName]
  );
  if (!rows[0]) return null;
  return {
    applicationId: rows[0].application_id,
    organizationId: rows[0].organization_id,
    reportSecretRef: rows[0].report_secret_ref ?? null,
    defaultBranch: rows[0].default_branch ?? null,
  };
}

async function mintReportSecret(): Promise<string> {
  const secretValue = crypto.randomBytes(32).toString("hex");
  return getSecretStore().createSecret("onboarding-mesh", secretValue);
}

/**
 * Resolve the HMAC report secret for a repository (fix round 1, item 2;
 * scoped to the caller's organization in fix round 2, item 1): reuses
 * `application_repositories.report_secret_ref` only when the existing row
 * belongs to `organizationId` — the caller's own organization, never
 * another tenant's. A row registered to a *different* organization (or no
 * row at all) gets a brand-new 256-bit random value, written to the
 * platform's secret store (`services/integrations/secretStore` — the same
 * Key Vault-backed store WP-BE8 uses, so `report_secret_ref` is a Key Vault
 * secret name in production, matching the format
 * `services/mesh/secretResolver.ts` expects when it later reads it back to
 * verify a mesh report's signature). Only the reference is ever persisted or
 * logged — the secret value returned by `createSecret` is used once, here,
 * and discarded. Reusing another organization's reference would let this
 * organization forge/verify mesh reports for a repository it does not own.
 */
async function resolveReportSecretRef(fullName: string, organizationId: string): Promise<string> {
  const existing = await getExistingRegistration(fullName);
  if (existing?.reportSecretRef && existing.organizationId === organizationId) {
    return existing.reportSecretRef;
  }
  return mintReportSecret();
}

/**
 * Materializes the onboarded application (data-model.md §2/§3):
 * `onboarding_runs.application_id` is set once PRs are opened, and each
 * repository that got a PR is registered in `application_repositories` so
 * it immediately shows up in the team portfolio (WP-BE3). Reuses an
 * existing `applications` row if this run already has one (a retried
 * confirm call).
 *
 * Fix round 2, item 1: `full_name` is globally unique, but a repository
 * already registered to a *different* application (whether in this
 * organization or another one — e.g. someone else onboarded the same
 * GitHub repo first) is never silently reassigned here. Such a repository
 * is returned in `blocked` so the caller can surface a generic warning; its
 * `application_repositories` row (and whichever application it already
 * belongs to) is left untouched. The `ON CONFLICT ... WHERE` guard is
 * defense in depth against the same race a plain pre-check can't fully
 * close (two callers registering the same brand-new repository at once).
 *
 * `defaultBranchByRepo`/`secretRefByRepo` carry the values already resolved
 * for repositories opened *in this call* (fix round 1, items 2/3) — a
 * repository whose PR was opened on an earlier, partial confirm won't be in
 * either map, so its existing `default_branch` (fix round 2, item 2: never
 * defaulted back to "main" just because this call didn't just open its PR)
 * is looked up fresh, same as its `report_secret_ref` (never re-minted; see
 * {@link resolveReportSecretRef}).
 */
async function linkApplicationForRun(
  run: OnboardingRunRow,
  organizationId: string,
  repositoriesWithPr: OnboardingRunRepositoryRow[],
  defaultBranchByRepo: Map<string, string>,
  secretRefByRepo: Map<string, string>
): Promise<{ applicationId: string | null; blocked: string[] }> {
  const existingByRepo = new Map<string, ExistingRegistration | null>();
  for (const repo of repositoriesWithPr) {
    existingByRepo.set(repo.full_name, await getExistingRegistration(repo.full_name));
  }

  const applicationId = run.application_id;
  const blocked: string[] = [];
  const toLink: OnboardingRunRepositoryRow[] = [];

  for (const repo of repositoriesWithPr) {
    const existing = existingByRepo.get(repo.full_name);
    if (existing && (!applicationId || existing.applicationId !== applicationId)) {
      logger.warn(
        `[onboarding] not reassigning ${repo.full_name}: already registered to application ${existing.applicationId} (org=${existing.organizationId})`
      );
      blocked.push(repo.full_name);
      continue;
    }
    toLink.push(repo);
  }

  if (toLink.length === 0) {
    return { applicationId, blocked };
  }

  let resolvedApplicationId = applicationId;
  if (!resolvedApplicationId) {
    const { rows } = await db.query(
      `INSERT INTO public.applications (team_id, name, onboarded_at)
       VALUES ($1, $2, now())
       RETURNING id`,
      [run.team_id, run.application_name]
    );
    resolvedApplicationId = rows[0].id;
  }

  for (const repo of toLink) {
    const existing = existingByRepo.get(repo.full_name);
    const defaultBranch = defaultBranchByRepo.get(repo.full_name) ?? existing?.defaultBranch ?? "main";
    const reportSecretRef =
      secretRefByRepo.get(repo.full_name) ?? existing?.reportSecretRef ?? (await resolveReportSecretRef(repo.full_name, organizationId));

    await db.query(
      `INSERT INTO public.application_repositories
         (application_id, provider, full_name, default_branch, ci_provider, profile, stack_label, part, build_command, pinned_pack, connection_id, report_secret_ref)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       ON CONFLICT (full_name) DO UPDATE SET
         application_id = EXCLUDED.application_id,
         provider = EXCLUDED.provider,
         default_branch = EXCLUDED.default_branch,
         ci_provider = EXCLUDED.ci_provider,
         profile = EXCLUDED.profile,
         stack_label = EXCLUDED.stack_label,
         part = EXCLUDED.part,
         build_command = EXCLUDED.build_command,
         pinned_pack = EXCLUDED.pinned_pack,
         connection_id = EXCLUDED.connection_id,
         report_secret_ref = EXCLUDED.report_secret_ref,
         updated_at = now()
       WHERE application_repositories.application_id = EXCLUDED.application_id`,
      [
        resolvedApplicationId,
        providerForRepository(repo.full_name),
        repo.full_name,
        defaultBranch,
        repo.detected_ci,
        repo.detected_profile,
        repo.detected_stack,
        repo.part,
        repo.detected_build,
        run.pack_version,
        run.connection_id,
        reportSecretRef,
      ]
    );
  }

  return { applicationId: resolvedApplicationId, blocked };
}

/**
 * Opens one PR per selected repository. **Only** reachable when the caller
 * passes `confirm: true` (enforced here, not trusted from any earlier step)
 * and the run has reached `ready` (sandbox output exists to open PRs from).
 * Idempotent: a repository that already has a `pr_number` is skipped, so a
 * retried call (or a call repeated after a partial failure) never opens a
 * second PR for the same repository, and calling again once the run is
 * already `prs_open` simply reports the existing state.
 */
export async function openPullRequests(
  userId: string,
  runId: string,
  params: { confirm?: boolean }
): Promise<OnboardingRunView> {
  if (params.confirm !== true) {
    throw Errors.validation({ confirm: "must be explicitly set to true to open pull requests" });
  }

  const preCheck = await requireRunAccess(userId, runId);
  if (!PR_ELIGIBLE_STATUSES.includes(preCheck.status)) {
    throw Errors.conflict(`Pull requests can only be opened once the run is "ready" (currently "${preCheck.status}")`);
  }

  // Fix round 2, item 4: an atomic lease claim, not a transaction-held
  // advisory lock — the WHERE clause below re-validates eligibility AND
  // exclusivity in one statement, closing the same race the pre-check alone
  // couldn't (two concurrent confirms both passing it above). Unlike
  // holding a pooled connection open for this whole function's external
  // GitHub/Azure DevOps HTTP calls, this claims a lease as *data* on the row
  // and releases it in `finally` — the pool connection for each individual
  // statement is returned immediately, never held across network I/O.
  const run = await claimPrLease(runId);
  if (!run) {
    throw Errors.conflict("PR opening already in progress");
  }

  try {
    const organizationId = await getTeamOrgId(run.team_id);
    if (!organizationId) throw Errors.notFound("Team");

    const repositories = await listRepositoriesForRun(runId);
    const selected = repositories.filter((r) => r.selected);

    const errors: string[] = [];
    const openedNow: OnboardingRunRepositoryRow[] = [];
    const defaultBranchByRepo = new Map<string, string>();
    const secretRefByRepo = new Map<string, string>();

    // Fix round 1, item 10: persist a generic per-repository failure reason
    // (never the raw upstream error — item 9) into `review.prError`, merged
    // with whatever `review` the sandbox job already wrote, so it survives
    // for `toView` to surface as a warning. Cleared on a later success.
    const markRepoError = async (repo: OnboardingRunRepositoryRow, message: string) => {
      errors.push(`${repo.full_name}: ${message}`);
      await updateRunRepositoryByFullName(runId, repo.full_name, {
        review: { ...(repo.review ?? {}), prError: message },
      });
    };

    for (const repo of selected) {
      if (repo.pr_number) {
        // Already opened — idempotent no-op for this repository.
        continue;
      }

      const provider = providerForRepository(repo.full_name);
      if (!provider) {
        // Only reachable for a row written before selection-time validation
        // (setRunRepositories) was tightened.
        await markRepoError(repo, "invalid repository name");
        continue;
      }
      const files = (repo.generated_manifest ?? []) as Array<{ path: string; content: string }>;
      if (files.length === 0) {
        await markRepoError(repo, "no generated files to open a PR from");
        continue;
      }

      // Fix round 1, item 8: never write a generated file outside the mesh
      // CI's documented roots into a customer repository. One bad path
      // rejects the whole PR for that repository, not just that one file.
      const disallowedPath = findDisallowedPath(files);
      if (disallowedPath !== null) {
        logger.error(
          `[onboarding] rejected PR for ${repo.full_name} (run=${runId}): disallowed generated file path "${disallowedPath}"`
        );
        await markRepoError(repo, "generated manifest contains a disallowed path");
        continue;
      }

      try {
        // Fix round 1, item 2 (org-scoped in fix round 2, item 1): mint (or
        // reuse this organization's own) HMAC report secret before opening
        // the PR, so its reference can be named in the PR body — the value
        // itself never appears there or anywhere else outside the secret
        // store.
        const secretRef = await resolveReportSecretRef(repo.full_name, organizationId);
        secretRefByRepo.set(repo.full_name, secretRef);

        const result = await openRepositoryPullRequest({
          provider,
          fullName: repo.full_name,
          organizationId,
          connectionId: run.connection_id,
          branchName: `pronghorn-onboarding/${runId.slice(0, 8)}`,
          title: `Add the Assurance Mesh CI (${escapeMarkdown(run.pack_version ?? "latest pack")})`,
          body: buildOnboardingPrBody(run, secretRef),
          files,
        });

        defaultBranchByRepo.set(repo.full_name, result.defaultBranch);

        // Success: clear any prError/applicationLinkWarning a previous
        // attempt left behind.
        const { prError: _clearedPrError, applicationLinkWarning: _clearedLinkWarning, ...clearedReview } =
          (repo.review ?? {}) as Record<string, unknown> & { prError?: string; applicationLinkWarning?: string };
        await updateRunRepositoryByFullName(runId, repo.full_name, {
          prNumber: result.prNumber,
          prState: result.prState,
          review: clearedReview,
        });
        openedNow.push({ ...repo, pr_number: result.prNumber, pr_state: result.prState, review: clearedReview });
      } catch (err: any) {
        // Item 9: log the real error (which may include upstream response
        // detail); the client and the persisted warning only ever see a
        // fixed, generic message.
        logger.error(`[onboarding] failed to open PR for ${repo.full_name} (run=${runId}): ${err.message}`);
        await markRepoError(repo, sanitizeUpstreamError(err));
      }
    }

    if (errors.length > 0 && errors.length === selected.length) {
      // Every repository failed — stay in "ready" so a retry is a clean
      // confirm, not a partially-applied "prs_open".
      throw Errors.internal(`Could not open any pull requests: ${errors.join("; ")}`);
    }

    // Repositories with a PR now, whether opened just now or on an earlier
    // (partial) confirm — register/refresh all of them under the application.
    const reposWithPr = selected
      .map((r) => openedNow.find((o) => o.full_name === r.full_name) ?? r)
      .filter((r) => r.pr_number);

    // Built up from `run` (the authoritative row the lease claim returned)
    // — never re-read afterward, so the returned view reflects exactly what
    // this call itself committed.
    let updated: OnboardingRunRow = run;

    if (reposWithPr.length > 0) {
      const { applicationId, blocked } = await linkApplicationForRun(
        run,
        organizationId,
        reposWithPr,
        defaultBranchByRepo,
        secretRefByRepo
      );
      if (!run.application_id && applicationId) {
        updated = await updateRun(runId, { applicationId });
      }

      // Fix round 2, item 1: a repository whose PR opened successfully but
      // that already belongs to a different application is not reassigned
      // — surface that as a warning rather than silently dropping it.
      for (const fullName of blocked) {
        const repo = reposWithPr.find((r) => r.full_name === fullName);
        await updateRunRepositoryByFullName(runId, fullName, {
          review: { ...(repo?.review ?? {}), applicationLinkWarning: "already onboarded elsewhere" },
        });
      }
    }

    // Checked against `run` (the authoritative snapshot from the lease
    // claim), not `updated` — this call and the applicationId one above are
    // independent writes; a real `UPDATE ... RETURNING` always reflects
    // both once committed, but nothing here should depend on that.
    if (run.status !== "prs_open") {
      updated = await updateRun(runId, { status: "prs_open", step: "prs" });
    }

    const view = await toView(updated);

    if (errors.length > 0) {
      logger.warn(`[onboarding] some pull requests failed (run=${runId}): ${errors.join("; ")}`);
    }

    return view;
  } finally {
    await releasePrLease(runId);
  }
}

// ---------------------------------------------------------------------------
// POST /onboarding/runs/:id/cancel
// ---------------------------------------------------------------------------

export async function cancelRun(userId: string, runId: string): Promise<OnboardingRunView> {
  const run = await requireRunAccess(userId, runId);

  if (isTerminal(run.status)) {
    throw Errors.conflict(`Onboarding run is already "${run.status}"`);
  }
  if (!canTransition(run.status, "cancelled")) {
    throw Errors.conflict(describeInvalidTransition(run.status, "cancelled"));
  }

  if (run.job_execution_id) {
    try {
      await getJobDispatcher().cancel(run.job_execution_id);
    } catch (err: any) {
      logger.warn(`[onboarding] failed to cancel job execution ${run.job_execution_id} for run ${runId}: ${err.message}`);
    }
  }

  const updated = await updateRun(runId, { status: "cancelled" });
  logger.info(`[onboarding] run cancelled (run=${runId})`);
  return toView(updated);
}
