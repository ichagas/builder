import * as React from "react";
import type { UsePrimaryAction } from "@/components/shell/types";

/**
 * Dashboard's primary action (T040/WP-P2). See plan.md "the move and
 * restyle recipe" step 2: the route registry (src/app/routes/root.tsx)
 * declares the primary action next to the page, referenced by this hook.
 *
 * Dashboard's "Create New Project" action opens the page's existing
 * create-project dialog (EnhancedCreateProjectDialog) rather than
 * navigating or firing a one-shot mutation. `PageHeader` calls
 * `usePrimaryAction` from inside `PageHeader` itself, not inside
 * Dashboard, so the dialog's open flag can't live as ordinary component
 * state co-located with the dialog -- it's wired through a tiny external
 * store instead, the same pattern `PrimaryActionContext` already uses to
 * carry the *published* action from a page to `PrimaryActionSlot`. Only
 * one Dashboard is ever mounted at a time (it's a routed page), so a
 * module-level singleton is safe; Dashboard resets it to closed on
 * unmount so no state leaks across navigations or tests.
 *
 * `useDashboardPrimaryAction` itself is *not* built on a hand-rolled
 * `useSyncExternalStore` -- unlike D1's requirements page (see
 * `pages/project/requirements.primaryAction.ts`), Dashboard's primary
 * action doesn't depend on any state that lives in the page's own render;
 * it's a constant label/onClick pair, computed directly by the hook the
 * route registry calls. There's nothing here for `createPrimaryActionStore`
 * (T027, WP-F3b) to replace: that helper exists for a page to hand a *live*
 * ActionSpec across the page/header boundary, and only the dialog's
 * open/closed flag crosses that boundary here -- a different concern (a
 * boolean, not an ActionSpec) that keeps its own tiny store below.
 */
type Listener = () => void;

let isOpen = false;
const listeners = new Set<Listener>();

function setOpen(next: boolean) {
  if (isOpen === next) return;
  isOpen = next;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: Listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return isOpen;
}

/** Used by Dashboard.tsx to read/drive the create-project dialog's open state. */
export function useCreateProjectDialogOpen(): [boolean, (next: boolean) => void] {
  const open = React.useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return [open, setOpen];
}

/** Referenced from the "projects" row in src/app/routes/root.tsx. */
export const useDashboardPrimaryAction: UsePrimaryAction = () => ({
  label: "Create New Project",
  onClick: () => setOpen(true),
});

export default useDashboardPrimaryAction;
