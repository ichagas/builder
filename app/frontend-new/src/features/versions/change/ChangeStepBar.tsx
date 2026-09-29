import { Check } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { PHASE_STEPS, type PhaseStep, type StepStates } from "./steps";

/**
 * Step bar for one change (NV-03): Define, Design, Build, Ship. Unlike the
 * shell `Stepper` (a wizard whose future steps are disabled), every step is
 * navigable here (the prototype lets you look ahead) and a design step can be
 * "Skipped" (bugs skip it by default). The current step is `aria-current`.
 */
export function ChangeStepBar({
  itemKey,
  states,
  notes,
  current,
  onSelect,
}: {
  itemKey: string;
  states: StepStates;
  notes: Record<string, string> | null | undefined;
  current: PhaseStep;
  onSelect: (step: PhaseStep) => void;
}) {
  const { t } = useTranslation();
  return (
    <nav aria-label={t("versions.change.steps.label", { key: itemKey })}>
      <ol className="grid grid-cols-4 gap-1">
        {PHASE_STEPS.map((step, index) => {
          const state = states[step];
          const isCurrent = step === current;
          const note = state === "skipped" ? t("versions.change.steps.skipped") : notes?.[step];
          return (
            <li key={step} className="min-w-0">
              <button
                type="button"
                onClick={() => onSelect(step)}
                aria-current={isCurrent ? "step" : undefined}
                data-state={state}
                className={cn(
                  "flex min-h-[44px] w-full flex-col items-start gap-0.5 rounded-xs border-b-2 px-2 py-2 text-left text-xs",
                  isCurrent ? "border-primary text-ink" : "border-line text-muted-foreground",
                  state === "active" && !isCurrent && "border-primary/40",
                )}
              >
                <span className="flex items-center gap-1.5 font-semibold">
                  {state === "done" ? (
                    <Check aria-hidden="true" className="h-3.5 w-3.5 text-ok" />
                  ) : (
                    <span aria-hidden="true" className="text-[10px]">
                      {index + 1}.
                    </span>
                  )}
                  {t(`versions.change.steps.${step}`)}
                  <span className="sr-only">
                    {" "}
                    ({t(`versions.change.steps.state.${state}`)})
                  </span>
                </span>
                {note ? <span className="hidden max-w-full truncate text-muted-foreground sm:block">{note}</span> : null}
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export default ChangeStepBar;
