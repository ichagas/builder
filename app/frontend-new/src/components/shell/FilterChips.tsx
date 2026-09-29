import * as React from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { useUrlState } from "@/lib/state/useUrlState";

/**
 * FilterChips (T028). "URL-bound (?f=), with counts." See
 * contracts/design-system.md §2. Single-select among the given options,
 * "all" is the implicit default and is omitted from the URL.
 */
export interface FilterChipOption {
  id: string;
  label: string;
  count?: number;
}

export interface FilterChipsProps {
  options: FilterChipOption[];
  paramKey?: string;
  defaultValue?: string;
  className?: string;
}

export function FilterChips({ options, paramKey = "f", defaultValue = "all", className }: FilterChipsProps) {
  const { t } = useTranslation();
  const [active, setActive] = useUrlState(paramKey, defaultValue);

  return (
    <div role="group" aria-label={t("a11y.filters")} className={cn("flex flex-wrap gap-1.5", className)}>
      {options.map((option) => {
        const isActive = option.id === active;
        return (
          <button
            key={option.id}
            type="button"
            aria-pressed={isActive}
            onClick={() => setActive(option.id)}
            className={cn(
              "flex h-11 items-center gap-1.5 md:h-7 rounded-full border px-2.5 text-xs font-medium",
              isActive ? "border-primary bg-primary-soft text-primary" : "border-line bg-surface text-muted-foreground",
            )}
          >
            {option.label}
            {option.count !== undefined ? <span className="text-[11px] opacity-80">{option.count}</span> : null}
          </button>
        );
      })}
    </div>
  );
}

export default FilterChips;
