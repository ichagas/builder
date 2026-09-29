import type { OnboardingRun } from "./api";

/** Wizard step routing (T150/T151): which step a run has unlocked and which one the URL resolves to. */
export type WizardStep = "team" | "connect" | "sandbox" | "output" | "prs";
export const STEP_ORDER: WizardStep[] = ["team", "connect", "sandbox", "output", "prs"];

type WizardRun = OnboardingRun;

/** The furthest step a run has unlocked (steps unlock in order, T150/T151). */
export function furthestStep(run: WizardRun | undefined): WizardStep {
  if (!run) return "team";
  if (run.status === "ready" || run.status === "prs_open" || run.status === "completed") return "prs";
  if (run.repositories.length === 0) return "connect";
  return "sandbox";
}

/** The step to show: the URL's step clamped to what the run has unlocked; a bare URL resumes a started run where it is. */
export function resolveStep(rawStep: string | undefined, run: WizardRun | undefined): WizardStep {
  if (!run) return "team";
  const furthest = furthestStep(run);
  if (!rawStep) {
    if (run.status === "draft") return "team";
    return run.status === "running" || run.status === "failed" || run.status === "cancelled" ? "sandbox" : run.status === "ready" ? "output" : "prs";
  }
  const requested = STEP_ORDER.indexOf(rawStep as WizardStep);
  if (requested < 0) return "connect";
  return STEP_ORDER[Math.min(requested, STEP_ORDER.indexOf(furthest))];
}

