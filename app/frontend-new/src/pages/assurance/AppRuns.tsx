import * as React from "react";
import { Link, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { PageHeader } from "@/components/shell/PageHeader";
import { FilterChips } from "@/components/shell/FilterChips";
import { EmptyState, MeshDots } from "@/components/shell/atoms";
import { useUrlState } from "@/lib/state/useUrlState";
import { useTeamsMine, useTeamsAll, useApplication } from "@/features/assurance/api";
import { RUN_DAY_OPTIONS, useAppRuns, type AppRun } from "@/features/assurance/runs.api";
import { RunEvidence, RunPrChip } from "@/features/assurance/runs/RunEvidence";
import { useRealtimeRuns } from "@/features/assurance/runs/useRealtimeRuns";
import { useAdmin } from "@/contexts/AdminContext";
import { cn } from "@/lib/utils";

/**
 * AppRuns (T132, WP-A3, NA-05). Assurance Mesh runs on pull requests to the
 * default branch (open and merged), grouped by day, for one application.
 * `?days=` (7/14/30, URL-held) sets the window; `?run=<id>` expands one
 * run's evidence (verdict per check, counts, report link, "open an issue"
 * for new findings) in place, so the selection survives reload and works
 * on a phone without a second page. Data: `GET /applications/:appId/runs`
 * and `GET /mesh/runs/:runId`; live through the `team-{id}` channel.
 */
function formatDay(day: string): string {
  return new Date(`${day}T00:00:00Z`).toLocaleDateString(undefined, {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function RunRow({ run, selected, onToggle }: { run: AppRun; selected: boolean; onToggle: () => void }) {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={selected}
      data-testid="assurance-run-row"
      className={cn(
        "flex min-h-11 w-full flex-wrap items-center gap-x-3 gap-y-1 px-pad py-2 text-left",
        selected ? "bg-primary-soft" : "bg-surface",
      )}
    >
      <code className="min-w-0 flex-1 truncate font-mono text-[13px] font-semibold text-ink">{run.repository_full_name}</code>
      <RunPrChip number={run.pr_number} state={run.pr_state} />
      <MeshDots statuses={run.verdicts} />
      <span className="w-full text-xs text-muted-foreground sm:w-auto">
        {t("assurance.runs.row.findings", { count: run.new_findings })}
        {" · "}
        {new Date(run.received_at).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
      </span>
    </button>
  );
}

export function AppRuns() {
  const { t } = useTranslation();
  const { teamId = "", appId = "" } = useParams<{ teamId: string; appId: string }>();
  const { isAdmin } = useAdmin();
  const { data: mine } = useTeamsMine();
  const { data: allTeams } = useTeamsAll(isAdmin);
  const { data: app } = useApplication(appId);
  const [daysRaw] = useUrlState("days", "7");
  const days = (RUN_DAY_OPTIONS as readonly number[]).includes(Number(daysRaw)) ? Number(daysRaw) : 7;
  const [selectedRun, setSelectedRun] = useUrlState("run", "");
  const { data, isLoading, isError, error } = useAppRuns(appId, days);
  useRealtimeRuns(teamId, appId);

  const team = React.useMemo(
    () => mine?.find((tm) => tm.id === teamId) ?? allTeams?.find((tm) => tm.id === teamId),
    [mine, allTeams, teamId],
  );
  const notFound = isError && (error as { statusCode?: number } | undefined)?.statusCode === 404;
  const total = data ? data.runsByDay.reduce((sum, d) => sum + d.runs.length, 0) : 0;

  return (
    <div className="flex flex-col gap-4 p-4">
      <PageHeader
        crumb={team ? t("assurance.runs.crumb", { team: team.name, app: app?.name ?? "" }) : undefined}
        title={t("assurance.runs.title")}
      />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <FilterChips
          paramKey="days"
          defaultValue="7"
          options={RUN_DAY_OPTIONS.map((d) => ({ id: String(d), label: t("assurance.runs.days", { count: d }) }))}
        />
        <Link
          to={`/assurance/t/${teamId}/apps/${appId}`}
          className="inline-flex min-h-11 items-center text-sm font-semibold text-primary underline"
        >
          {t("assurance.runs.backToApp")}
        </Link>
      </div>

      {isLoading ? (
        <div role="status" className="p-9 text-center text-muted-foreground">
          {t("assurance.runs.loading")}
        </div>
      ) : notFound ? (
        <EmptyState title={t("assurance.app.notFound.title")} description={t("assurance.app.notFound.description")} />
      ) : isError || !data ? (
        <EmptyState title={t("assurance.runs.error.title")} description={t("assurance.runs.error.description")} />
      ) : total === 0 ? (
        <EmptyState title={t("assurance.runs.empty.title", { count: days })} description={t("assurance.runs.empty.description")} />
      ) : (
        <div className="flex flex-col gap-4">
          {data.runsByDay.map((group) => (
            <section key={group.day} aria-labelledby={`runs-day-${group.day}`} className="rounded-xs border border-line bg-surface" data-testid="assurance-runs-day">
              <h2
                id={`runs-day-${group.day}`}
                className="border-b border-line bg-surface-2 px-pad py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
              >
                {formatDay(group.day)} · {t("assurance.runs.dayCount", { count: group.runs.length })}
              </h2>
              <div className="divide-y divide-line">
                {group.runs.map((run) => (
                  <div key={run.id}>
                    <RunRow run={run} selected={selectedRun === run.id} onToggle={() => setSelectedRun(selectedRun === run.id ? "" : run.id)} />
                    {selectedRun === run.id ? <RunEvidence runId={run.id} appId={appId} /> : null}
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

export default AppRuns;
