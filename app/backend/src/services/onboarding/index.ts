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
import { Errors } from "../../middleware/errorHandler";
import { logger } from "../../utils/logger";
import db from "../../utils/database";
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
  OnboardingRunRow,
  OnboardingRunRepositoryRow,
  RepositorySelectionInput,
} from "./repository";
import { canTransition, describeInvalidTransition, isTerminal } from "./stateMachine";
import { getJobDispatcher } from "./jobDispatcher";
import type { JobResult } from "./jobDispatcher";
import { listGitHubRepositories, ImportableRepository } from "./githubImport";
import { openRepositoryPullRequest } from "./pullRequests";

export interface OnboardingRunView extends OnboardingRunRow {
  repositories: OnboardingRunRepositoryRow[];
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

async function toView(run: OnboardingRunRow): Promise<OnboardingRunView> {
  const repositories = await listRepositoriesForRun(run.id);
  return { ...run, repositories };
}

async function getLatestPackVersion(): Promise<string | null> {
  const { rows } = await db.query(`SELECT version FROM public.standards_packs ORDER BY published_at DESC LIMIT 1`);
  return rows[0]?.version ?? null;
}

/**
 * Serializes the whole critical section for one onboarding run behind a
 * Postgres advisory transaction lock keyed by the run id (fix round 1,
 * item 1): two concurrent calls for the *same* run (e.g. a doubled-click
 * confirm, or a retry racing the original request) block on this lock
 * rather than both proceeding, so `openPullRequests` can safely re-read the
 * run's authoritative state once inside and never create two `applications`
 * rows for the same run. The lock is released automatically when the
 * transaction ends (commit or rollback), including on an unhandled
 * exception thrown by `fn`. `hashtext(...)::bigint` folds the run's uuid
 * into the bigint key `pg_advisory_xact_lock` requires.
 */
async function withRunLock<T>(runId: string, fn: () => Promise<T>): Promise<T> {
  return db.transaction(async (client) => {
    await client.query(`SELECT pg_advisory_xact_lock(hashtext($1)::bigint)`, [runId]);
    return fn();
  });
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

  await requireTeamAccess(userId, params.teamId);

  const profileId = await getProfileId(userId);
  if (!profileId) throw Errors.forbidden("No profile for this account");

  const packVersion = await getLatestPackVersion();

  const run = await createRun({
    teamId: params.teamId,
    applicationName: params.applicationName.trim(),
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

export async function listImportableGitHubRepositories(
  _userId: string,
  options: { org?: string; query?: string }
): Promise<ImportableRepository[]> {
  // Any authenticated user may browse the platform's installation repos —
  // there is no run/team context at this point in the wizard yet (the run
  // isn't created until the user names an app). Authentication itself is
  // enforced by the route's middleware.
  return listGitHubRepositories({ org: options.org, query: options.query });
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
  for (const repo of repositories) {
    if (!repo || typeof repo.fullName !== "string" || !repo.fullName.includes("/")) {
      throw Errors.validation({ repositories: `each entry needs a "fullName" like "org/repo"` });
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
  const { jobExecutionId } = await dispatcher.dispatch(
    { runId, teamId: run.team_id, packVersion: run.pack_version, repositories: selected.map((r) => ({ fullName: r.full_name })) },
    applySandboxResult
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

function providerForCi(detectedCi: string | null): "github" | "azure_devops" {
  return detectedCi === "azure_pipelines" ? "azure_devops" : "github";
}

/**
 * Materializes the onboarded application (data-model.md §2/§3):
 * `onboarding_runs.application_id` is set once PRs are opened, and each
 * repository that got a PR is registered in `application_repositories` so
 * it immediately shows up in the team portfolio (WP-BE3). Reuses an
 * existing `applications` row if this run already has one (a retried
 * confirm call). `full_name` is globally unique, so re-onboarding a
 * repository that was already registered (e.g. to a different application)
 * reassigns it rather than erroring.
 */
async function linkApplicationForRun(
  run: OnboardingRunRow,
  repositoriesWithPr: OnboardingRunRepositoryRow[]
): Promise<string> {
  let applicationId = run.application_id;

  if (!applicationId) {
    const { rows } = await db.query(
      `INSERT INTO public.applications (team_id, name, onboarded_at)
       VALUES ($1, $2, now())
       RETURNING id`,
      [run.team_id, run.application_name]
    );
    applicationId = rows[0].id;
  }

  for (const repo of repositoriesWithPr) {
    await db.query(
      `INSERT INTO public.application_repositories
         (application_id, provider, full_name, ci_provider, profile, stack_label, part, build_command, pinned_pack, connection_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (full_name) DO UPDATE SET
         application_id = EXCLUDED.application_id,
         provider = EXCLUDED.provider,
         ci_provider = EXCLUDED.ci_provider,
         profile = EXCLUDED.profile,
         stack_label = EXCLUDED.stack_label,
         part = EXCLUDED.part,
         build_command = EXCLUDED.build_command,
         pinned_pack = EXCLUDED.pinned_pack,
         connection_id = EXCLUDED.connection_id,
         updated_at = now()`,
      [
        applicationId,
        providerForCi(repo.detected_ci),
        repo.full_name,
        repo.detected_ci,
        repo.detected_profile,
        repo.detected_stack,
        repo.part,
        repo.detected_build,
        run.pack_version,
        run.connection_id,
      ]
    );
  }

  return applicationId as string;
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

  // Authorization only here — the authoritative status/application_id read
  // happens fresh once the run lock is held, below, never from this object.
  await requireRunAccess(userId, runId);

  // Fix round 1, item 1: serialize the whole PR-opening + application-link
  // critical section per run. Without this, two concurrent confirms (a
  // doubled click, or a client retry racing the original request) could
  // both read `application_id: null` and each create their own
  // `applications` row for the same run. Everything below re-reads the run
  // fresh, under the lock, so a second caller that was blocked here sees
  // whatever the first one committed (e.g. `application_id` already set,
  // or repositories that already have a `pr_number`) instead of stale data
  // captured before the lock was acquired.
  return withRunLock(runId, async () => {
    const run = await loadRunOrThrow(runId);

    if (!PR_ELIGIBLE_STATUSES.includes(run.status)) {
      throw Errors.conflict(`Pull requests can only be opened once the run is "ready" (currently "${run.status}")`);
    }

    const organizationId = await getTeamOrgId(run.team_id);
    if (!organizationId) throw Errors.notFound("Team");

    const repositories = await listRepositoriesForRun(runId);
    const selected = repositories.filter((r) => r.selected);

    const errors: string[] = [];
    const openedNow: OnboardingRunRepositoryRow[] = [];

    for (const repo of selected) {
      if (repo.pr_number) {
        // Already opened — idempotent no-op for this repository.
        continue;
      }

      const provider = providerForCi(repo.detected_ci);
      const files = (repo.generated_manifest ?? []) as Array<{ path: string; content: string }>;
      if (files.length === 0) {
        errors.push(`${repo.full_name}: no generated files to open a PR from`);
        continue;
      }

      try {
        const result = await openRepositoryPullRequest({
          provider,
          fullName: repo.full_name,
          organizationId,
          connectionId: run.connection_id,
          branchName: `pronghorn-onboarding/${runId.slice(0, 8)}`,
          title: `Add the Assurance Mesh CI (${run.pack_version ?? "latest pack"})`,
          body:
            `Opened automatically by Pronghorn onboarding for **${run.application_name}**.\n\n` +
            "This adds the standards pack's CI workflow so pull requests to the default branch run the mesh.",
          files,
        });

        await updateRunRepositoryByFullName(runId, repo.full_name, {
          prNumber: result.prNumber,
          prState: result.prState,
        });
        openedNow.push({ ...repo, pr_number: result.prNumber, pr_state: result.prState });
      } catch (err: any) {
        logger.error(`[onboarding] failed to open PR for ${repo.full_name} (run=${runId}): ${err.message}`);
        errors.push(`${repo.full_name}: ${err.message}`);
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

    // Built up from the authoritative `run` read under the lock — never
    // re-read afterward, so the returned view reflects exactly what this
    // call itself committed (no extra read that a concurrent writer,
    // blocked on the same lock until we're done, could never actually race).
    let updated: OnboardingRunRow = run;

    if (reposWithPr.length > 0) {
      const applicationId = await linkApplicationForRun(run, reposWithPr);
      if (!run.application_id) {
        updated = await updateRun(runId, { applicationId });
      }
    }

    // Checked against `run` (the authoritative snapshot from under the
    // lock), not `updated` — this call and the applicationId one above are
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
  });
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
