import { z } from "zod";
import { useMutation, useQuery, useQueryClient, type UseMutationResult, type UseQueryResult } from "@tanstack/react-query";
import apiClient from "@/lib/apiClient";
import { pronghornApi } from "@/integrations/pronghorn-api/client";

/**
 * Assurance API (T130, WP-A1). Typed TanStack Query hooks over the B2
 * endpoints (contracts/api.md "B2: Teams, applications, mesh"), validated
 * with zod per contracts/api.md §1 "New-capability WPs call the new
 * endpoints below through typed TanStack Query hooks in
 * features/<domain>/api.ts, validated with zod, and never with fetch in
 * components." Response shapes match `app/backend/src/routes/teams.ts`.
 */

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

/** GET /teams/mine row. */
export const teamSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  organization_id: z.string(),
  role: z.enum(["owner", "member"]),
});
export type TeamSummary = z.infer<typeof teamSummarySchema>;

/** GET /teams row (organization admins only, D-8). */
export const orgTeamSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  organization_id: z.string(),
  member_count: z.coerce.number(),
  application_count: z.coerce.number(),
});
export type OrgTeamSummary = z.infer<typeof orgTeamSummarySchema>;

const repositoryProviderSchema = z.enum(["github", "azure_devops"]);

/** A repository row inside GET /teams/:teamId/portfolio's applications[]. */
export const portfolioRepositorySchema = z.object({
  id: z.string(),
  provider: repositoryProviderSchema,
  full_name: z.string(),
  default_branch: z.string(),
  ci_provider: z.string().nullable(),
  profile: z.string().nullable(),
  stack_label: z.string().nullable(),
  part: z.string().nullable(),
  pinned_pack: z.string().nullable(),
  update_pr_number: z.number().nullable(),
  update_pr_state: z.string().nullable(),
  last_report_at: z.string().nullable(),
  not_reporting: z.boolean(),
});
export type PortfolioRepository = z.infer<typeof portfolioRepositorySchema>;

/** An application row inside GET /teams/:teamId/portfolio. */
export const portfolioApplicationSchema = z.object({
  id: z.string(),
  name: z.string(),
  owner_label: z.string().nullable(),
  onboarded_at: z.string().nullable(),
  repositories: z.array(portfolioRepositorySchema),
  repository_count: z.coerce.number(),
  not_reporting_count: z.coerce.number(),
});
export type PortfolioApplication = z.infer<typeof portfolioApplicationSchema>;

/** GET /teams/:teamId/portfolio. */
export const teamPortfolioSchema = z.object({
  teamId: z.string(),
  applications: z.array(portfolioApplicationSchema),
  totals: z.object({
    applications: z.coerce.number(),
    repositories: z.coerce.number(),
    notReporting: z.coerce.number(),
  }),
});
export type TeamPortfolio = z.infer<typeof teamPortfolioSchema>;

/** A `mesh_runs.verdicts` value: one of the four agents, each `pass`/`warn`/`fail`/`skip`. */
export const meshVerdictSchema = z.enum(["pass", "warn", "fail", "skip"]);
export const meshVerdictsSchema = z
  .object({ green: meshVerdictSchema, yellow: meshVerdictSchema, red: meshVerdictSchema, blue: meshVerdictSchema })
  .partial();
export type MeshVerdicts = z.infer<typeof meshVerdictsSchema>;

/** A repository's latest mesh run (T131, WP-A2) — `null` when it has never reported. */
export const latestMeshRunSchema = z
  .object({
    run_id: z.string(),
    verdicts: meshVerdictsSchema,
    pr_state: z.string().nullable(),
    pr_number: z.number().nullable(),
    new_findings: z.coerce.number(),
    received_at: z.string(),
  })
  .nullable();
export type LatestMeshRun = z.infer<typeof latestMeshRunSchema>;

/** A repository row inside GET /applications/:appId's repositories[]. */
export const applicationRepositorySchema = z.object({
  id: z.string(),
  provider: repositoryProviderSchema,
  full_name: z.string(),
  default_branch: z.string(),
  ci_provider: z.string().nullable(),
  profile: z.string().nullable(),
  stack_label: z.string().nullable(),
  part: z.string().nullable(),
  build_command: z.string().nullable().optional(),
  pinned_pack: z.string().nullable(),
  update_pr_number: z.number().nullable(),
  update_pr_state: z.string().nullable(),
  last_report_at: z.string().nullable(),
  not_reporting: z.boolean(),
  latest_run: latestMeshRunSchema,
});
export type ApplicationRepository = z.infer<typeof applicationRepositorySchema>;

/** A row inside GET /applications/:appId's exceptions[] (mesh_exceptions). */
export const meshExceptionSchema = z.object({
  id: z.string(),
  repository_id: z.string(),
  rule: z.string(),
  reason: z.string().nullable(),
  approved_by: z.string().nullable(),
  expires_at: z.string(),
  created_at: z.string(),
});
export type MeshException = z.infer<typeof meshExceptionSchema>;

/** GET /applications/:appId — the application page's single aggregate. */
export const applicationDetailSchema = z.object({
  id: z.string(),
  team_id: z.string(),
  name: z.string(),
  owner_label: z.string().nullable(),
  onboarded_at: z.string().nullable(),
  repositories: z.array(applicationRepositorySchema),
  adoption: z.object({
    latestPackVersion: z.string().nullable(),
    reposOnLatest: z.coerce.number(),
    totalRepos: z.coerce.number(),
    ratio: z.number().nullable(),
  }),
  exceptions: z.array(meshExceptionSchema),
});
export type ApplicationDetail = z.infer<typeof applicationDetailSchema>;

/** One repository's result from POST /applications/:appId/update-prs. */
export const updatePrResultSchema = z.object({
  repositoryId: z.string(),
  opened: z.boolean(),
  prNumber: z.number().optional(),
  prUrl: z.string().optional(),
  reason: z.string().optional(),
});
export type UpdatePrResult = z.infer<typeof updatePrResultSchema>;

export const updatePrsResponseSchema = z.object({
  packVersion: z.string(),
  results: z.array(updatePrResultSchema),
});
export type UpdatePrsResponse = z.infer<typeof updatePrsResponseSchema>;

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export const assuranceKeys = {
  teamsMine: ["assurance", "teams", "mine"] as const,
  teamsAll: ["assurance", "teams", "all"] as const,
  portfolio: (teamId: string) => ["assurance", "teams", teamId, "portfolio"] as const,
  application: (appId: string) => ["assurance", "applications", appId] as const,
};

/** GET /teams/mine — teams for the TeamSwitcher (NA-01). */
export function useTeamsMine(): UseQueryResult<TeamSummary[]> {
  return useQuery({
    queryKey: assuranceKeys.teamsMine,
    queryFn: async () => {
      const data = await apiClient.get<unknown>("/api/v1/teams/mine");
      return z.array(teamSummarySchema).parse(data);
    },
  });
}

/**
 * GET /teams — every team in the caller's organization. Organization admins
 * only (D-8); `enabled` should be gated on the caller being an org admin
 * (see `useAdmin()`), but a 403 from a non-admin is also treated as "no
 * teams" rather than surfaced as an error, since the switcher only uses
 * this to *add* rows, never to gate the page.
 */
export function useTeamsAll(enabled: boolean): UseQueryResult<OrgTeamSummary[]> {
  return useQuery({
    queryKey: assuranceKeys.teamsAll,
    queryFn: async () => {
      const data = await apiClient.get<unknown>("/api/v1/teams");
      return z.array(orgTeamSummarySchema).parse(data);
    },
    enabled,
    retry: false,
  });
}

/** GET /teams/:teamId/portfolio, parsed. Shared by every portfolio query so the cache entry is identical. */
export async function fetchTeamPortfolio(teamId: string): Promise<TeamPortfolio> {
  const data = await apiClient.get<unknown>(`/api/v1/teams/${teamId}/portfolio`);
  return teamPortfolioSchema.parse(data);
}

/** Portfolios change on realtime events (which invalidate); this only bounds refetch churn. */
export const PORTFOLIO_STALE_TIME_MS = 30_000;

/** GET /teams/:teamId/portfolio — the team portfolio (NA-02). */
export function useTeamPortfolio(teamId: string | undefined): UseQueryResult<TeamPortfolio> {
  return useQuery({
    queryKey: assuranceKeys.portfolio(teamId ?? ""),
    queryFn: () => fetchTeamPortfolio(teamId as string),
    enabled: !!teamId,
    staleTime: PORTFOLIO_STALE_TIME_MS,
  });
}

// ---------------------------------------------------------------------------
// Mesh policy (T136, WP-A6, NA-08). See `app/backend/src/routes/mesh.ts`
// (GET/PUT /mesh/policy?scope=&scopeId=) and `services/mesh/policy.ts` --
// per check (`green`/`yellow`/`red`/`blue`) mode is `off`/`notify`/`issue`/
// `block` (tighten-only ordering), and `cyberRiskSandbox` (D-17) is only
// settable at `application`/`repository` scope, never `organization` or
// `team` (the backend 400s otherwise) -- see `AdminIntegrations.tsx` for how
// the org admin page uses this at `organization` scope for the four checks
// and at `application` scope (an org admin can reach any application in
// their organization, `checkApplicationAccess`) for the sandbox toggle.
// ---------------------------------------------------------------------------

export const meshPolicyScopeSchema = z.enum(["organization", "team", "application", "repository"]);
export type MeshPolicyScope = z.infer<typeof meshPolicyScopeSchema>;

export const meshPolicyModeSchema = z.enum(["off", "notify", "issue", "block"]);
export type MeshPolicyMode = z.infer<typeof meshPolicyModeSchema>;

export const MESH_AGENTS = ["green", "yellow", "red", "blue"] as const;
export type MeshAgent = (typeof MESH_AGENTS)[number];

/** GET /mesh/policy?scope=&scopeId= response. */
export const meshPolicySchema = z.object({
  scope: meshPolicyScopeSchema,
  scopeId: z.string(),
  effective: z.record(meshPolicyModeSchema),
  cyberRiskSandbox: z.boolean(),
  // Present on GET; PUT's response omits it (see routes/mesh.ts) -- optional
  // here so the same schema parses both.
  explicit: z
    .array(
      z.object({
        agent: z.string(),
        mode: meshPolicyModeSchema,
        cyber_risk_sandbox: z.boolean().nullable(),
      }),
    )
    .optional(),
});
export type MeshPolicy = z.infer<typeof meshPolicySchema>;

export const meshPolicyKeys = {
  /** Prefix matching every scope's policy query (for broad invalidation). */
  all: ["assurance", "meshPolicy"] as const,
  policy: (scope: MeshPolicyScope, scopeId: string) => ["assurance", "meshPolicy", scope, scopeId] as const,
};

/** GET /mesh/policy?scope=&scopeId= -- effective mode per check plus the effective sandbox flag. */
export function useMeshPolicy(scope: MeshPolicyScope, scopeId: string | undefined): UseQueryResult<MeshPolicy> {
  return useQuery({
    queryKey: meshPolicyKeys.policy(scope, scopeId ?? ""),
    queryFn: async () => {
      const data = await apiClient.get<unknown>(`/api/v1/mesh/policy?scope=${scope}&scopeId=${scopeId}`);
      return meshPolicySchema.parse(data);
    },
    enabled: !!scopeId,
  });
}

/**
 * PUT /mesh/policy?scope=&scopeId= -- set one check's mode and/or the
 * sandbox flag. Organization admins may set anything for their
 * organization; a narrower scope may only tighten (enforced server-side --
 * a 403 surfaces as a mutation error for the caller to show).
 */
export function useSetMeshPolicy() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      scope: MeshPolicyScope;
      scopeId: string;
      agent?: MeshAgent;
      mode?: MeshPolicyMode;
      cyberRiskSandbox?: boolean;
    }) => {
      const { scope, scopeId, ...body } = input;
      const data = await apiClient.put<unknown>(`/api/v1/mesh/policy?scope=${scope}&scopeId=${scopeId}`, body);
      return meshPolicySchema.parse(data);
    },
    onSuccess: (_data, variables) => {
      // An org- or team-level change alters the effective policy of every
      // narrower scope, so refresh all mesh-policy queries, not just this one.
      void queryClient.invalidateQueries({ queryKey: meshPolicyKeys.all });
    },
  });
}

/**
 * The caller's organization id. The auth context carries no organization,
 * so it comes from the caller's teams (`/teams`, `/teams/mine`); with no
 * teams at all (e.g. a fresh organization admin) it falls back to the
 * caller's organization row, as the dashboard does.
 */
export function useOrganizationId(isAdmin: boolean): string | undefined {
  const { data: mine } = useTeamsMine();
  const { data: allTeams } = useTeamsAll(isAdmin);
  const fromTeams = allTeams?.[0]?.organization_id ?? mine?.[0]?.organization_id;
  const teamsSettled = mine !== undefined && (!isAdmin || allTeams !== undefined);
  const { data: fallback } = useQuery({
    queryKey: ["assurance", "organizationId"],
    enabled: isAdmin && teamsSettled && !fromTeams,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data } = await pronghornApi.from("organizations").select("id").limit(1);
      return (data?.[0]?.id as string | undefined) ?? null;
    },
  });
  return fromTeams ?? fallback ?? undefined;
}

/**
 * GET /applications/:appId (T131, WP-A2, NA-03) — the application page:
 * repositories (each carrying its latest mesh run's verdicts, for the
 * grouped grid), Standards adoption and exceptions, in one call.
 */
export function useApplication(appId: string | undefined): UseQueryResult<ApplicationDetail> {
  return useQuery({
    queryKey: assuranceKeys.application(appId ?? ""),
    queryFn: async () => {
      const data = await apiClient.get<unknown>(`/api/v1/applications/${appId}`);
      return applicationDetailSchema.parse(data);
    },
    enabled: !!appId,
  });
}

export interface UpdatePrsInput {
  /** Specific repositories (a group's "waiting" repos, or a hand-picked set). Omit both to update every repository in the application. */
  repositoryIds?: string[];
  /** Every repository whose `part` matches. Ignored when `repositoryIds` is given. */
  group?: string;
  /** Defaults to the latest published Standards pack. */
  packVersion?: string;
}

/**
 * POST /applications/:appId/update-prs (T131, WP-A2, NA-04) — send update
 * PRs that bump the pinned Standards pack, for the whole application, one
 * group (`part`), or a hand-picked set of repositories. Per contracts/api.md,
 * this returns 207 with a per-repository result even when some repositories
 * fail to get a PR, so the caller inspects `results` rather than relying on
 * throw/catch to tell success from partial failure.
 */
export function useUpdatePrs(appId: string | undefined): UseMutationResult<UpdatePrsResponse, unknown, UpdatePrsInput> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: UpdatePrsInput) => {
      const data = await apiClient.post<unknown>(`/api/v1/applications/${appId}/update-prs`, input);
      return updatePrsResponseSchema.parse(data);
    },
    onSuccess: () => {
      if (appId) queryClient.invalidateQueries({ queryKey: assuranceKeys.application(appId) });
    },
  });
}

export interface CreateExceptionInput {
  repositoryId: string;
  rule: string;
  reason?: string;
  /** ISO date/datetime string. */
  expiresAt: string;
}

/**
 * POST /mesh/exceptions (T131, WP-A2) — request an exception for a
 * repository (e.g. Red recon without a test environment). There is no
 * separate approval workflow (contracts/api.md), so the requester is
 * recorded as the approver by the backend. No revoke/expire-now endpoint
 * exists — an exception simply lapses at `expiresAt` (surfaced by the page
 * as an "Expired" badge, not an action).
 */
export function useCreateException(appId: string | undefined): UseMutationResult<MeshException, unknown, CreateExceptionInput> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateExceptionInput) => {
      const data = await apiClient.post<unknown>("/api/v1/mesh/exceptions", input);
      return meshExceptionSchema.parse(data);
    },
    onSuccess: () => {
      if (appId) queryClient.invalidateQueries({ queryKey: assuranceKeys.application(appId) });
    },
  });
}
