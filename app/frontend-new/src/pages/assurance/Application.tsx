import * as React from "react";
import { Link, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { PageHeader } from "@/components/shell/PageHeader";
import { FilterChips } from "@/components/shell/FilterChips";
import { NextStepBanner } from "@/components/shell/NextStepBanner";
import { Disclosure } from "@/components/shell/Disclosure";
import { ActionButton } from "@/components/shell/ActionButton";
import { EmptyState, AdoptionBar, RepoRow, type AdoptionSegment } from "@/components/shell/atoms";
import type { StackProfile } from "@/components/shell/atoms/StackBadge";
import type { MeshAgentId, MeshAgentStatus } from "@/components/shell/atoms/MeshDots";
import { useUrlState } from "@/lib/state/useUrlState";
import { useStringPref } from "@/lib/state/useUiPrefs";
import {
  useTeamsMine,
  useTeamsAll,
  useApplication,
  useUpdatePrs,
  useCreateException,
  type ApplicationRepository,
  type MeshException,
} from "@/features/assurance/api";
import { useRealtimeApplication } from "@/features/assurance/useRealtimeApplication";
import { useAdmin } from "@/contexts/AdminContext";
import { cn } from "@/lib/utils";
import i18n from "@/i18n";

/**
 * Application (T131, WP-A2, NA-03/NA-04). The application page: repositories
 * grouped by part or stack (RepoRow + MeshDots per check), the Standards
 * adoption bar, group actions to send update PRs (with confirmation, per
 * contracts/design-system.md's ActionButton) and the application's mesh
 * exceptions. Built from `GET /applications/:appId` (contracts/api.md),
 * extended in this WP (T131) to carry each repository's latest mesh run
 * verdicts alongside adoption/exceptions, so the whole page is one request.
 *
 * See `docs/design/frontend-redesign/option-a-styles/shared/onboard-b.js`
 * `appView()` for the prototype this follows: header primary "Send update
 * PRs (N)", a fresh-findings banner, the adoption bar + a small stats grid,
 * a grouped repository grid with a per-group "Send update PRs" action, and
 * an Exceptions disclosure.
 *
 * Deviation from the prototype: there is no page-level (`PageHeader`)
 * primary action here. `PageHeader`/`PrimaryActionSlot` render
 * `ActionSpec.onClick` directly and don't implement `ActionSpec.confirm`/
 * `.undo` (see their source) — only `ActionButton` does. Since every action
 * on this page needs confirmation (D-15/D-17: sending update PRs isn't
 * reversible through this API), the "send to every repository" action is
 * an `ActionButton` in the Repositories card instead of the header, and
 * this route registers `useNoPrimaryAction` like `TeamPortfolio`. Reported
 * as a shell-change request rather than worked around here.
 */
const FALLBACK_PROFILE: StackProfile = "node";

type GroupBy = "part" | "stack";
type FilterId = "all" | "attention" | "behind" | "new";

function repoStack(repo: ApplicationRepository): { profile: StackProfile; label: string } {
  if (repo.profile === "dotnet" || repo.profile === "node" || repo.profile === "java" || repo.profile === "python") {
    return { profile: repo.profile, label: repo.stack_label ?? repo.profile };
  }
  return { profile: FALLBACK_PROFILE, label: repo.stack_label ?? i18n.t("assurance.app.unclassified") };
}

function isBehind(repo: ApplicationRepository, latestPackVersion: string | null): boolean {
  return !!latestPackVersion && repo.pinned_pack !== latestPackVersion;
}

function hasWarnOrFail(repo: ApplicationRepository): boolean {
  const verdicts = repo.latest_run?.verdicts;
  if (!verdicts) return false;
  return Object.values(verdicts).some((v) => v === "warn" || v === "fail");
}

function needsAttention(repo: ApplicationRepository, latestPackVersion: string | null): boolean {
  return isBehind(repo, latestPackVersion) || (repo.latest_run?.new_findings ?? 0) > 0 || hasWarnOrFail(repo);
}

const FILTERS: Record<FilterId, (repo: ApplicationRepository, latestPackVersion: string | null) => boolean> = {
  all: () => true,
  attention: needsAttention,
  behind: isBehind,
  new: (repo) => (repo.latest_run?.new_findings ?? 0) > 0,
};

/** A repository is "waiting" for an update PR: behind the latest pack and no PR already open for it. */
function isWaiting(repo: ApplicationRepository, latestPackVersion: string | null): boolean {
  return isBehind(repo, latestPackVersion) && !(repo.update_pr_number && repo.update_pr_state === "open");
}

function meshStatuses(repo: ApplicationRepository): Partial<Record<MeshAgentId, MeshAgentStatus>> {
  return repo.latest_run?.verdicts ?? {};
}

function groupLabel(repo: ApplicationRepository, groupBy: GroupBy): string {
  if (groupBy === "stack") return repoStack(repo).label;
  return repo.part ?? i18n.t("assurance.app.otherPart");
}

function adoptionSegments(repos: ApplicationRepository[]): AdoptionSegment[] {
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
  if (unpinned > 0) segments.push({ version: i18n.t("assurance.app.unpinned"), count: unpinned });
  return segments;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function ExceptionRow({ exception, repoName }: { exception: MeshException; repoName: string }) {
  const { t } = useTranslation();
  const expired = new Date(exception.expires_at).getTime() < Date.now();
  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-line px-3 py-2 last:border-b-0" data-testid="assurance-exception-row">
      <code className="font-mono text-[13px] font-semibold text-ink">{repoName}</code>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-ink">{exception.rule}</span>
        {exception.reason ? <span className="block text-xs text-muted-foreground">{exception.reason}</span> : null}
      </span>
      <span className={cn("shrink-0 text-xs", expired ? "font-semibold text-bad" : "text-muted-foreground")}>
        {expired
          ? t("assurance.app.exceptions.expired", { date: formatDate(exception.expires_at) })
          : t("assurance.app.exceptions.expires", { date: formatDate(exception.expires_at) })}
      </span>
    </div>
  );
}

function CreateExceptionForm({ appId, repositories }: { appId: string; repositories: ApplicationRepository[] }) {
  const { t } = useTranslation();
  const [repositoryId, setRepositoryId] = React.useState(repositories[0]?.id ?? "");
  const [rule, setRule] = React.useState("");
  const [reason, setReason] = React.useState("");
  const [expiresAt, setExpiresAt] = React.useState("");
  const createException = useCreateException(appId);

  const valid = !!repositoryId && rule.trim().length > 0 && expiresAt.length > 0;

  const submit = async () => {
    if (!valid) return;
    await createException.mutateAsync({ repositoryId, rule: rule.trim(), reason: reason.trim() || undefined, expiresAt });
    setRule("");
    setReason("");
    setExpiresAt("");
  };

  return (
    <div className="grid gap-2 border-t border-line p-3">
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="grid gap-1 text-xs font-medium text-muted-foreground">
          {t("assurance.app.exceptions.create.repository")}
          <select
            value={repositoryId}
            onChange={(e) => setRepositoryId(e.target.value)}
            className="h-9 rounded-xs border border-line bg-surface px-2 text-sm text-ink"
          >
            {repositories.map((repo) => (
              <option key={repo.id} value={repo.id}>
                {repo.full_name}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-xs font-medium text-muted-foreground">
          {t("assurance.app.exceptions.create.rule")}
          <input
            value={rule}
            onChange={(e) => setRule(e.target.value)}
            placeholder={t("assurance.app.exceptions.create.rulePlaceholder") ?? undefined}
            className="h-9 rounded-xs border border-line bg-surface px-2 text-sm text-ink"
          />
        </label>
      </div>
      <label className="grid gap-1 text-xs font-medium text-muted-foreground">
        {t("assurance.app.exceptions.create.reason")}
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="h-9 rounded-xs border border-line bg-surface px-2 text-sm text-ink"
        />
      </label>
      <label className="grid gap-1 text-xs font-medium text-muted-foreground sm:w-52">
        {t("assurance.app.exceptions.create.expiresAt")}
        <input
          type="date"
          value={expiresAt}
          onChange={(e) => setExpiresAt(e.target.value)}
          className="h-9 rounded-xs border border-line bg-surface px-2 text-sm text-ink"
        />
      </label>
      <div>
        <ActionButton
          label={t("assurance.app.exceptions.create.submit")}
          onAction={submit}
          disabled={!valid}
          tone="ghost"
        />
      </div>
    </div>
  );
}

function RepoGroup({
  label,
  repos,
  latestPackVersion,
  appId,
}: {
  label: string;
  repos: ApplicationRepository[];
  latestPackVersion: string | null;
  appId: string;
}) {
  const { t } = useTranslation();
  const updatePrs = useUpdatePrs(appId);
  const waiting = repos.filter((repo) => isWaiting(repo, latestPackVersion));

  return (
    <div>
      <div className="flex items-center justify-between gap-2 border-b border-line bg-surface-2 px-pad py-1.5">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {label} · {repos.length}
        </span>
        {waiting.length > 0 ? (
          <ActionButton
            label={t("assurance.app.group.send", { count: waiting.length })}
            confirm={t("assurance.app.group.sendConfirm", { count: waiting.length }) ?? undefined}
            tone="ghost"
            onAction={async () => {
              await updatePrs.mutateAsync({ repositoryIds: waiting.map((repo) => repo.id) });
            }}
          />
        ) : null}
      </div>
      <div className="divide-y divide-line">
        {repos.map((repo) => (
          <RepoRow
            key={repo.id}
            data-testid="assurance-app-repo-row"
            name={repo.full_name}
            note={t(isBehind(repo, latestPackVersion) ? "assurance.app.repoNoteBehind" : "assurance.app.repoNote", { pack: repo.pinned_pack ?? "—" })}
            stack={repoStack(repo)}
            findings={
              repo.latest_run
                ? t("assurance.app.repoRow.findings", { count: repo.latest_run.new_findings })
                : undefined
            }
            mesh={meshStatuses(repo)}
            pr={
              repo.update_pr_number && repo.update_pr_state !== "closed"
                ? { number: repo.update_pr_number, state: (repo.update_pr_state as "open" | "merged") ?? "open" }
                : {
                    state: "none",
                    label: isBehind(repo, latestPackVersion)
                      ? t("assurance.app.repoRow.pr.behind")
                      : t("assurance.app.repoRow.pr.inSync"),
                  }
            }
          />
        ))}
      </div>
    </div>
  );
}

export function Application() {
  const { t } = useTranslation();
  const { teamId = "", appId = "" } = useParams<{ teamId: string; appId: string }>();
  const { isAdmin } = useAdmin();
  const { data: mine } = useTeamsMine();
  const { data: allTeams } = useTeamsAll(isAdmin);
  const { data, isLoading, isError, error } = useApplication(appId);
  const updatePrs = useUpdatePrs(appId);
  const [filterRaw, setFilter] = useUrlState("f", "all");
  const filter: FilterId = filterRaw in FILTERS ? (filterRaw as FilterId) : "all";
  const [groupByRaw, setGroupByRaw] = useStringPref(`group.${appId}`, "part");
  const groupBy: GroupBy = groupByRaw === "stack" ? "stack" : "part";
  const setGroupBy = (next: GroupBy) => setGroupByRaw(next);
  useRealtimeApplication(teamId, appId);

  const team = React.useMemo(
    () => mine?.find((tm) => tm.id === teamId) ?? allTeams?.find((tm) => tm.id === teamId),
    [mine, allTeams, teamId],
  );

  const notFound = isError && (error as { statusCode?: number } | undefined)?.statusCode === 404;

  const latestPackVersion = data?.adoption.latestPackVersion ?? null;
  const shown = React.useMemo(() => (data ? data.repositories.filter((repo) => FILTERS[filter](repo, latestPackVersion)) : []), [data, filter, latestPackVersion]);
  const groups = React.useMemo(() => [...new Set(shown.map((repo) => groupLabel(repo, groupBy)))], [shown, groupBy]);
  const allWaiting = React.useMemo(() => (data ? data.repositories.filter((repo) => isWaiting(repo, latestPackVersion)) : []), [data, latestPackVersion]);
  const freshCount = React.useMemo(() => (data ? data.repositories.filter((repo) => (repo.latest_run?.new_findings ?? 0) > 0).length : 0), [data]);
  const warnCount = React.useMemo(() => (data ? data.repositories.filter(hasWarnOrFail).length : 0), [data]);
  const prOpenCount = React.useMemo(() => (data ? data.repositories.filter((repo) => repo.update_pr_state === "open").length : 0), [data]);
  const newFindingsTotal = React.useMemo(() => (data ? data.repositories.reduce((sum, repo) => sum + (repo.latest_run?.new_findings ?? 0), 0) : 0), [data]);
  const repoNameById = React.useMemo(() => new Map((data?.repositories ?? []).map((repo) => [repo.id, repo.full_name])), [data]);

  return (
    <div className="flex flex-col gap-4 p-4">
      <PageHeader crumb={team ? t("assurance.app.crumb", { team: team.name }) : undefined} title={data?.name ?? ""} />

      {isLoading ? (
        <div role="status" className="p-9 text-center text-muted-foreground">
          {t("assurance.app.loading")}
        </div>
      ) : notFound ? (
        <EmptyState title={t("assurance.app.notFound.title")} description={t("assurance.app.notFound.description")} />
      ) : isError || !data ? (
        <EmptyState title={t("assurance.app.error.title")} description={t("assurance.app.error.description")} />
      ) : (
        <>
          {freshCount > 0 ? (
            <NextStepBanner
              tone="warn"
              title={t("assurance.app.nextStep.freshFindings.title", { count: freshCount })}
              body={t("assurance.app.nextStep.freshFindings.body")}
              cta={{ label: t("assurance.app.nextStep.freshFindings.cta"), onClick: () => setFilter("new") }}
            />
          ) : null}

          <section className="rounded-xs border border-line bg-surface p-pad">
            <div className="mb-1 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-ink">{t("assurance.app.adoption.title")}</h2>
              <span className="text-xs text-muted-foreground">
                {t("assurance.app.adoption.meta", {
                  onLatest: data.adoption.reposOnLatest,
                  total: data.adoption.totalRepos,
                  version: data.adoption.latestPackVersion ?? "—",
                })}
              </span>
            </div>
            <Link to={`/assurance/t/${teamId}/apps/${appId}/runs`} className="mt-2 inline-flex min-h-11 items-center text-sm font-semibold text-primary underline">
              {t("assurance.runs.link")}
            </Link>
            {data.repositories.length > 0 ? <AdoptionBar segments={adoptionSegments(data.repositories)} /> : null}
            <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div>
                <div className="text-xs text-muted-foreground">{t("assurance.app.kv.newFindings")}</div>
                <div className="text-lg font-bold text-ink">{newFindingsTotal}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">{t("assurance.app.kv.warnings")}</div>
                <div className="text-lg font-bold text-ink">{warnCount}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">{t("assurance.app.kv.prsOpen")}</div>
                <div className="text-lg font-bold text-ink">{prOpenCount}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">{t("assurance.app.kv.exceptions")}</div>
                <div className="text-lg font-bold text-ink">{data.exceptions.length}</div>
              </div>
            </div>
          </section>

          {data.repositories.length === 0 ? (
            <EmptyState title={t("assurance.app.empty.title")} description={t("assurance.app.empty.description")} />
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <FilterChips
                  options={[
                    { id: "all", label: t("assurance.app.filters.all"), count: data.repositories.length },
                    { id: "attention", label: t("assurance.app.filters.attention"), count: data.repositories.filter((r) => needsAttention(r, latestPackVersion)).length },
                    { id: "behind", label: t("assurance.app.filters.behind"), count: data.repositories.filter((r) => isBehind(r, latestPackVersion)).length },
                    { id: "new", label: t("assurance.app.filters.new"), count: data.repositories.filter((r) => (r.latest_run?.new_findings ?? 0) > 0).length },
                  ]}
                />
                <div role="group" aria-label={t("assurance.app.groupBy.ariaLabel") ?? undefined} className="flex gap-1.5">
                  {(["part", "stack"] as const).map((option) => (
                    <button
                      key={option}
                      type="button"
                      aria-pressed={groupBy === option}
                      onClick={() => setGroupBy(option)}
                      className={cn(
                        "flex h-7 items-center rounded-full border px-2.5 text-xs font-medium",
                        groupBy === option ? "border-primary bg-primary-soft text-primary" : "border-line bg-surface text-muted-foreground",
                      )}
                    >
                      {t(`assurance.app.groupBy.${option}`)}
                    </button>
                  ))}
                </div>
              </div>

              <section className="rounded-xs border border-line bg-surface">
                <div className="flex items-center justify-between gap-2 px-pad py-2.5">
                  <div>
                    <h2 className="text-sm font-semibold text-ink">{t("assurance.app.repositoriesHeading")}</h2>
                    <span className="text-xs text-muted-foreground">
                      {t("assurance.app.repositoriesMeta", { shown: shown.length, total: data.repositories.length })}
                    </span>
                  </div>
                  {allWaiting.length > 0 ? (
                    <ActionButton
                      label={t("assurance.app.group.sendAll", { count: allWaiting.length })}
                      confirm={t("assurance.app.group.sendAllConfirm", { count: allWaiting.length }) ?? undefined}
                      onAction={async () => {
                        await updatePrs.mutateAsync({ repositoryIds: allWaiting.map((repo) => repo.id) });
                      }}
                    />
                  ) : null}
                </div>
                {shown.length === 0 ? (
                  <EmptyState size="small" title={t("assurance.app.emptyFiltered.title")} />
                ) : (
                  <div className="divide-y divide-line border-t border-line">
                    {groups.map((group) => (
                      <RepoGroup
                        key={group}
                        label={group}
                        repos={shown.filter((repo) => groupLabel(repo, groupBy) === group)}
                        latestPackVersion={latestPackVersion}
                        appId={appId}
                      />
                    ))}
                  </div>
                )}
              </section>
            </>
          )}

          <section className="rounded-xs border border-line bg-surface">
            <Disclosure prefKey={`exc-${appId}`} summary={t("assurance.app.exceptions.heading", { count: data.exceptions.length })}>
              {data.exceptions.length === 0 ? (
                <EmptyState size="small" title={t("assurance.app.exceptions.empty")} />
              ) : (
                <div className="divide-y divide-line">
                  {data.exceptions.map((exception) => (
                    <ExceptionRow key={exception.id} exception={exception} repoName={repoNameById.get(exception.repository_id) ?? exception.repository_id} />
                  ))}
                </div>
              )}
              {data.repositories.length > 0 ? <CreateExceptionForm appId={appId} repositories={data.repositories} /> : null}
            </Disclosure>
          </section>
        </>
      )}
    </div>
  );
}

export default Application;
