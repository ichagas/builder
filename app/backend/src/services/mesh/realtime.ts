/**
 * Realtime broadcasts and the "not reporting" rule for the Assurance Mesh
 * (spec 007, WP-BE4, T124; data-model.md "Realtime channels", research D-10).
 *
 * Every mesh-related event goes out on `team-{teamId}` (one channel per
 * team, matching the team portfolio view built in WP-BE3's
 * `routes/teams.ts`). This module is the single place that builds those
 * channel names and event payloads so `routes/mesh.ts` and
 * `routes/applications.ts` can't drift into inconsistent event shapes.
 *
 * "App added" has no call site in this WP (applications are created by the
 * onboarding wizard, WP-BE5/T140, not yet merged) — `broadcastApplicationAdded`
 * is exported for that route to call once it exists.
 */
import { broadcast } from "../../websocket";

/** Canonical channel name for a team's realtime events. */
export function teamChannel(teamId: string): string {
  return `team-${teamId}`;
}

export interface MeshRunReceivedPayload {
  teamId: string;
  applicationId: string;
  repositoryId: string;
  runId: string;
  prNumber: number | null;
  prState: string;
  newFindings: number;
}

export function broadcastMeshRunReceived(payload: MeshRunReceivedPayload): void {
  broadcast(teamChannel(payload.teamId), "mesh_run_received", payload);
}

export interface PrStateChangedPayload {
  teamId: string;
  applicationId: string;
  /** One or more repositories affected (a single mesh run, or an update-PR batch). */
  repositoryId?: string;
  runId?: string;
  prNumber?: number | null;
  prState?: string;
  results?: Array<{ repositoryId: string; opened: boolean }>;
}

export function broadcastPrStateChanged(payload: PrStateChangedPayload): void {
  broadcast(teamChannel(payload.teamId), "pr_state_changed", payload);
}

export interface ApplicationAddedPayload {
  teamId: string;
  applicationId: string;
  name: string;
}

/**
 * Not yet called from this WP's own routes (see module doc) — exported for
 * the application-creation route (WP-BE5 onboarding) to call once it lands.
 */
export function broadcastApplicationAdded(payload: ApplicationAddedPayload): void {
  broadcast(teamChannel(payload.teamId), "app_added", payload);
}

// ---------------------------------------------------------------------------
// "Not reporting" rule (research D-10: "No report for 7 days means
// 'not reporting'"). Kept as both a SQL predicate (for queries that compute
// it in-database, e.g. teams.ts's portfolio) and a plain JS predicate (for
// code building a response from rows already fetched), so every place this
// is surfaced uses the exact same rule.
// ---------------------------------------------------------------------------

export const NOT_REPORTING_DAYS = 7;

/**
 * SQL boolean expression for "not reporting", assuming `ar` is the
 * application_repositories row alias and `a` the owning applications row
 * alias (matches routes/teams.ts's portfolio query). A repository that
 * hasn't onboarded yet (no first run) is never "not reporting" — there's
 * nothing to report yet.
 */
export const NOT_REPORTING_SQL = `(
  a.onboarded_at IS NOT NULL
  AND (ar.last_report_at IS NULL OR ar.last_report_at < now() - interval '${NOT_REPORTING_DAYS} days')
)`;

/** JS equivalent of {@link NOT_REPORTING_SQL}, for rows already fetched. */
export function isNotReporting(onboardedAt: string | Date | null, lastReportAt: string | Date | null): boolean {
  if (!onboardedAt) return false;
  if (!lastReportAt) return true;
  const lastReportMs = new Date(lastReportAt).getTime();
  if (Number.isNaN(lastReportMs)) return true;
  return Date.now() - lastReportMs > NOT_REPORTING_DAYS * 24 * 60 * 60 * 1000;
}
