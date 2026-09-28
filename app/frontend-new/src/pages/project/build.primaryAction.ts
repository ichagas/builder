import { createPrimaryActionStore } from "@/lib/state/createPrimaryActionStore";

/**
 * Build agent primary action (T048, WP-B1). See plan.md "the move and
 * restyle recipe" step 2 and contracts/design-system.md §2 (`PageHeader`):
 * the route registry (`app/routes/project.tsx`) declares `usePrimaryAction`
 * next to the page it belongs to, and `PageHeader` (rendered inside
 * `Build.tsx`) calls that hook by default to render the action in the
 * fixed top-right slot, mirrored into the mobile `PrimaryActionSlot` at
 * <=768px.
 *
 * Legacy's main button is the Send/Stop icon button at the bottom of the
 * agent composer (`components/build/UnifiedAgentInterface.tsx`, kept
 * unchanged in place) -- it has no accessible name (icon-only), so it
 * can't collide with this action's label. This action mirrors that same
 * button's current state (label/onClick/disabled flip between "Run agent"
 * and "Stop agent" depending on whether a session is submitting) rather
 * than duplicating its submit/abort logic: `UnifiedAgentInterface` reports
 * its live state up via the `onPrimaryActionChange` prop (see its own
 * doc comment) and `Build.tsx` republishes it here on every render, same
 * shape `deploy.primaryAction.ts`/`chat.primaryAction.ts` use for a page
 * whose action depends on state the route registry can't reach directly.
 */
const buildPrimaryActionStore = createPrimaryActionStore();

/**
 * Called by `Build.tsx` with its current "Run agent"/"Stop agent" action
 * on every render, and cleared on unmount so a stale action never lingers
 * after navigating away.
 */
export const usePublishBuildPrimaryAction = buildPrimaryActionStore.usePublishPrimaryAction;

/** Referenced from the `agent` row in `app/routes/project.tsx`. */
export const useBuildPrimaryAction = buildPrimaryActionStore.usePrimaryAction;
