import * as React from "react";
import { Loader2, CheckCircle2, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLongTask } from "@/lib/state/useLongTask";
import { StatusPill } from "./StatusPill";
import type { LongTask } from "./types";

/**
 * StatusCenter (T029). See contracts/design-system.md §2: "StatusPill /
 * StatusCenter: Shows running long tasks (useLongTask) from realtime:
 * agent sessions, audits, deploys, sandbox runs."
 *
 * A single self-contained widget — the `StatusPill` trigger plus the
 * "Running and recent" popover (`shared/app.js` `#statusPop`/`#runList`) —
 * so a layout only needs to drop `<StatusCenter/>` into `GlobalBar`'s
 * `statusPill` slot; it owns its own open/closed state.
 */
const STATUS_ICON: Record<LongTask["status"], React.ReactNode> = {
  running: <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin text-run" />,
  done: <CheckCircle2 aria-hidden="true" className="h-4 w-4 text-ok" />,
  failed: <XCircle aria-hidden="true" className="h-4 w-4 text-bad" />,
};

export function StatusCenter({ className }: { className?: string }) {
  const { tasks, runningCount, failedCount } = useLongTask();
  const [open, setOpen] = React.useState(false);
  const popoverId = "status-center-popover";

  React.useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  return (
    <div className={cn("relative", className)}>
      <StatusPill runningCount={runningCount} failedCount={failedCount} expanded={open} aria-controls={popoverId} onClick={() => setOpen((o) => !o)} />
      {open ? (
        <div id={popoverId} role="dialog" aria-label="Running and recent" className="absolute right-0 top-full z-40 mt-2 w-72 rounded-xs border border-line bg-surface p-2 shadow-lg">
          {tasks.length === 0 ? (
            <p className="px-1 py-2 text-sm text-muted">Nothing running</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {tasks.map((task) => (
                <li key={task.id} className="flex items-center gap-2 rounded-xs px-1.5 py-1.5 text-sm">
                  {STATUS_ICON[task.status]}
                  <span className="min-w-0 flex-1 truncate text-ink">{task.label}</span>
                  {task.status === "running" && task.progress !== undefined ? (
                    <span className="text-xs text-muted">{Math.round(task.progress)}%</span>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}

export default StatusCenter;
