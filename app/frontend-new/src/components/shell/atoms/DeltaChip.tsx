import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * DeltaChip (T023). Pill used for "what changed" verdicts (new requirement,
 * changed criteria, regression, mesh pass/warn/fail wording, etc.).
 * Reference: `shared/base.css` `.delta` / `.delta-new` / `.delta-changed` /
 * `.delta-regression`, `shared/app.js` `deltaChip()`.
 */
export type DeltaKind = "new" | "changed" | "regression";

const DEFAULT_LABEL: Record<DeltaKind, string> = {
  new: "New",
  changed: "Changed",
  regression: "Regression",
};

const CLASSES: Record<DeltaKind, string> = {
  new: "bg-ok-soft text-ok",
  changed: "bg-warn-soft text-warn",
  regression: "bg-bad-soft text-bad",
};

export interface DeltaChipProps extends React.HTMLAttributes<HTMLSpanElement> {
  kind: DeltaKind;
  children?: React.ReactNode;
}

export function DeltaChip({ kind, children, className, ...props }: DeltaChipProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-pill px-[9px] py-[3px] text-xs font-bold leading-none whitespace-nowrap",
        CLASSES[kind],
        className,
      )}
      {...props}
    >
      {children ?? DEFAULT_LABEL[kind]}
    </span>
  );
}

export default DeltaChip;
