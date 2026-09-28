import { createPrimaryActionStore } from "@/lib/state/createPrimaryActionStore";

/**
 * Database primary action (T050, WP-B3). See plan.md "the move and restyle
 * recipe" step 2 and contracts/design-system.md §2 (`PageHeader`): the
 * route registry (`app/routes/project.tsx`) declares `usePrimaryAction`
 * next to the page it belongs to, and `PageHeader` (rendered inside
 * `Database.tsx`) calls that hook by default to render "New Database" in
 * the fixed top-right slot, mirrored into the mobile `PrimaryActionSlot`
 * at <=768px.
 *
 * Legacy's main button (`pages/project/Database.tsx`'s "New Database",
 * next to "Connect" and "Refresh" in the deploy-tab toolbar) opens
 * `DatabaseDialog` in create mode -- unconditionally, for any project
 * member, same as the "Create First Database" empty-state button that
 * stays in the page body untouched. It only appears on the "deploy" tab
 * (superadmins also have a "superadmin" tab with no create action), so it
 * is published only while that tab is active, same as legacy hides the
 * toolbar button on other tabs.
 *
 * Unlike `requirements.primaryAction.ts`, this action needs none of
 * `Database.tsx`'s realtime data (just `setIsCreateOpen`), but it still
 * goes through `createPrimaryActionStore` rather than a plain hook:
 * `UsePrimaryAction` has no props, so the route registry can't be handed
 * the page's local `setIsCreateOpen` directly, and calling
 * `useRealtimeDatabases` a second time here would open a second realtime
 * channel for the same project.
 */
const databasePrimaryActionStore = createPrimaryActionStore();

/**
 * Called by `Database.tsx` with its current "New Database" action on every
 * render, and cleared on unmount (or `undefined` when off the deploy tab)
 * so a stale action never lingers.
 */
export const usePublishDatabasePrimaryAction = databasePrimaryActionStore.usePublishPrimaryAction;

/** Referenced from the `database` row in `app/routes/project.tsx`. */
export const useDatabasePrimaryAction = databasePrimaryActionStore.usePrimaryAction;
