import { useMemo } from "react";
import { useQueries, type UseQueryResult } from "@tanstack/react-query";
import {
  assuranceKeys,
  fetchTeamPortfolio,
  PORTFOLIO_STALE_TIME_MS,
  useTeamsAll,
  type OrgTeamSummary,
  type TeamPortfolio,
} from "./api";
import { usePacks, type StandardsPack } from "./governance.api";

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

/** Compares dotted numeric versions segment by segment ("2026.10" > "2026.9"). */
export function compareVersions(a: string, b: string): number {
  const pa = a.split(".");
  const pb = b.split(".");
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = Number.parseInt(pa[i] ?? "0", 10);
    const y = Number.parseInt(pb[i] ?? "0", 10);
    if (Number.isNaN(x) || Number.isNaN(y)) {
      const c = (pa[i] ?? "").localeCompare(pb[i] ?? "");
      if (c !== 0) return c;
    } else if (x !== y) {
      return x - y;
    }
  }
  return 0;
}

/**
 * The organization's latest pack: the newest `published_at` in the packs
 * list when available, otherwise the highest pinned version compared
 * numerically by segment.
 */
export function latestPackOf(portfolios: (TeamPortfolio | undefined)[], packs?: StandardsPack[]): string | null {
  if (packs && packs.length > 0) {
    return packs.reduce((best, p) => (Date.parse(p.published_at) > Date.parse(best.published_at) ? p : best)).version;
  }
  let latest: string | null = null;
  for (const p of portfolios) {
    for (const app of p?.applications ?? []) {
      for (const repo of app.repositories) {
        if (repo.pinned_pack && (latest === null || compareVersions(repo.pinned_pack, latest) > 0)) latest = repo.pinned_pack;
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
      queryFn: () => fetchTeamPortfolio(team.id),
      staleTime: PORTFOLIO_STALE_TIME_MS,
    })),
  });

  const portfolios = portfolioQueries.map((q) => q.data);
  const { data: packs } = usePacks(enabled);
  const latestPack = latestPackOf(portfolios, packs);

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
