import * as React from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useBoolPref } from "@/lib/state/useUiPrefs";

/**
 * Disclosure (T028). `<details>`-based. `prefKey` remembers open state via
 * `useUiPrefs` (`open.<disclosure>`), per contracts/design-system.md §2.
 */
export interface DisclosureProps {
  prefKey: string;
  summary: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
  className?: string;
}

export function Disclosure({ prefKey, summary, children, defaultOpen = false, className }: DisclosureProps) {
  const [open, setOpen] = useBoolPref(`open.${prefKey}`, defaultOpen);

  return (
    <details
      open={open}
      className={cn("group rounded-xs border border-line", className)}
      onToggle={(event) => setOpen((event.target as HTMLDetailsElement).open)}
    >
      <summary className="flex cursor-pointer list-none items-center gap-1.5 px-3 py-2 text-sm font-semibold text-ink">
        <ChevronRight aria-hidden="true" className="h-4 w-4 transition-transform group-open:rotate-90" />
        {summary}
      </summary>
      <div className="px-3 pb-3 pt-0.5">{children}</div>
    </details>
  );
}

export default Disclosure;
