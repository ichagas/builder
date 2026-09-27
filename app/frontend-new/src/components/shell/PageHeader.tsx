import * as React from "react";
import { cn } from "@/lib/utils";
import { usePublishPrimaryAction } from "./PrimaryActionContext";
import { usePageRoute } from "./usePageRoute";
import type { ActionSpec } from "./types";

/** A no-op fallback for routes whose registry entry has no `usePrimaryAction`
 * of its own (or that have no registry entry at all — e.g. this PageHeader
 * is rendered in a unit test without a router). Keeps the hook call below
 * unconditional regardless of which route matched. */
const useNoPrimaryAction = () => undefined;

/**
 * PageHeader (T027). See contracts/design-system.md §2:
 * "crumb, title, primary?: ActionSpec. The primary action renders top right
 * and is mirrored in PrimaryActionSlot at <=768px."
 *
 * This is what "the move and restyle recipe" step 2 (plan.md) means by
 * "Declare the page's route metadata ... The shell renders PageHeader and
 * the mobile primary slot from it": a page renders one `<PageHeader/>`,
 * and by default (T033) its title and primary action come from the
 * current route's registry entry via `usePageRoute` — a page only needs
 * `crumb`, or a `title`/`primary` override, as explicit props.
 */
export interface PageHeaderProps {
  crumb?: string;
  /** Overrides the current route's registry title (`usePageRoute()`). */
  title?: string;
  /** Overrides the current route's registry primary action. */
  primary?: ActionSpec;
  className?: string;
}

export function PageHeader({ crumb, title, primary, className }: PageHeaderProps) {
  const route = usePageRoute();
  const useRoutePrimaryAction = route?.usePrimaryAction ?? useNoPrimaryAction;
  const routePrimary = useRoutePrimaryAction();
  const resolvedTitle = title ?? route?.title ?? "";
  const resolvedPrimary = primary ?? routePrimary;
  usePublishPrimaryAction(resolvedPrimary);

  return (
    <div className={cn("flex items-start justify-between gap-3 border-b border-line bg-surface px-4 py-3", className)}>
      <div className="min-w-0">
        {crumb ? <div className="truncate text-xs font-medium uppercase tracking-wide text-muted">{crumb}</div> : null}
        <h1 className="truncate text-xl font-bold text-ink">{resolvedTitle}</h1>
      </div>
      {resolvedPrimary ? (
        <button
          type="button"
          onClick={() => resolvedPrimary.onClick?.()}
          disabled={resolvedPrimary.disabled}
          title={resolvedPrimary.disabled ? resolvedPrimary.disabledReason : undefined}
          className={cn(
            "hidden h-10 shrink-0 items-center rounded-xs px-4 text-sm font-semibold sm:flex",
            resolvedPrimary.tone === "danger"
              ? "bg-bad text-white"
              : resolvedPrimary.tone === "ghost"
                ? "border border-line bg-surface text-ink"
                : "bg-primary text-primary-foreground",
            resolvedPrimary.disabled && "cursor-not-allowed opacity-50",
          )}
        >
          {resolvedPrimary.label}
        </button>
      ) : null}
    </div>
  );
}

export default PageHeader;
