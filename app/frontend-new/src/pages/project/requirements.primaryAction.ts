import { createPrimaryActionStore } from "@/lib/state/createPrimaryActionStore";

/**
 * Requirements primary action (T042, WP-D1; store extracted to
 * `createPrimaryActionStore` in T027, WP-F3b). See plan.md "the move and
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
 * publishes its current "Add epic" action into `createPrimaryActionStore`'s
 * tiny external store on every render (page render, not new React state,
 * stays the source of truth) and `useRequirementsPrimaryAction` reads it
 * back via that store's `usePrimaryAction`.
 */
const requirementsPrimaryActionStore = createPrimaryActionStore();

/**
 * Called by `Requirements.tsx` with its current "Add epic" action
 * (label/onClick/disabled) on every render, and cleared on unmount so a
 * stale action never lingers after navigating away.
 */
export const usePublishRequirementsPrimaryAction = requirementsPrimaryActionStore.usePublishPrimaryAction;

/** Referenced from the `requirements` row in `app/routes/project.tsx`. */
export const useRequirementsPrimaryAction = requirementsPrimaryActionStore.usePrimaryAction;
