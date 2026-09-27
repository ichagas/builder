import { createPrimaryActionStore } from "@/lib/state/createPrimaryActionStore";

/**
 * Project standards primary action (T043, WP-D2). See plan.md "the move
 * and restyle recipe" step 2 and contracts/design-system.md §2
 * (`PageHeader`): the route registry (`app/routes/project.tsx`) declares
 * `usePrimaryAction` next to the page it belongs to.
 *
 * Legacy's main button for this page is "Save Changes" (`pages/project/
 * Standards.tsx`'s `handleSave`), which persists the selected standards/tech
 * stack deltas. `UsePrimaryAction` is a plain no-arg hook, so it can't be
 * handed the page's local `handleSave`/`saving` state directly -- the page
 * publishes its current action into this store on every render instead
 * (same pattern as `requirements.primaryAction.ts`).
 */
const standardsPrimaryActionStore = createPrimaryActionStore();

/**
 * Called by `Standards.tsx` with its current "Save Changes" action
 * (onClick/disabled) on every render, and cleared on unmount so a stale
 * action never lingers after navigating away.
 */
export const usePublishProjectStandardsPrimaryAction = standardsPrimaryActionStore.usePublishPrimaryAction;

/** Referenced from the `standards` row in `app/routes/project.tsx`. */
export const useProjectStandardsPrimaryAction = standardsPrimaryActionStore.usePrimaryAction;
