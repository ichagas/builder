import type { ComponentType } from "react";
import type { ActionSpec, PhaseNodeState } from "@/components/shell/types";

/**
 * Route metadata registry (T033). See plan.md "the move and restyle
 * recipe" step 2: "Declare the page's route metadata in
 * src/app/routes/project.tsx: phase, tool id, title, and the primary
 * action ... The shell renders PageHeader and the mobile primary slot from
 * it." and contracts/routes.md §1 for the phase/tool/path mapping.
 *
 * `usePrimaryAction` is a hook (not a plain value) because a page's primary
 * action usually depends on that page's own state (dirty/pending/disabled).
 * Until a page is restyled (Phase 3/4), its entry uses `useNoPrimaryAction`
 * — the page still renders its own legacy controls, and PageHeader isn't
 * mounted on it yet (T034 embedded mode keeps the old chrome working
 * meanwhile).
 */
export type Phase = "define" | "design" | "build" | "ship";

export type UsePrimaryAction = () => ActionSpec | undefined;

export const useNoPrimaryAction: UsePrimaryAction = () => undefined;

export interface ProjectToolRoute {
  /** Path segment under /p/:projectId/v/current/<phase>/ */
  tool: string;
  phase: Phase;
  title: string;
  usePrimaryAction: UsePrimaryAction;
  Component: ComponentType;
}

export interface SimpleRoute {
  path: string;
  title: string;
  usePrimaryAction: UsePrimaryAction;
  Component: ComponentType;
}

/** One row per RailPhase, derived by ProjectLayout from the current tool's route. */
export interface PhaseSummary {
  id: Phase;
  label: string;
  state: PhaseNodeState;
  firstTool: string;
}
