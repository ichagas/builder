import { createPrimaryActionStore } from "@/lib/state/createPrimaryActionStore";

/**
 * Deploy (Environments) primary action (T051, WP-S1). See plan.md "the
 * move and restyle recipe" step 2 and contracts/design-system.md §2
 * (`PageHeader`): the route registry (`app/routes/project.tsx`) declares
 * `usePrimaryAction` next to the page it belongs to, and `PageHeader`
 * (rendered inside `Deploy.tsx`) calls that hook by default to render "New
 * Deployment" in the fixed top-right slot, mirrored into the mobile
 * `PrimaryActionSlot` at <=768px.
 *
 * Legacy's main button (`ProjectPageHeader`'s "New Deployment" is actually
 * a plain toolbar button next to the tabs, `pages/project/Deploy.tsx`)
 * opens `DeploymentDialog` in create mode -- unconditionally, for any
 * project member, same as the "Create First Deployment"/"Create Local
 * Config" empty-state buttons that stay in the page body untouched.
 * Unlike `requirements.primaryAction.ts`, this action needs none of
 * `Deploy.tsx`'s realtime deployment data (just `setIsCreateOpen`), but it
 * still goes through `createPrimaryActionStore` rather than a plain hook:
 * `UsePrimaryAction` has no props, so the route registry can't be handed
 * the page's local `setIsCreateOpen` directly, and calling
 * `useRealtimeDeployments` a second time here would open a second realtime
 * channel for the same project.
 */
const deployPrimaryActionStore = createPrimaryActionStore();

/**
 * Called by `Deploy.tsx` with its current "New Deployment" action on every
 * render, and cleared on unmount so a stale action never lingers after
 * navigating away.
 */
export const usePublishDeployPrimaryAction = deployPrimaryActionStore.usePublishPrimaryAction;

/** Referenced from the `environments` row in `app/routes/project.tsx`. */
export const useDeployPrimaryAction = deployPrimaryActionStore.usePrimaryAction;
