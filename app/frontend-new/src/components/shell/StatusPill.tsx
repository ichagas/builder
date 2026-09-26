import * as React from "react";
import { Loader2 } from "lucide-react";
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
  const hasActivity = runningCount > 0 || failedCount > 0;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={expanded}
      aria-haspopup="true"
      aria-label={
        hasActivity
          ? `Running and recent: ${runningCount} running${failedCount ? `, ${failedCount} failed` : ""}`
          : "Running and recent: nothing running"
      }
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
