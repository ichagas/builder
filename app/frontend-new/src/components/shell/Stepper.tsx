import * as React from "react";
import { Check } from "lucide-react";
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
  return (
    <ol className={cn("flex items-stretch gap-1", className)}>
      {steps.map((step, index) => {
        const isCurrent = step.id === current;
        // A step in the future (todo, and not yet reached) is disabled — a
        // wizard's steps unlock in order, matching legacy behavior.
        const currentIndex = steps.findIndex((s) => s.id === current);
        const isFuture = step.state === "todo" && index > currentIndex;
        return (
          <li key={step.id} className="flex-1">
            <button
              type="button"
              onClick={() => onSelect(step.id)}
              disabled={isFuture}
              aria-current={isCurrent ? "step" : undefined}
              title={step.note}
              className={cn(
                "flex w-full flex-col items-start gap-1 rounded-xs border-b-2 px-2.5 py-2 text-left text-xs",
                isCurrent ? "border-primary text-ink" : "border-transparent text-muted",
                isFuture && "cursor-not-allowed opacity-50",
              )}
            >
              <span className="flex items-center gap-1.5 font-semibold">
                {step.state === "done" ? (
                  <Check aria-hidden="true" className="h-3.5 w-3.5 text-ok" />
                ) : (
                  <span aria-hidden="true" className="text-[10px] text-muted">
                    {index + 1}.
                  </span>
                )}
                {step.label}
              </span>
              {step.note ? <span className="truncate text-muted">{step.note}</span> : null}
            </button>
          </li>
        );
      })}
    </ol>
  );
}

export default Stepper;
