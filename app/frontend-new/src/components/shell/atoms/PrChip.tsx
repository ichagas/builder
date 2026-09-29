import * as React from "react";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";

/**
 * PrChip (T023). Small mono chip naming a pull request and its state.
 * Reference: `shared/onboarding.css` `.pr-chip` / `.pr-chip.open|.merged|.none`.
 */
export type PrChipState = "open" | "merged" | "none";

const STATE_CLASSES: Record<PrChipState, string> = {
  open: "border-primary text-primary",
  // The prototype's literal "merged" bg/text (#F1EAFE / #6D28D9) is a violet
  // tint close to --c-define; reuse that token for the tint; text uses --c-define-ink because
  // --c-define on its own 10% tint is only ~4.1:1 (AA needs 4.5:1).
  merged: "border-transparent bg-define/10 text-define-ink",
  none: "border-line-2 text-muted-foreground",
};

export interface PrChipProps extends Omit<React.HTMLAttributes<HTMLSpanElement>, "children"> {
  /** Omit for a chip that only names a state (e.g. "In sync", "Not opened"). */
  number?: number | string;
  /** Omit for a bare "#123" chip with no state styling. */
  state?: PrChipState;
  children?: React.ReactNode;
}

export function PrChip({ number, state, children, className, ...props }: PrChipProps) {
  const { t } = useTranslation();
  const content =
    children ??
    (number !== undefined
      ? state
        ? t("shell.atoms.pr.labelWithState", { number, state: t(`shell.atoms.pr.state.${state}`) })
        : t("shell.atoms.pr.label", { number })
      : undefined);

  return (
    <span
      className={cn(
        "inline-flex items-center whitespace-nowrap rounded-xs border px-2 py-[3px] font-mono text-xs font-semibold",
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
