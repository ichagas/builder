/**
 * Onboarding run state machine (spec 007, data-model.md §3).
 *
 * status: draft -> running -> ready -> prs_open -> completed
 *         (running|ready) -> failed
 *         (draft|running|ready) -> cancelled
 *         failed, cancelled, completed are terminal.
 *
 * step mirrors the wizard position (URL): team -> connect -> sandbox ->
 * output -> prs. It only ever advances; nothing here moves it backwards.
 */
import { OnboardingStatus, OnboardingStep } from "./repository";

const TRANSITIONS: Record<OnboardingStatus, OnboardingStatus[]> = {
  draft: ["running", "cancelled"],
  running: ["ready", "failed", "cancelled"],
  ready: ["prs_open", "failed", "cancelled"],
  prs_open: ["completed"],
  completed: [],
  failed: [],
  cancelled: [],
};

export const TERMINAL_STATUSES: OnboardingStatus[] = ["completed", "failed", "cancelled"];

export function isTerminal(status: OnboardingStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}

export function canTransition(from: OnboardingStatus, to: OnboardingStatus): boolean {
  if (from === to) return false;
  return TRANSITIONS[from]?.includes(to) ?? false;
}

/** Throws-free check callers use to build a 409 message. */
export function describeInvalidTransition(from: OnboardingStatus, to: OnboardingStatus): string {
  return `Cannot move onboarding run from "${from}" to "${to}"`;
}

export const STEP_ORDER: OnboardingStep[] = ["team", "connect", "sandbox", "output", "prs"];

export function stepIndex(step: OnboardingStep): number {
  return STEP_ORDER.indexOf(step);
}
