/**
 * Data access for `onboarding_runs` / `onboarding_run_repositories`
 * (spec 007, epic B3, migration `015_onboarding.sql`).
 */
import db from "../../utils/database";

export type OnboardingStatus =
  | "draft"
  | "running"
  | "ready"
  | "prs_open"
  | "completed"
  | "failed"
  | "cancelled";

export type OnboardingStep = "team" | "connect" | "sandbox" | "output" | "prs";

export interface OnboardingRunRow {
  id: string;
  team_id: string;
  application_name: string;
  application_id: string | null;
  pack_version: string | null;
  status: OnboardingStatus;
  step: OnboardingStep;
  job_execution_id: string | null;
  log_blob: string | null;
  connection_id: string | null;
  /**
   * Key Vault secret name (never the secret itself) holding this run's HMAC
   * key for `POST /onboarding/runs/:id/callback` (WP-BE6, migration 022).
   * Null before the run is dispatched, or for a dispatcher that never needs
   * an out-of-process callback.
   */
  callback_secret_ref: string | null;
  started_by: string;
  /**
   * Set (a few minutes in the future) while a POST .../pull-requests call is
   * in flight for this run (fix round 2, item 4); a second, concurrent call
   * sees a still-future value and 409s instead of racing the first. See
   * {@link claimPrLease}/{@link releasePrLease}.
   */
  pr_lease_until: string | null;
  /**
   * Random token identifying which in-flight POST .../pull-requests call
   * holds the lease (fix round 3). Renewal and release only ever touch a
   * lease whose owner still matches, so a caller whose lease expired (and
   * was re-claimed by someone else) can neither extend nor clear it.
   */
  pr_lease_owner: string | null;
  created_at: string;
  updated_at: string;
}

export interface OnboardingRunRepositoryRow {
  id: string;
  run_id: string;
  full_name: string;
  selected: boolean;
  detected_profile: string | null;
  detected_stack: string | null;
  detected_build: string | null;
  detected_ci: string | null;
  part: string | null;
  review: Record<string, unknown>;
  generated_manifest: unknown[];
  baseline_counts: Record<string, unknown>;
  pr_number: number | null;
  pr_state: string | null;
  created_at: string;
  updated_at: string;
}

const RUN_COLUMNS = `
  id, team_id, application_name, application_id, pack_version, status, step,
  job_execution_id, log_blob, connection_id, callback_secret_ref, started_by,
  pr_lease_until, pr_lease_owner, created_at, updated_at
`;

const REPO_COLUMNS = `
  id, run_id, full_name, selected, detected_profile, detected_stack, detected_build,
  detected_ci, part, review, generated_manifest, baseline_counts, pr_number, pr_state,
  created_at, updated_at
`;

export interface CreateRunInput {
  teamId: string;
  applicationName: string;
  startedBy: string;
  packVersion?: string | null;
  connectionId?: string | null;
}

export async function createRun(input: CreateRunInput): Promise<OnboardingRunRow> {
  const { rows } = await db.query(
    `INSERT INTO public.onboarding_runs
       (team_id, application_name, pack_version, connection_id, started_by, status, step)
     VALUES ($1, $2, $3, $4, $5, 'draft', 'team')
     RETURNING ${RUN_COLUMNS}`,
    [input.teamId, input.applicationName, input.packVersion ?? null, input.connectionId ?? null, input.startedBy]
  );
  return rows[0];
}

export async function getRunById(runId: string): Promise<OnboardingRunRow | null> {
  const { rows } = await db.query(`SELECT ${RUN_COLUMNS} FROM public.onboarding_runs WHERE id = $1`, [runId]);
  return rows[0] ?? null;
}

export async function listRepositoriesForRun(runId: string): Promise<OnboardingRunRepositoryRow[]> {
  const { rows } = await db.query(
    `SELECT ${REPO_COLUMNS} FROM public.onboarding_run_repositories WHERE run_id = $1 ORDER BY full_name`,
    [runId]
  );
  return rows;
}

export interface UpdateRunFields {
  status?: OnboardingStatus;
  step?: OnboardingStep;
  jobExecutionId?: string | null;
  logBlob?: string | null;
  applicationId?: string | null;
  connectionId?: string | null;
  callbackSecretRef?: string | null;
}

function buildRunUpdateSets(fields: UpdateRunFields): { sets: string[]; values: unknown[]; next: number } {
  const sets: string[] = [];
  const values: unknown[] = [];
  let i = 1;

  if (fields.status !== undefined) {
    sets.push(`status = $${i++}`);
    values.push(fields.status);
  }
  if (fields.step !== undefined) {
    sets.push(`step = $${i++}`);
    values.push(fields.step);
  }
  if (fields.jobExecutionId !== undefined) {
    sets.push(`job_execution_id = $${i++}`);
    values.push(fields.jobExecutionId);
  }
  if (fields.logBlob !== undefined) {
    sets.push(`log_blob = $${i++}`);
    values.push(fields.logBlob);
  }
  if (fields.applicationId !== undefined) {
    sets.push(`application_id = $${i++}`);
    values.push(fields.applicationId);
  }
  if (fields.connectionId !== undefined) {
    sets.push(`connection_id = $${i++}`);
    values.push(fields.connectionId);
  }
  if (fields.callbackSecretRef !== undefined) {
    sets.push(`callback_secret_ref = $${i++}`);
    values.push(fields.callbackSecretRef);
  }

  sets.push(`updated_at = now()`);
  return { sets, values, next: i };
}

export async function updateRun(runId: string, fields: UpdateRunFields): Promise<OnboardingRunRow> {
  const { sets, values, next } = buildRunUpdateSets(fields);
  values.push(runId);
  const { rows } = await db.query(
    `UPDATE public.onboarding_runs SET ${sets.join(", ")} WHERE id = $${next} RETURNING ${RUN_COLUMNS}`,
    values
  );
  return rows[0];
}

/**
 * Atomically claim a status transition: the `UPDATE` only takes effect when
 * the row's *current* status still matches `fromStatus` at the moment
 * Postgres evaluates the `WHERE` clause. Two concurrent callers racing to
 * start (or open PRs for) the same run can both read `fromStatus` from a
 * prior `SELECT`, but only one of the resulting `UPDATE`s can match — the
 * other sees 0 rows and gets `null` back, which callers must treat as "lost
 * the race, someone else already made this transition" (typically a 409),
 * never as "the run doesn't exist". This makes the state-machine transition
 * itself atomic without needing an explicit lock, relying on Postgres's
 * normal per-row MVCC semantics for a single-statement `UPDATE ... WHERE`.
 */
export async function claimRunTransition(
  runId: string,
  fromStatus: OnboardingStatus,
  fields: UpdateRunFields
): Promise<OnboardingRunRow | null> {
  const { sets, values, next } = buildRunUpdateSets(fields);
  values.push(runId, fromStatus);
  const { rows } = await db.query(
    `UPDATE public.onboarding_runs SET ${sets.join(", ")}
     WHERE id = $${next} AND status = $${next + 1}
     RETURNING ${RUN_COLUMNS}`,
    values
  );
  return rows[0] ?? null;
}

/** How long a PR-opening lease lasts from its last claim/renewal. */
export const PR_LEASE_DURATION_MINUTES = 10;
/**
 * Renew once less than this much of the lease is left (half the duration):
 * `openPullRequests` calls {@link renewPrLease} before every repository, and
 * the renewal only extends when the remaining time has dropped below this.
 */
export const PR_LEASE_RENEW_BELOW_MINUTES = PR_LEASE_DURATION_MINUTES / 2;

/**
 * Atomically claim the short-lived "PR opening in progress" lease for a run
 * (fix round 2, item 4; owner token added in fix round 3): a single
 * `UPDATE ... WHERE ... RETURNING`, matched only when the run's status is
 * eligible AND its lease is unset or already expired. Two concurrent
 * confirms for the same run race here — only one `UPDATE` can match, the
 * other gets `null` back (the caller 409s: "PR opening already in
 * progress"). Unlike a transaction-held advisory lock, this claims, renews
 * and releases in independent, short statements, so the pool connection is
 * never held across the external GitHub/Azure DevOps HTTP calls
 * `openPullRequests` makes while "holding" the lease — only the lease *row
 * itself* is held, as data, not as a database connection/transaction.
 *
 * `ownerToken` (a fresh random UUID per call) is stored alongside the
 * expiry; {@link renewPrLease} and {@link releasePrLease} are both guarded
 * on it. Callers must call {@link releasePrLease} in a `finally` so a lease
 * is never stuck for its full duration after a request that already
 * finished (successfully or not).
 */
export async function claimPrLease(runId: string, ownerToken: string): Promise<OnboardingRunRow | null> {
  const { rows } = await db.query(
    `UPDATE public.onboarding_runs
     SET pr_lease_until = now() + make_interval(mins => $3), pr_lease_owner = $2, updated_at = now()
     WHERE id = $1
       AND status IN ('ready', 'prs_open')
       AND (pr_lease_until IS NULL OR pr_lease_until < now())
     RETURNING ${RUN_COLUMNS}`,
    [runId, ownerToken, PR_LEASE_DURATION_MINUTES]
  );
  return rows[0] ?? null;
}

/**
 * Keep a held lease alive during a long PR-opening loop (fix round 3):
 * extends it to a full {@link PR_LEASE_DURATION_MINUTES} from now when less
 * than {@link PR_LEASE_RENEW_BELOW_MINUTES} is left, otherwise leaves the
 * expiry as is. Guarded on `pr_lease_owner = ownerToken`, so it can never
 * extend (steal) a lease another caller claimed after ours expired — that
 * caller's claim replaced the owner token. Returns `false` when the lease is
 * no longer ours; the caller must stop acting on the run.
 *
 * Deliberately not also guarded on `pr_lease_until > now()`: if our lease
 * lapsed but nobody claimed it in the meantime, the owner token is still
 * ours (a claim overwrites it, a release clears it), so re-extending is
 * safe and avoids failing a slow-but-uncontended run.
 *
 * Both times are Postgres's `now()`, so there is no app/DB clock skew.
 */
export async function renewPrLease(runId: string, ownerToken: string): Promise<boolean> {
  const { rows } = await db.query(
    `UPDATE public.onboarding_runs
     SET pr_lease_until = CASE
           WHEN pr_lease_until IS NULL OR pr_lease_until < now() + make_interval(mins => $4)
             THEN now() + make_interval(mins => $3)
           ELSE pr_lease_until
         END
     WHERE id = $1 AND pr_lease_owner = $2
     RETURNING pr_lease_until`,
    [runId, ownerToken, PR_LEASE_DURATION_MINUTES, PR_LEASE_RENEW_BELOW_MINUTES]
  );
  return rows.length > 0;
}

/**
 * Release a run's PR-opening lease — only if `ownerToken` still holds it
 * (fix round 3). Idempotent, and a no-op for a lease someone else has since
 * claimed, so a caller whose lease expired mid-run can't clear the new
 * holder's lease on its way out.
 */
export async function releasePrLease(runId: string, ownerToken: string): Promise<void> {
  await db.query(
    `UPDATE public.onboarding_runs SET pr_lease_until = NULL, pr_lease_owner = NULL, updated_at = now()
     WHERE id = $1 AND pr_lease_owner = $2`,
    [runId, ownerToken]
  );
}

export interface RepositorySelectionInput {
  fullName: string;
  selected?: boolean;
  detectedProfile?: string | null;
  detectedStack?: string | null;
  detectedBuild?: string | null;
  detectedCi?: string | null;
  part?: string | null;
}

/**
 * Replace the run's repository selection: deletes rows no longer present and
 * upserts the given ones. Runs inside a transaction so a repeated PUT with
 * the same body is idempotent (no duplicate rows — the unique index on
 * `(run_id, full_name)` also guards this at the DB level).
 */
export async function replaceRunRepositories(
  runId: string,
  repositories: RepositorySelectionInput[]
): Promise<OnboardingRunRepositoryRow[]> {
  const fullNames = repositories.map((r) => r.fullName);

  await db.query(
    `DELETE FROM public.onboarding_run_repositories
     WHERE run_id = $1 AND NOT (full_name = ANY($2::text[]))`,
    [runId, fullNames]
  );

  for (const repo of repositories) {
    await db.query(
      `INSERT INTO public.onboarding_run_repositories
         (run_id, full_name, selected, detected_profile, detected_stack, detected_build, detected_ci, part)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (run_id, full_name) DO UPDATE SET
         selected = EXCLUDED.selected,
         detected_profile = EXCLUDED.detected_profile,
         detected_stack = EXCLUDED.detected_stack,
         detected_build = EXCLUDED.detected_build,
         detected_ci = EXCLUDED.detected_ci,
         part = EXCLUDED.part,
         updated_at = now()`,
      [
        runId,
        repo.fullName,
        repo.selected ?? true,
        repo.detectedProfile ?? null,
        repo.detectedStack ?? null,
        repo.detectedBuild ?? null,
        repo.detectedCi ?? null,
        repo.part ?? null,
      ]
    );
  }

  return listRepositoriesForRun(runId);
}

export interface RepositoryResultUpdate {
  detectedProfile?: string | null;
  detectedStack?: string | null;
  detectedBuild?: string | null;
  detectedCi?: string | null;
  part?: string | null;
  review?: Record<string, unknown>;
  generatedManifest?: unknown[];
  baselineCounts?: Record<string, unknown>;
  prNumber?: number | null;
  prState?: string | null;
}

export async function updateRunRepositoryByFullName(
  runId: string,
  fullName: string,
  fields: RepositoryResultUpdate
): Promise<OnboardingRunRepositoryRow | null> {
  const sets: string[] = [];
  const values: unknown[] = [];
  let i = 1;

  if (fields.detectedProfile !== undefined) {
    sets.push(`detected_profile = $${i++}`);
    values.push(fields.detectedProfile);
  }
  if (fields.detectedStack !== undefined) {
    sets.push(`detected_stack = $${i++}`);
    values.push(fields.detectedStack);
  }
  if (fields.detectedBuild !== undefined) {
    sets.push(`detected_build = $${i++}`);
    values.push(fields.detectedBuild);
  }
  if (fields.detectedCi !== undefined) {
    sets.push(`detected_ci = $${i++}`);
    values.push(fields.detectedCi);
  }
  if (fields.part !== undefined) {
    sets.push(`part = $${i++}`);
    values.push(fields.part);
  }
  if (fields.review !== undefined) {
    sets.push(`review = $${i++}`);
    values.push(JSON.stringify(fields.review));
  }
  if (fields.generatedManifest !== undefined) {
    sets.push(`generated_manifest = $${i++}`);
    values.push(JSON.stringify(fields.generatedManifest));
  }
  if (fields.baselineCounts !== undefined) {
    sets.push(`baseline_counts = $${i++}`);
    values.push(JSON.stringify(fields.baselineCounts));
  }
  if (fields.prNumber !== undefined) {
    sets.push(`pr_number = $${i++}`);
    values.push(fields.prNumber);
  }
  if (fields.prState !== undefined) {
    sets.push(`pr_state = $${i++}`);
    values.push(fields.prState);
  }

  if (sets.length === 0) {
    const { rows } = await db.query(
      `SELECT ${REPO_COLUMNS} FROM public.onboarding_run_repositories WHERE run_id = $1 AND full_name = $2`,
      [runId, fullName]
    );
    return rows[0] ?? null;
  }

  sets.push(`updated_at = now()`);
  values.push(runId, fullName);

  const { rows } = await db.query(
    `UPDATE public.onboarding_run_repositories SET ${sets.join(", ")}
     WHERE run_id = $${i++} AND full_name = $${i}
     RETURNING ${REPO_COLUMNS}`,
    values
  );
  return rows[0] ?? null;
}
