import * as React from "react";
import { cn } from "@/lib/utils";
import type { ModeBadgeInfo, ModeKind } from "./types";

/**
 * ModeBadge (T024). "Building", "Released vX" or "Standards vX" — see
 * contracts/design-system.md §2 GlobalBar row. Colors from the mode-*
 * tokens (tailwind-preset.ts): building, released, connected. "Standards"
 * has no dedicated mode color in tokens.css, so it renders with the neutral
 * surface/line pair instead of a mode color.
 */
const DOT_CLASS: Record<ModeKind, string> = {
  building: "bg-mode-building",
  released: "bg-mode-released",
  connected: "bg-mode-connected",
  standards: "bg-muted",
};

export interface ModeBadgeProps extends ModeBadgeInfo, React.HTMLAttributes<HTMLSpanElement> {}

export function ModeBadge({ kind, label, className, ...props }: ModeBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-xs border border-line bg-surface-2 px-2 py-1 text-xs font-semibold text-ink",
        className,
      )}
      {...props}
    >
      <span aria-hidden="true" className={cn("h-2 w-2 rounded-full", DOT_CLASS[kind])} />
      {label}
    </span>
  );
}

export default ModeBadge;
