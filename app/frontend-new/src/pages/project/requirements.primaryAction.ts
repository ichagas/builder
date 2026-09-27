import * as React from "react";
import type { ActionSpec } from "@/components/shell/types";

/**
 * Requirements primary action (T042, WP-D1). See plan.md "the move and
 * restyle recipe" step 2 and contracts/design-system.md §2 (`PageHeader`):
 * the route registry (`app/routes/project.tsx`) declares `usePrimaryAction`
 * next to the page it belongs to, and `PageHeader` (rendered inside
 * `Requirements.tsx`, itself inside `ProjectLayout`'s `<Outlet/>`) calls
 * that hook by default to render "Add epic" in the fixed top-right slot,
 * mirrored into the mobile `PrimaryActionSlot` at <=768px.
 *
 * `UsePrimaryAction` (app/routes/types.ts) is a plain hook with no props,
 * so it can't be handed `Requirements.tsx`'s local `addRequirement` (from
 * `useRealtimeRequirements`) as an argument, and calling
 * `useRealtimeRequirements` a second time here would open a second
 * realtime channel for the same project -- a change to the page's data
 * fetching the restyle recipe rules out. Instead `Requirements.tsx`
 * publishes its current "Add epic" action into a tiny external store on
 * every render (the same subscribe/getSnapshot shape
 * `components/shell/PrimaryActionContext.tsx` uses for the opposite
 * direction -- page render, not new React state, stays the source of
 * truth) and `useRequirementsPrimaryAction` reads it back via
 * `useSyncExternalStore`.
 */
let currentAction: ActionSpec | undefined;
const listeners = new Set<() => void>();

function setAction(action: ActionSpec | undefined) {
  currentAction = action;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): ActionSpec | undefined {
  return currentAction;
}

/**
 * Called by `Requirements.tsx` with its current "Add epic" action
 * (label/onClick/disabled) on every render, and cleared on unmount so a
 * stale action never lingers after navigating away.
 */
export function usePublishRequirementsPrimaryAction(action: ActionSpec | undefined): void {
  React.useEffect(() => {
    setAction(action);
  });
  React.useEffect(() => {
    return () => setAction(undefined);
  }, []);
}

/** Referenced from the `requirements` row in `app/routes/project.tsx`. */
export function useRequirementsPrimaryAction(): ActionSpec | undefined {
  return React.useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
