import * as React from "react";
import { useTranslation } from "react-i18next";
import { PageHeader } from "@/components/shell/PageHeader";
import { FilterChips } from "@/components/shell/FilterChips";
import { NextStepBanner } from "@/components/shell/NextStepBanner";
import { EmptyState } from "@/components/shell/atoms";
import { useUrlState } from "@/lib/state/useUrlState";
import { useAdmin } from "@/contexts/AdminContext";
import { useAllTeamsOverview } from "@/features/assurance/teams.api";
import { AllTeamsTable, type TeamSortKey } from "@/features/assurance/teams/AllTeamsTable";

/**
 * AllTeams (T134, WP-A5, NA-07). `/assurance/all`: the assurance view across
 * every team of the organization, for organization admins only (spec.md
 * US5; research D-8). Everyone else gets a no-access state, and the backend
 * refuses `GET /teams` with 403 anyway. Filter (`?f=attention`) and sort
 * (`?s=`) live in the URL.
 */
const SORT_KEYS: TeamSortKey[] = ["name", "repos", "notReporting"];

export function AllTeams() {
  const { t } = useTranslation();
  const { isAdmin, loading: adminLoading } = useAdmin();
  const overview = useAllTeamsOverview(isAdmin);
  const [filter] = useUrlState("f", "all");
  const [sortParam, setSortParam] = useUrlState("s", "name");
  const sort = (SORT_KEYS as string[]).includes(sortParam) ? (sortParam as TeamSortKey) : "name";

  const rows = React.useMemo(() => {
    const visible = filter === "attention" ? overview.rows.filter((r) => (r.notReporting ?? 0) > 0) : overview.rows;
    const sorted = [...visible];
    if (sort === "repos") sorted.sort((a, b) => (b.repositories ?? -1) - (a.repositories ?? -1) || a.team.name.localeCompare(b.team.name));
    else if (sort === "notReporting") sorted.sort((a, b) => (b.notReporting ?? -1) - (a.notReporting ?? -1) || a.team.name.localeCompare(b.team.name));
    else sorted.sort((a, b) => a.team.name.localeCompare(b.team.name));
    return sorted;
  }, [overview.rows, filter, sort]);

  const attentionCount = overview.rows.filter((r) => (r.notReporting ?? 0) > 0).length;

  let content: React.ReactNode;
  if (adminLoading || (isAdmin && overview.isLoading)) {
    content = (
      <div role="status" className="p-9 text-center text-muted-foreground">
        {t("assurance.teams.loading")}
      </div>
    );
  } else if (!isAdmin || overview.isForbidden) {
    content = <EmptyState title={t("assurance.teams.noAccess.title")} description={t("assurance.teams.noAccess.description")} />;
  } else if (overview.isError) {
    content = <EmptyState title={t("assurance.teams.error.title")} description={t("assurance.teams.error.description")} />;
  } else if (overview.rows.length === 0) {
    content = <EmptyState title={t("assurance.teams.empty.title")} description={t("assurance.teams.empty.description")} />;
  } else {
    content = (
      <>
        <NextStepBanner
          tone={overview.totals.notReporting > 0 ? "warn" : "info"}
          title={t("assurance.teams.banner.title")}
          body={t("assurance.teams.banner.body")}
        />
        {overview.hasPartialError ? (
          <p role="alert" className="text-sm text-warn">
            {t("assurance.teams.partialError")}
          </p>
        ) : null}
        <FilterChips
          options={[
            { id: "all", label: t("assurance.teams.filters.all"), count: overview.rows.length },
            { id: "attention", label: t("assurance.teams.filters.attention"), count: attentionCount },
          ]}
        />
        <div>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-ink">{t("assurance.teams.heading")}</h2>
            <span className="text-xs text-muted-foreground">
              {t("assurance.teams.meta", {
                teams: overview.totals.teams,
                apps: overview.totals.applications,
                repos: overview.totals.repositories,
              })}
            </span>
          </div>
          {rows.length === 0 ? (
            <EmptyState size="small" title={t("assurance.teams.emptyFiltered.title")} />
          ) : (
            <AllTeamsTable rows={rows} latestPack={overview.latestPack} sort={sort} onSort={setSortParam} />
          )}
        </div>
      </>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <PageHeader crumb={t("assurance.teams.crumb")} title={t("assurance.teams.title")} />
      {content}
    </div>
  );
}

export default AllTeams;
