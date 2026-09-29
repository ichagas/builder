import * as React from "react";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";

/**
 * TypeChip (T023). Change-type indicator for work items / changes.
 * Contract: contracts/design-system.md §2 "Domain atoms".
 * Visual reference: docs/design/frontend-redesign/option-a-styles/shared/base.css:183
 * `.type { font-size: 12px; font-weight: 700; padding: 5px 8px; }` /
 * `.type-bug` / `.type-feature` / `.type-enhancement` / `.type-base`, and
 * `shared/kit.js` `TYPES` (labels). Plain text, not mono — the prototype's
 * `.type` rule carries no font-family override.
 */
export type ChangeType = "bug" | "feature" | "enhancement" | "base";

const CLASSES: Record<ChangeType, string> = {
  bug: "bg-bug-soft text-bug",
  feature: "bg-feat-soft text-feat",
  enhancement: "bg-enh-soft text-enh",
  base: "bg-base-soft text-base",
};

export interface TypeChipProps extends React.HTMLAttributes<HTMLSpanElement> {
  type: ChangeType;
  /** Override the default label (e.g. keep it in sync with a translated string). */
  label?: string;
}

export function TypeChip({ type, label, className, ...props }: TypeChipProps) {
  const { t } = useTranslation();
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-xs px-2 py-[5px] text-xs font-bold leading-none whitespace-nowrap",
        CLASSES[type],
        className,
      )}
      {...props}
    >
      {label ?? t(`shell.atoms.type.${type}`)}
    </span>
  );
}

export default TypeChip;
