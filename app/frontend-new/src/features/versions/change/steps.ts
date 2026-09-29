import type { WorkItem } from "../api";

export const PHASE_STEPS = ["define", "design", "build", "ship"] as const;
export type PhaseStep = (typeof PHASE_STEPS)[number];
export type PhaseState = "todo" | "active" | "done" | "skipped";

/**
 * Pure step logic for the change page (T111, NV-03), kept out of the
 * components so it is unit-testable. Mirrors the prototype's `changeView`
 * (docs/design/frontend-redesign/option-a-styles/shared/versions.js) and the
 * backend's `steps/:step/complete` rules (routes/workItems.ts).
 */

export type StepStates = Record<PhaseStep, PhaseState>;

export function isPhaseStep(value: string | undefined): value is PhaseStep {
  return !!value && (PHASE_STEPS as readonly string[]).includes(value);
}

/** `phase_state` with every step present (a missing key reads as "todo"). */
export function stepStates(item: Pick<WorkItem, "phase_state">): StepStates {
  const raw = item.phase_state ?? {};
  const pick = (step: PhaseStep): PhaseState => {
    const value = raw[step];
    return value === "active" || value === "done" || value === "skipped" ? value : "todo";
  };
  return { define: pick("define"), design: pick("design"), build: pick("build"), ship: pick("ship") };
}

/**
 * The step to show: the URL's `:step` when valid, else the first active
 * step, else the first step not done (a change nobody started yet opens on
 * Define), else Ship.
 */
export function resolveStep(param: string | undefined, states: StepStates): PhaseStep {
  if (isPhaseStep(param)) return param;
  const active = PHASE_STEPS.find((step) => states[step] === "active");
  if (active) return active;
  const open = PHASE_STEPS.find((step) => states[step] === "todo");
  return open ?? "ship";
}

/** The step to go to after Define: Design, or Build when Design is skipped. */
export function stepAfterDefine(states: StepStates): PhaseStep {
  return states.design === "skipped" ? "build" : "design";
}

export type StepActionKind =
  | { kind: "complete"; step: Exclude<PhaseStep, "ship"> }
  | { kind: "unskip" }
  | { kind: "openRelease" };

export interface StepAction {
  action: StepActionKind;
  /** Set when the action exists but can't run yet. */
  disabledReasonKey?: string;
}

/**
 * The single primary action for `step`, or undefined when there is none
 * (a step that is done/todo, or a change that is locked).
 */
export function stepAction(step: PhaseStep, states: StepStates, opts: { locked: boolean; agentRunning: boolean }): StepAction | undefined {
  if (opts.locked) return undefined;
  const state = states[step];
  switch (step) {
    case "define":
      return state === "active" ? { action: { kind: "complete", step: "define" } } : undefined;
    case "design":
      if (state === "skipped") return { action: { kind: "unskip" } };
      return state === "active" ? { action: { kind: "complete", step: "design" } } : undefined;
    case "build":
      if (state !== "active") return undefined;
      return opts.agentRunning
        ? { action: { kind: "complete", step: "build" }, disabledReasonKey: "versions.change.build.waitForAgent" }
        : { action: { kind: "complete", step: "build" } };
    case "ship":
      return { action: { kind: "openRelease" } };
  }
}

/** A change is locked once shipped or declined, or when its version is released (read-only baseline). */
export function isLocked(item: Pick<WorkItem, "status">, versionReleased: boolean): boolean {
  return item.status === "shipped" || item.status === "declined" || versionReleased;
}

/** Ids of canvas nodes a change affects, split for the scoped canvas. */
export function scopeNodes<N extends { id?: string }>(nodes: N[], affectedIds: string[]): { affected: N[]; others: N[] } {
  const ids = new Set(affectedIds);
  return { affected: nodes.filter((n) => ids.has(n.id)), others: nodes.filter((n) => !ids.has(n.id)) };
}

/** Human label for a canvas node (`data.label`, then `data.name`, then its type). */
export function nodeLabel(node: { id?: string; type?: string | null; data?: Record<string, unknown> | null }): string {
  const data = node.data ?? {};
  for (const key of ["label", "name", "title"]) {
    const value = data[key];
    if (typeof value === "string" && value.trim()) return value;
  }
  return node.type ?? node.id;
}
