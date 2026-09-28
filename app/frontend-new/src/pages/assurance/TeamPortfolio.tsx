import * as React from "react";
import { useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { PageHeader } from "@/components/shell/PageHeader";
import { FilterChips } from "@/components/shell/FilterChips";
import { NextStepBanner } from "@/components/shell/NextStepBanner";
import { EmptyState, AdoptionBar, RepoRow, type AdoptionSegment } from "@/components/shell/atoms";
import type { StackProfile } from "@/components/shell/atoms/StackBadge";
import { useUrlState } from "@/lib/state/useUrlState";
import { useTeamsMine, useTeamsAll, useTeamPortfolio, type PortfolioApplication, type PortfolioRepository } from "@/features/assurance/api";
import { useRealtimeTeamPortfolio } from "@/features/assurance/useRealtimeTeamPortfolio";
import { useAdmin } from "@/contexts/AdminContext";
import { cn } from "@/lib/utils";

/**
 * TeamPortfolio (T130, WP-A1, NA-02). The team portfolio: applications with
 * Standards adoption, mesh reporting status and "not reporting" after 7
 * days, built from the single `GET /teams/:teamId/portfolio` aggregate
 * (contracts/api.md). See `docs/design/frontend-redesign/option-a-styles/
 * shared/onboard-b.js` `portfolioView()` for the prototype this follows.
 *
 * Per-agent mesh verdicts (MeshDots' Green/Yellow/Red/Blue breakdown) and
 * findings counts live on `/applications/:appId` and `/applications/:appId/
 * runs` (WP-A2/A3, T131/T132) -- not in this aggregate -- so repositories
 * here show PR/reporting state, not per-agent verdicts.
 */
const FALLBACK_PROFILE: StackProfile = "node";

function repoStack(repo: PortfolioRepository): { profile: StackProfile; label: string } {
  if (repo.profile === "dotnet" || repo.profile === "node" || repo.profile === "java" || repo.profile === "python") {
    return { profile: repo.profile, label: repo.stack_label ?? repo.profile };
  }
  return { profile: FALLBACK_PROFILE, label: repo.stack_label ?? "Unclassified" };
}

function adoptionSegments(repos: PortfolioRepository[]): AdoptionSegment[] {
  const byVersion = new Map<string, number>();
  let unpinned = 0;
  for (const repo of repos) {
    if (!repo.pinned_pack) {
      unpinned += 1;
      continue;
    }
    byVersion.set(repo.pinned_pack, (byVersion.get(repo.pinned_pack) ?? 0) + 1);
  }
  const versions = [...byVersion.keys()].sort();
  const latest = versions[versions.length - 1];
  const segments: AdoptionSegment[] = versions.map((version) => ({
    version,
    count: byVersion.get(version) ?? 0,
    latest: version === latest,
  }));
  if (unpinned > 0) segments.push({ version: "Unpinned", count: unpinned });
  return segments;
}

function formatRelative(iso: string | null): string {
  if (!iso) return "";
  const ms = Date.now() - new Date(iso).getTime();
  const days = Math.floor(ms / (24 * 60 * 60 * 1000));
  if (days <= 0) return "today";
  if (days === 1) return "1 day ago";
  return `${days} days ago`;
}

function ApplicationRow({ app, filter }: { app: PortfolioApplication; filter: string }) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = React.useState(app.repositories.length <= 3);
  const repos = filter === "notReporting" ? app.repositories.filter((r) => r.not_reporting) : app.repositories;

  if (filter === "notReporting" && repos.length === 0) return null;

  return (
    <div className="rounded-xs border border-line bg-surface" data-testid="assurance-app-row">
      <div className="flex flex-wrap items-center gap-3 px-pad py-2.5">
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          aria-expanded={expanded}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          <span aria-hidden="true" className={cn("inline-block h-2.5 w-2.5 shrink-0 transition-transform", expanded && "rotate-90")}>
            ▶
          </span>
          <span className="truncate font-semibold text-ink">{app.name}</span>
          <span className="shrink-0 text-xs text-muted-foreground">
            {t("assurance.portfolio.repoCount", { count: app.repository_count })}
          </span>
        </button>
        {app.not_reporting_count > 0 ? (
          <span className="shrink-0 rounded-full bg-warn-soft px-2 py-0.5 text-xs font-semibold text-warn">
            {t("assurance.portfolio.notReportingBadge", { count: app.not_reporting_count })}
          </span>
        ) : null}
      </div>
      {app.repositories.length > 0 ? <AdoptionBar segments={adoptionSegments(app.repositories)} className="mx-pad" /> : null}
      {expanded ? (
        <div className="divide-y divide-line border-t border-line">
          {repos.length === 0 ? (
            <EmptyState size="small" title={t("assurance.portfolio.emptyFiltered.title")} />
          ) : (
            repos.map((repo) => (
              <RepoRow
                key={repo.id}
                data-testid="assurance-repo-row"
                name={repo.full_name}
                note={
                  repo.not_reporting
                    ? t("assurance.portfolio.notReportingRepo")
                    : repo.last_report_at
                      ? t("assurance.portfolio.lastReport", { when: formatRelative(repo.last_report_at) })
                      : t("assurance.portfolio.neverReported")
                }
                stack={repoStack(repo)}
                mesh={{}}
                pr={
                  repo.update_pr_number && repo.update_pr_state !== "closed"
                    ? { number: repo.update_pr_number, state: (repo.update_pr_state as "open" | "merged") ?? "open" }
                    : { state: "none", label: repo.not_reporting ? t("assurance.portfolio.notReportingRepo") : t("assurance.portfolio.reportingRepo") }
                }
              />
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}

export function TeamPortfolio() {
  const { t } = useTranslation();
  const { teamId = "" } = useParams<{ teamId: string }>();
  const { isAdmin } = useAdmin();
  const { data: mine } = useTeamsMine();
  const { data: allTeams } = useTeamsAll(isAdmin);
  const { data, isLoading, isError, error } = useTeamPortfolio(teamId);
  const [filter, setFilter] = useUrlState("f", "all");
  useRealtimeTeamPortfolio(teamId);

  const team = React.useMemo(
    () => mine?.find((tm) => tm.id === teamId) ?? allTeams?.find((tm) => tm.id === teamId),
    [mine, allTeams, teamId],
  );

  const notFound = isError && (error as { statusCode?: number } | undefined)?.statusCode === 404;

  return (
    <div className="flex flex-col gap-4 p-4">
      <PageHeader crumb={t("assurance.portfolio.title")} title={team?.name ?? ""} />

      {isLoading ? (
        <div role="status" className="p-9 text-center text-muted-foreground">
          {t("assurance.portfolio.loading")}
        </div>
      ) : notFound ? (
        <EmptyState title={t("assurance.portfolio.notFound.title")} description={t("assurance.portfolio.notFound.description")} />
      ) : isError || !data ? (
        <EmptyState title={t("assurance.portfolio.error.title")} description={t("assurance.portfolio.error.description")} />
      ) : (
        <>
          {data.totals.notReporting > 0 ? (
            <NextStepBanner
              tone="warn"
              title={t("assurance.portfolio.someNotReporting.title", { count: data.totals.notReporting })}
              body={t("assurance.portfolio.someNotReporting.body")}
              cta={{ label: t("assurance.portfolio.someNotReporting.cta"), onClick: () => setFilter("notReporting") }}
            />
          ) : data.totals.repositories > 0 ? (
            <NextStepBanner tone="ok" title={t("assurance.portfolio.allReporting.title")} body={t("assurance.portfolio.allReporting.body")} />
          ) : null}

          {data.applications.length === 0 ? (
            <EmptyState title={t("assurance.portfolio.empty.title")} description={t("assurance.portfolio.empty.description")} />
          ) : (
            <>
              <FilterChips
                options={[
                  { id: "all", label: t("assurance.portfolio.filters.all"), count: data.totals.repositories },
                  { id: "notReporting", label: t("assurance.portfolio.filters.notReporting"), count: data.totals.notReporting },
                ]}
              />
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-ink">{t("assurance.portfolio.applicationsHeading")}</h2>
                  <span className="text-xs text-muted-foreground">
                    {t("assurance.portfolio.applicationsMeta", { count: data.applications.length })}
                  </span>
                </div>
                <div className="flex flex-col gap-2">
                  {data.applications.map((app) => (
                    <ApplicationRow key={app.id} app={app} filter={filter} />
                  ))}
                </div>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

export default TeamPortfolio;
