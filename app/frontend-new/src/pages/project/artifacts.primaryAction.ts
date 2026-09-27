import { createPrimaryActionStore } from "@/lib/state/createPrimaryActionStore";

/**
 * Artifacts primary action (T044, WP-D3). See plan.md "the move and restyle
 * recipe" step 2 and contracts/design-system.md §2 (`PageHeader`): the
 * route registry (`app/routes/project.tsx`) declares `usePrimaryAction`
 * next to the page it belongs to, and `PageHeader` (rendered inside
 * `Artifacts.tsx`, itself inside `ProjectLayout`'s `<Outlet/>`) calls that
 * hook by default to render "Add artifact" in the fixed top-right slot,
 * mirrored into the mobile `PrimaryActionSlot` at <=768px.
 *
 * `UsePrimaryAction` (app/routes/types.ts) is a plain hook with no props,
 * so it can't be handed `Artifacts.tsx`'s local `setIsAddDialogOpen` as an
 * argument. Instead `Artifacts.tsx` publishes its current "Add artifact"
 * action into `createPrimaryActionStore`'s tiny external store on every
 * render and `useArtifactsPrimaryAction` reads it back via that store's
 * `usePrimaryAction`.
 */
const artifactsPrimaryActionStore = createPrimaryActionStore();

/**
 * Called by `Artifacts.tsx` with its current "Add artifact" action
 * (label/onClick) on every render, and cleared on unmount so a stale
 * action never lingers after navigating away.
 */
export const usePublishArtifactsPrimaryAction = artifactsPrimaryActionStore.usePublishPrimaryAction;

/** Referenced from the `artifacts` row in `app/routes/project.tsx`. */
export const useArtifactsPrimaryAction = artifactsPrimaryActionStore.usePrimaryAction;
