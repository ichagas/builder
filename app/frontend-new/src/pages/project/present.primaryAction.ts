import * as React from "react";
import type { UsePrimaryAction } from "@/components/shell/types";

/**
 * Present's primary action (T053, WP-S3). See plan.md "the move and restyle
 * recipe" step 2: the route registry (`src/app/routes/project.tsx`)
 * declares the primary action next to the page, referenced by this hook.
 *
 * Present's legacy "main button" is "New Presentation", a `DialogTrigger`
 * that opens the create-presentation dialog (only rendered while the
 * "list" tab is active). `PageHeader` calls `usePrimaryAction` from inside
 * `PageHeader` itself, not inside `Present`, so the dialog's open flag
 * can't live as ordinary component state co-located with the dialog --
 * it's wired through a tiny external store instead, the same pattern
 * `dashboard.primaryAction.ts` (T040, WP-P2) uses for
 * `EnhancedCreateProjectDialog`. Only one `Present` is ever mounted at a
 * time (it's a routed page), so a module-level singleton is safe; `Present`
 * resets it to closed on unmount so no state leaks across navigations or
 * tests.
 *
 * Unlike legacy, the header's primary action is always available (not
 * gated to the "list" tab) -- selecting "New Presentation" from the
 * "editor" or "blackboard" tab simply opens the same dialog on top of
 * whatever tab is active, matching how `PageHeader`'s primary action is a
 * page-level action, not a per-tab one. The dialog itself, its fields and
 * `handleCreatePresentation` are unchanged.
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

/** Used by Present.tsx to read/drive the create-presentation dialog's open state. */
export function useCreatePresentationDialogOpen(): [boolean, (next: boolean) => void] {
  const open = React.useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return [open, setOpen];
}

/** Referenced from the "present" row in src/app/routes/project.tsx. */
export const usePresentPrimaryAction: UsePrimaryAction = () => ({
  label: "New Presentation",
  onClick: () => setOpen(true),
});

export default usePresentPrimaryAction;
