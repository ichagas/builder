import * as React from "react";
import { Check } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

/**
 * Stepper (T028). Horizontal steps (change page, onboarding). See
 * contracts/design-system.md §2: "Props steps[{id,label,state,note}],
 * current, onSelect. Future steps are disabled in wizards."
 */
export type StepState = "done" | "active" | "todo";

export interface Step {
  id: string;
  label: string;
  state: StepState;
  note?: string;
}

export interface StepperProps {
  steps: Step[];
  current: string;
  onSelect: (id: string) => void;
  className?: string;
}

export function Stepper({ steps, current, onSelect, className }: StepperProps) {
  const { t } = useTranslation();
  return (
    <ol aria-label={t("a11y.stepper.label")} className={cn("flex items-stretch gap-1", className)}>
      {steps.map((step, index) => {
        const isCurrent = step.id === current;
        // A step in the future (todo, and not yet reached) is disabled — a
        // wizard's steps unlock in order, matching legacy behavior.
        const currentIndex = steps.findIndex((s) => s.id === current);
        const isFuture = step.state === "todo" && index > currentIndex;
        return (
          <li key={step.id} className={cn("min-w-0", isCurrent ? "flex-[3] sm:flex-1" : "flex-1")}>
            <button
              type="button"
              onClick={() => onSelect(step.id)}
              disabled={isFuture}
              aria-current={isCurrent ? "step" : undefined}
              title={step.note}
              className={cn(
                "flex min-h-11 w-full min-w-0 flex-col items-start gap-1 rounded-xs border-b-2 px-2.5 py-2 text-left text-xs",
                isCurrent ? "border-primary text-ink" : "border-transparent text-muted-foreground",
                isFuture && "cursor-not-allowed opacity-50",
              )}
            >
              <span className="flex min-w-0 max-w-full items-center gap-1.5 font-semibold">
                {step.state === "done" ? (
                  <Check aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-ok" />
                ) : (
                  <span aria-hidden="true" className="shrink-0 text-[10px] text-muted-foreground">
                    {index + 1}.
                  </span>
                )}
                <span
                  data-testid="step-label"
                  title={step.label}
                  // Narrow screens: only the current step shows its label (compact
                  // form); the others keep it as the accessible name (sr-only).
                  className={cn(isCurrent ? "truncate" : "sr-only sm:not-sr-only sm:truncate")}
                >
                  {step.label}
                </span>
                {step.state === "done" ? <span className="sr-only">{t("a11y.stepper.done")}</span> : null}
                {isFuture ? <span className="sr-only">{t("a11y.stepper.locked")}</span> : null}
              </span>
              {step.note ? <span className="truncate text-muted-foreground">{step.note}</span> : null}
            </button>
          </li>
        );
      })}
    </ol>
  );
}

export default Stepper;
