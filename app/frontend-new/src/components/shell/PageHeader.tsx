import * as React from "react";
import { cn } from "@/lib/utils";
import { usePublishPrimaryAction } from "./PrimaryActionContext";
import type { ActionSpec } from "./types";

/**
 * PageHeader (T027). See contracts/design-system.md §2:
 * "crumb, title, primary?: ActionSpec. The primary action renders top right
 * and is mirrored in PrimaryActionSlot at <=768px."
 *
 * This is what "the move and restyle recipe" step 2 (plan.md) means by
 * "Declare the page's route metadata ... The shell renders PageHeader and
 * the mobile primary slot from it": a page renders one `<PageHeader/>` with
 * its crumb/title/primary, and this component both draws the desktop
 * button and publishes it to `PrimaryActionSlot` via
 * `usePublishPrimaryAction` for the mobile mirror.
 */
export interface PageHeaderProps {
  crumb?: string;
  title: string;
  primary?: ActionSpec;
  className?: string;
}

export function PageHeader({ crumb, title, primary, className }: PageHeaderProps) {
  usePublishPrimaryAction(primary);

  return (
    <div className={cn("flex items-start justify-between gap-3 border-b border-line bg-surface px-4 py-3", className)}>
      <div className="min-w-0">
        {crumb ? <div className="truncate text-xs font-medium uppercase tracking-wide text-muted">{crumb}</div> : null}
        <h1 className="truncate text-xl font-bold text-ink">{title}</h1>
      </div>
      {primary ? (
        <button
          type="button"
          onClick={() => primary.onClick?.()}
          disabled={primary.disabled}
          title={primary.disabled ? primary.disabledReason : undefined}
          className={cn(
            "hidden h-10 shrink-0 items-center rounded-xs px-4 text-sm font-semibold sm:flex",
            primary.tone === "danger"
              ? "bg-bad text-white"
              : primary.tone === "ghost"
                ? "border border-line bg-surface text-ink"
                : "bg-primary text-primary-foreground",
            primary.disabled && "cursor-not-allowed opacity-50",
          )}
        >
          {primary.label}
        </button>
      ) : null}
    </div>
  );
}

export default PageHeader;
