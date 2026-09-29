import { useMemo } from "react";
import { useQueries, type UseQueryResult } from "@tanstack/react-query";
import apiClient from "@/lib/apiClient";
import {
  assuranceKeys,
  teamPortfolioSchema,
  useTeamsAll,
  type OrgTeamSummary,
  type TeamPortfolio,
} from "./api";

/**
 * All teams (T134, WP-A5, NA-07). The organization-wide assurance overview
 * for organization admins (spec.md US5, research D-8). contracts/api.md B2
 * defines `GET /teams` (id, name, member_count, application_count) and the
 * per-team `GET /teams/:teamId/portfolio`; there is no org-level aggregate
 * endpoint, so the repository totals per team are composed here from the
 * portfolios (same query keys as `useTeamPortfolio`, so they share the
 * cache with the team pages). Per-team "new findings" and "exceptions"
 * columns from the prototype have no endpoint that returns them across
 * teams and are intentionally not shown.
 */

export interface TeamOverviewRow {
  team: OrgTeamSummary;
  /** null while that team's portfolio is loading or failed. */
  repositories: number | null;
  onLatest: number | null;
  notReporting: number | null;
}

export interface AllTeamsOverview {
  rows: TeamOverviewRow[];
  latestPack: string | null;
  isLoading: boolean;
  /** GET /teams itself failed (403 for a non-admin, or a server error). */
  isError: boolean;
  isForbidden: boolean;
  /** Any per-team portfolio failed. */
  hasPartialError: boolean;
  totals: { teams: number; applications: number; repositories: number; notReporting: number };
}

/** The highest pack version pinned anywhere in the organization ("2026.2" > "2026.1"). */
export function latestPackOf(portfolios: (TeamPortfolio | undefined)[]): string | null {
  let latest: string | null = null;
  for (const p of portfolios) {
    for (const app of p?.applications ?? []) {
      for (const repo of app.repositories) {
        if (repo.pinned_pack && (latest === null || repo.pinned_pack > latest)) latest = repo.pinned_pack;
      }
    }
  }
  return latest;
}

export function useAllTeamsOverview(enabled: boolean): AllTeamsOverview {
  const teamsQuery = useTeamsAll(enabled);
  const teams = useMemo(() => teamsQuery.data ?? [], [teamsQuery.data]);

  const portfolioQueries: UseQueryResult<TeamPortfolio>[] = useQueries({
    queries: teams.map((team) => ({
      queryKey: assuranceKeys.portfolio(team.id),
      queryFn: async () => teamPortfolioSchema.parse(await apiClient.get<unknown>(`/api/v1/teams/${team.id}/portfolio`)),
    })),
  });

  const portfolios = portfolioQueries.map((q) => q.data);
  const latestPack = latestPackOf(portfolios);

  const rows: TeamOverviewRow[] = teams.map((team, i) => {
    const portfolio = portfolios[i];
    if (!portfolio) return { team, repositories: null, onLatest: null, notReporting: null };
    const repos = portfolio.applications.flatMap((a) => a.repositories);
    return {
      team,
      repositories: portfolio.totals.repositories,
      onLatest: latestPack ? repos.filter((r) => r.pinned_pack === latestPack).length : 0,
      notReporting: portfolio.totals.notReporting,
    };
  });

  const status = (teamsQuery.error as { statusCode?: number } | null)?.statusCode;
  return {
    rows,
    latestPack,
    isLoading: enabled && (teamsQuery.isLoading || portfolioQueries.some((q) => q.isLoading)),
    isError: teamsQuery.isError,
    isForbidden: status === 403,
    hasPartialError: portfolioQueries.some((q) => q.isError),
    totals: {
      teams: teams.length,
      applications: teams.reduce((s, t) => s + t.application_count, 0),
      repositories: rows.reduce((s, r) => s + (r.repositories ?? 0), 0),
      notReporting: rows.reduce((s, r) => s + (r.notReporting ?? 0), 0),
    },
  };
}
