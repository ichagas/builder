/**
 * Mesh policy resolution (spec 007, WP-BE4, T122; data-model.md §2
 * `mesh_policy`; research D-15, D-17).
 *
 * A policy row is keyed by `(scope, scope_id, agent)` with `scope` one of
 * `organization | team | application | repository` (repository was added to
 * the check constraint in migration 014 — see its comment). Effective policy
 * for a repository/agent resolves the narrowest-to-widest chain:
 *
 *   repository -> application -> team -> organization -> default ("issue")
 *
 * **Tighten-only ordering** (this task's to pick and document):
 *
 *   off (0) < notify (1) < issue (2) < block (3)
 *
 * `off` takes no action at all; `notify` only notifies the team; `issue`
 * additionally opens a tracked issue/work item; `block` fails the CI job.
 * That is both the enforcement strength and the ordering team owners must
 * respect when they narrow a policy: a team owner (or application/repository
 * owner) may only move a check to an equal-or-higher rank than whatever
 * currently applies there — never loosen it. Organization admins are not
 * bound by this rule for any scope in their organization.
 *
 * `cyber_risk_sandbox` (D-17) is a boolean gate at application/repository
 * scope; it is treated as an "off/on" pair on the same tighten rule
 * (false=0 < true=1) so owners may enable it but not disable an
 * org-mandated sandbox.
 */
import db from "../../utils/database";

export type PolicyMode = "off" | "notify" | "issue" | "block";
export type PolicyScope = "organization" | "team" | "application" | "repository";
export const AGENTS = ["green", "yellow", "red", "blue"] as const;
export type MeshAgent = (typeof AGENTS)[number];

export const DEFAULT_MODE: PolicyMode = "issue";

/** off < notify < issue < block — see module doc. */
export const MODE_RANK: Record<PolicyMode, number> = {
  off: 0,
  notify: 1,
  issue: 2,
  block: 3,
};

export function isPolicyMode(value: unknown): value is PolicyMode {
  return typeof value === "string" && value in MODE_RANK;
}

/** A resolved ancestor chain, narrowest first, for a scope/scopeId pair. */
interface ScopeLink {
  scope: PolicyScope;
  scopeId: string;
}

/**
 * Resolve the ancestor chain for a scope/scopeId, narrowest first, ending at
 * `organization`. Returns `[]` when the row/id doesn't resolve (unknown id).
 */
export async function resolveScopeChain(scope: PolicyScope, scopeId: string): Promise<ScopeLink[]> {
  if (scope === "organization") {
    return [{ scope: "organization", scopeId }];
  }

  if (scope === "team") {
    const { rows } = await db.query(`SELECT organization_id FROM public.teams WHERE id = $1`, [scopeId]);
    const orgId = rows[0]?.organization_id;
    if (!orgId) return [];
    return [
      { scope: "team", scopeId },
      { scope: "organization", scopeId: orgId },
    ];
  }

  if (scope === "application") {
    const { rows } = await db.query(`SELECT team_id FROM public.applications WHERE id = $1`, [scopeId]);
    const teamId = rows[0]?.team_id;
    if (!teamId) return [];
    const rest = await resolveScopeChain("team", teamId);
    return [{ scope: "application", scopeId }, ...rest];
  }

  // repository
  const { rows } = await db.query(
    `SELECT application_id FROM public.application_repositories WHERE id = $1`,
    [scopeId],
  );
  const applicationId = rows[0]?.application_id;
  if (!applicationId) return [];
  const rest = await resolveScopeChain("application", applicationId);
  return [{ scope: "repository", scopeId }, ...rest];
}

/**
 * The effective mode for one agent at a scope/scopeId, resolving up the
 * chain to the nearest explicit row, else {@link DEFAULT_MODE}.
 */
export async function resolveEffectiveMode(
  scope: PolicyScope,
  scopeId: string,
  agent: MeshAgent,
): Promise<PolicyMode> {
  const chain = await resolveScopeChain(scope, scopeId);
  for (const link of chain) {
    const { rows } = await db.query(
      `SELECT mode FROM public.mesh_policy WHERE scope = $1 AND scope_id = $2 AND agent = $3`,
      [link.scope, link.scopeId, agent],
    );
    if (rows[0]?.mode) return rows[0].mode as PolicyMode;
  }
  return DEFAULT_MODE;
}

/** Effective mode for every agent at once (four lookups, reused across a run). */
export async function resolveEffectivePolicy(
  scope: PolicyScope,
  scopeId: string,
): Promise<Record<MeshAgent, PolicyMode>> {
  const entries = await Promise.all(
    AGENTS.map(async (agent) => [agent, await resolveEffectiveMode(scope, scopeId, agent)] as const),
  );
  return Object.fromEntries(entries) as Record<MeshAgent, PolicyMode>;
}

/**
 * The effective `cyber_risk_sandbox` flag (D-17), resolved the same way as
 * mode but only defined at `application`/`repository` scope (migration 014).
 * Chain lookups at `team`/`organization` scope are skipped since the column
 * is never set there.
 */
export async function resolveEffectiveSandbox(scope: PolicyScope, scopeId: string): Promise<boolean> {
  const chain = await resolveScopeChain(scope, scopeId);
  for (const link of chain) {
    if (link.scope !== "application" && link.scope !== "repository") continue;
    const { rows } = await db.query(
      `SELECT bool_or(cyber_risk_sandbox) AS enabled FROM public.mesh_policy WHERE scope = $1 AND scope_id = $2`,
      [link.scope, link.scopeId],
    );
    if (rows[0] && rows[0].enabled !== null) return Boolean(rows[0].enabled);
  }
  return false;
}

/**
 * Whether `newRank` respects the tighten-only rule relative to `currentRank`
 * (must be >= current). Org admins bypass this (checked by the caller).
 */
export function isTightenOrEqual(currentRank: number, newRank: number): boolean {
  return newRank >= currentRank;
}
