import { createPrimaryActionStore } from "@/lib/state/createPrimaryActionStore";

/**
 * Specifications primary action (T047, WP-G2). See plan.md "the move and
 * restyle recipe" step 2 and `requirements.primaryAction.ts` for the
 * pattern this follows: the route registry (`app/routes/project.tsx`)
 * declares `usePrimaryAction` next to the page it belongs to, and
 * `PageHeader` calls that hook to render the action in the fixed
 * top-right slot (mirrored into the mobile `PrimaryActionSlot` at
 * <=768px).
 *
 * Legacy's main button on this page is "Generate Analysis" (kicks off the
 * multi-agent generation). `Specifications.tsx` keeps that in-page button
 * unchanged (behavior must not change) and additionally publishes the same
 * action here under the label "Generate specification" -- a different
 * accessible name so the regression spec's role/name lookups on the
 * in-page button don't hit a strict-mode violation against the header's
 * mirrored button.
 */
const specificationsPrimaryActionStore = createPrimaryActionStore();

/**
 * Called by `Specifications.tsx` with its current "Generate Analysis"
 * action (mirrored as "Generate specification") on every render, and
 * cleared on unmount so a stale action never lingers after navigating
 * away.
 */
export const usePublishSpecificationsPrimaryAction = specificationsPrimaryActionStore.usePublishPrimaryAction;

/** Referenced from the `specifications` row in `app/routes/project.tsx`. */
export const useSpecificationsPrimaryAction = specificationsPrimaryActionStore.usePrimaryAction;
