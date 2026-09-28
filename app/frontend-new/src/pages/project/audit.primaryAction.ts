import { createPrimaryActionStore } from "@/lib/state/createPrimaryActionStore";

/**
 * Audit primary action (T052, WP-S2). See plan.md "the move and restyle
 * recipe" step 2 and contracts/design-system.md §2 (`PageHeader`): the
 * route registry (`app/routes/project.tsx`) declares `usePrimaryAction`
 * next to the page it belongs to, and `PageHeader` (rendered inside
 * `Audit.tsx`) calls that hook by default to render "New Audit" in the
 * fixed top-right slot, mirrored into the mobile `PrimaryActionSlot` at
 * <=768px.
 *
 * Legacy's main button (`ProjectPageHeader`'s "New Audit" button,
 * `pages/project/Audit.tsx`) opens `AuditConfigurationDialog` --
 * unconditionally, for any project member, same as the "Start New Audit"
 * empty-state button that stays in the page body untouched. This action
 * needs none of `Audit.tsx`'s realtime session/pipeline data (just
 * `setConfigDialogOpen`), but still goes through `createPrimaryActionStore`
 * rather than a plain hook: `UsePrimaryAction` has no props, so the route
 * registry can't be handed the page's local `setConfigDialogOpen` directly.
 */
const auditPrimaryActionStore = createPrimaryActionStore();

/**
 * Called by `Audit.tsx` with its current "New Audit" action on every
 * render, and cleared on unmount so a stale action never lingers after
 * navigating away.
 */
export const usePublishAuditPrimaryAction = auditPrimaryActionStore.usePublishPrimaryAction;

/** Referenced from the `audit` row in `app/routes/project.tsx`. */
export const useAuditPrimaryAction = auditPrimaryActionStore.usePrimaryAction;
