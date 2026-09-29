import * as React from "react";
import { Loader2, CheckCircle2, XCircle } from "lucide-react";
import { useTranslation } from "react-i18next";
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
  const { t } = useTranslation();
  const { tasks, runningCount, failedCount } = useLongTask();
  const [open, setOpen] = React.useState(false);
  const popoverId = "status-center-popover";
  const rootRef = React.useRef<HTMLDivElement>(null);
  const popoverRef = React.useRef<HTMLDivElement>(null);

  // Announce async status changes (T160): a polite, always-mounted live
  // region so "2 running" -> "All tasks finished" / "1 failed" is spoken
  // without the user opening the popover. Text is only set after the first
  // change so nothing is announced on page load.
  const [announcement, setAnnouncement] = React.useState("");
  const previous = React.useRef({ runningCount, failedCount });
  React.useEffect(() => {
    const prev = previous.current;
    previous.current = { runningCount, failedCount };
    if (prev.runningCount === runningCount && prev.failedCount === failedCount) return;
    if (failedCount > prev.failedCount) setAnnouncement(t("a11y.status.failed", { count: failedCount }));
    else if (runningCount === 0 && prev.runningCount > 0) setAnnouncement(t("a11y.status.allDone"));
    else if (runningCount > 0) setAnnouncement(t("a11y.status.running", { count: runningCount }));
  }, [runningCount, failedCount, t]);

  // Focus management (T160): move focus into the popover when it opens;
  // Escape closes it and returns focus to the pill; clicking elsewhere closes it.
  React.useEffect(() => {
    if (!open) return;
    popoverRef.current?.focus({ preventScroll: true });
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        rootRef.current?.querySelector<HTMLButtonElement>("button[aria-controls]")?.focus();
      }
    };
    const onPointerDown = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <span role="status" aria-live="polite" className="sr-only">
        {announcement}
      </span>
      <StatusPill runningCount={runningCount} failedCount={failedCount} expanded={open} aria-controls={popoverId} onClick={() => setOpen((o) => !o)} />
      {open ? (
        <div id={popoverId} ref={popoverRef} tabIndex={-1} role="dialog" aria-label={t("shell.status.runningAndRecent")} className="focus:outline-none absolute right-0 top-full z-40 mt-2 w-72 rounded-xs border border-line bg-surface p-2 shadow-lg">
          {tasks.length === 0 ? (
            <p className="px-1 py-2 text-sm text-muted-foreground">{t("shell.status.nothingRunning")}</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {tasks.map((task) => (
                <li key={task.id} className="flex items-center gap-2 rounded-xs px-1.5 py-1.5 text-sm">
                  {STATUS_ICON[task.status]}
                  <span className="min-w-0 flex-1 truncate text-ink">
                    {task.label}
                    <span className="sr-only">{`, ${t(`a11y.status.task.${task.status}`)}`}</span>
                  </span>
                  {task.status === "running" && task.progress !== undefined ? (
                    <span className="text-xs text-muted-foreground">{Math.round(task.progress)}%</span>
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
