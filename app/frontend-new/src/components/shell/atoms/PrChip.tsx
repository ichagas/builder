import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * PrChip (T023). Small mono chip naming a pull request and its state.
 * Reference: `shared/onboarding.css` `.pr-chip` / `.pr-chip.open|.merged|.none`.
 */
export type PrChipState = "open" | "merged" | "none";

const STATE_CLASSES: Record<PrChipState, string> = {
  open: "border-primary text-primary",
  // The prototype's literal "merged" bg/text (#F1EAFE / #6D28D9) is a violet
  // tint close to --c-define; reuse that token (with an opacity modifier for
  // the tint) rather than adding a raw color.
  merged: "border-transparent bg-define/10 text-define",
  none: "border-line-2 text-muted",
};

export interface PrChipProps extends Omit<React.HTMLAttributes<HTMLSpanElement>, "children"> {
  /** Omit for a chip that only names a state (e.g. "In sync", "Not opened"). */
  number?: number | string;
  /** Omit for a bare "#123" chip with no state styling. */
  state?: PrChipState;
  children?: React.ReactNode;
}

export function PrChip({ number, state, children, className, ...props }: PrChipProps) {
  const content = children ?? (number !== undefined ? `PR #${number}${state ? ` · ${state}` : ""}` : undefined);

  return (
    <span
      className={cn(
        "inline-flex items-center whitespace-nowrap rounded-s border px-2 py-[3px] font-mono text-xs font-semibold",
        state ? STATE_CLASSES[state] : "border-line-2 text-ink",
        className,
      )}
      {...props}
    >
      {content}
    </span>
  );
}

export default PrChip;
