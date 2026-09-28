import { z } from "zod";
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import apiClient from "@/lib/apiClient";

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

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export const assuranceKeys = {
  teamsMine: ["assurance", "teams", "mine"] as const,
  teamsAll: ["assurance", "teams", "all"] as const,
  portfolio: (teamId: string) => ["assurance", "teams", teamId, "portfolio"] as const,
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

/** GET /teams/:teamId/portfolio — the team portfolio (NA-02). */
export function useTeamPortfolio(teamId: string | undefined): UseQueryResult<TeamPortfolio> {
  return useQuery({
    queryKey: assuranceKeys.portfolio(teamId ?? ""),
    queryFn: async () => {
      const data = await apiClient.get<unknown>(`/api/v1/teams/${teamId}/portfolio`);
      return teamPortfolioSchema.parse(data);
    },
    enabled: !!teamId,
  });
}
