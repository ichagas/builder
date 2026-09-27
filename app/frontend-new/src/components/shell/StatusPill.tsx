import * as React from "react";
import { Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

/**
 * StatusPill (T024). Shows running long tasks (`useLongTask`, T029) from
 * realtime: agent sessions, audits, deploys, sandbox runs. Purely
 * presentational — `StatusCenter`/`useLongTask` (T029) compute the counts
 * and pass them in, so GlobalBar (T024) doesn't need to depend on the
 * long-task hook.
 */
export interface StatusPillProps {
  runningCount: number;
  failedCount?: number;
  onClick: () => void;
  expanded: boolean;
  "aria-controls"?: string;
}

export function StatusPill({ runningCount, failedCount = 0, onClick, expanded, ...rest }: StatusPillProps) {
  const { t } = useTranslation();
  const hasActivity = runningCount > 0 || failedCount > 0;
  const ariaLabel = hasActivity
    ? [
        t("shell.status.runningAndRecent"),
        ": ",
        t("shell.status.runningCount", { count: runningCount }),
        failedCount ? `, ${t("shell.status.failedCount", { count: failedCount })}` : "",
      ].join("")
    : `${t("shell.status.runningAndRecent")}: ${t("shell.status.nothingRunning").toLowerCase()}`;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={expanded}
      aria-haspopup="true"
      aria-label={ariaLabel}
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-full border border-line bg-surface-2 px-2.5 text-xs font-semibold",
        failedCount > 0 ? "text-bad" : runningCount > 0 ? "text-run" : "text-muted",
      )}
      {...rest}
    >
      {runningCount > 0 ? (
        <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <span aria-hidden="true" className={cn("h-2 w-2 rounded-full", failedCount > 0 ? "bg-bad" : "bg-muted")} />
      )}
      {runningCount > 0 ? runningCount : failedCount > 0 ? failedCount : ""}
    </button>
  );
}

export default StatusPill;
