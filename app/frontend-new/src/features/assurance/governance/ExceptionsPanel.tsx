import * as React from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { EmptyState } from "@/components/shell/atoms";
import { cn } from "@/lib/utils";
import { useTeamPortfolio } from "@/features/assurance/api";
import { isExceptionExpired, useMeshExceptions } from "@/features/assurance/governance.api";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export interface ExceptionsPanelProps {
  teamId: string;
  applicationId: string;
  onApplicationChange: (id: string) => void;
}

/**
 * Exceptions for one application of a team (NA-06). Requesting a new one
 * stays on the application page (WP-A2, `useCreateException`), linked from
 * here rather than duplicated.
 */
export function ExceptionsPanel({ teamId, applicationId, onApplicationChange }: ExceptionsPanelProps) {
  const { t } = useTranslation();
  const { data: portfolio, isLoading: portfolioLoading } = useTeamPortfolio(teamId || undefined);
  const applications = portfolio?.applications ?? [];
  const selected = applications.find((a) => a.id === applicationId) ?? applications[0];
  const { data: exceptions = [], isLoading, isError } = useMeshExceptions(selected?.id);
  const repoName = new Map((selected?.repositories ?? []).map((r) => [r.id, r.full_name]));

  if (portfolioLoading) {
    return (
      <div role="status" className="p-9 text-center text-muted-foreground">
        {t("assurance.governance.exceptions.loading")}
      </div>
    );
  }
  if (applications.length === 0) {
    return <EmptyState title={t("assurance.governance.exceptions.noApps")} />;
  }

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-line px-pad py-3">
        <label className="grid gap-1 text-xs font-medium text-muted-foreground">
          {t("assurance.governance.exceptions.application")}
          <select
            value={selected?.id ?? ""}
            onChange={(e) => onApplicationChange(e.target.value)}
            className="h-11 rounded-xs border border-line bg-surface px-2 text-sm text-ink sm:h-9"
          >
            {applications.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
        {selected ? (
          <Link
            to={`/assurance/t/${teamId}/apps/${selected.id}`}
            className="inline-flex h-11 items-center text-sm font-semibold text-primary underline-offset-2 hover:underline sm:h-9"
          >
            {t("assurance.governance.exceptions.request")}
          </Link>
        ) : null}
      </div>
      {isLoading ? (
        <div role="status" className="p-9 text-center text-muted-foreground">
          {t("assurance.governance.exceptions.loading")}
        </div>
      ) : isError ? (
        <EmptyState title={t("assurance.governance.exceptions.error")} />
      ) : exceptions.length === 0 ? (
        <EmptyState size="small" title={t("assurance.governance.exceptions.empty")} />
      ) : (
        <div className="divide-y divide-line" data-testid="governance-exceptions-list">
          {exceptions.map((exception) => {
            const expired = isExceptionExpired(exception);
            return (
              <div key={exception.id} className="flex flex-wrap items-center gap-3 px-pad py-2.5" data-testid="governance-exception-row">
                <code className="font-mono text-[13px] font-semibold text-ink">{repoName.get(exception.repository_id) ?? exception.repository_id}</code>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-ink">{exception.rule}</span>
                  {exception.reason ? <span className="block text-xs text-muted-foreground">{exception.reason}</span> : null}
                </span>
                <span className={cn("shrink-0 text-xs", expired ? "font-semibold text-bad" : "text-muted-foreground")}>
                  {expired
                    ? t("assurance.governance.exceptions.expired", { date: formatDate(exception.expires_at) })
                    : t("assurance.governance.exceptions.expires", { date: formatDate(exception.expires_at) })}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default ExceptionsPanel;
