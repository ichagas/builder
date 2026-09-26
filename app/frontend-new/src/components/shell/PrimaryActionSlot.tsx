import * as React from "react";
import { cn } from "@/lib/utils";
import { useCurrentPrimaryAction } from "./PrimaryActionContext";

/**
 * PrimaryActionSlot (T024/T027). Mirrors the page's primary action
 * (published by `PageHeader` via `usePublishPrimaryAction`) at <=768px, per
 * contracts/design-system.md §2. Fixed to the bottom of the viewport, above
 * `MobileTabBar`. Renders nothing when no page has published an action, or
 * above the 768px breakpoint (handled with `md:hidden` so it never
 * duplicates the desktop button in `PageHeader`).
 */
export function PrimaryActionSlot() {
  const action = useCurrentPrimaryAction();
  if (!action) return null;

  return (
    <div
      id="mobile-primary-action"
      className="fixed inset-x-0 bottom-[calc(56px+env(safe-area-inset-bottom))] z-30 flex justify-center px-4 md:hidden"
    >
      <button
        type="button"
        onClick={() => action.onClick?.()}
        disabled={action.disabled}
        title={action.disabled ? action.disabledReason : undefined}
        className={cn(
          "flex h-11 w-full max-w-md items-center justify-center rounded-xs px-4 text-sm font-semibold shadow-lg",
          action.tone === "danger"
            ? "bg-bad text-white"
            : action.tone === "ghost"
              ? "border border-line bg-surface text-ink"
              : "bg-primary text-primary-foreground",
          action.disabled && "cursor-not-allowed opacity-50",
        )}
      >
        {action.label}
      </button>
    </div>
  );
}

export default PrimaryActionSlot;
