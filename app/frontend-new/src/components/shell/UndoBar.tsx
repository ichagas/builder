import * as React from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { useUndo } from "@/lib/state/useUndo";

/**
 * UndoBar (T029). See contracts/design-system.md §2: "A single slot,
 * bottom left on desktop and above the mobile action on phones. One
 * message at a time, 7s."
 */
export function UndoBar({ className }: { className?: string }) {
  const { t } = useTranslation();
  const { current, trigger, dismiss } = useUndo();
  if (!current) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "fixed inset-x-4 bottom-[calc(72px+env(safe-area-inset-bottom))] z-30 flex items-center justify-between gap-3 rounded-xs border border-line bg-surface-2 px-3 py-2 shadow-lg sm:inset-x-auto sm:bottom-4 sm:left-4 sm:w-auto",
        className,
      )}
    >
      <span className="text-sm text-ink">{current.text}</span>
      <div className="flex shrink-0 items-center gap-1">
        <button type="button" onClick={trigger} className="rounded-xs px-2 py-1 text-sm font-semibold text-primary">
          {t("shell.undo.undo")}
        </button>
        <button type="button" onClick={dismiss} aria-label={t("shell.undo.dismiss")} className="rounded-xs px-2 py-1 text-sm text-muted-foreground">
          ×
        </button>
      </div>
    </div>
  );
}

export default UndoBar;
