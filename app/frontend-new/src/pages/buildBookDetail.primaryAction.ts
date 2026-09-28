import { createPrimaryActionStore } from "@/lib/state/createPrimaryActionStore";

/**
 * Build Book detail page primary action (T062, WP-L3). See plan.md "the
 * move and restyle recipe" step 2 and contracts/design-system.md §2
 * (`PageHeader`): the route registry (`app/routes/library.tsx`) declares
 * `usePrimaryAction` next to the page it belongs to, and `PageHeader`
 * (rendered inside `BuildBookDetail.tsx`) calls that hook to render the
 * action in the fixed top-right slot, mirrored into the mobile
 * `PrimaryActionSlot` at <=768px.
 *
 * Legacy's main button on this page (`pages/BuildBookDetail.tsx`'s
 * absolute-positioned "Edit" button over the hero image) navigates to the
 * edit route and is only rendered once the build book has loaded
 * (`isAdmin && buildBook`, after the page's own `isLoading`/`!buildBook`
 * early returns). `UsePrimaryAction` is a plain no-arg hook, so it can't be
 * handed `BuildBookDetail.tsx`'s local `buildBook`/`isLoading` (from
 * `useBuildBookDetail`) directly, and calling that hook a second time here
 * would open a second realtime subscription for the same build book --
 * instead the page publishes its current "Edit" action into this store on
 * every render (including its loading/not-found branches, where it
 * publishes `undefined`), matching the "Edit" button being entirely absent
 * on those branches today.
 */
const buildBookDetailPrimaryActionStore = createPrimaryActionStore();

/**
 * Called by `BuildBookDetail.tsx` with its current "Edit" action
 * (present only once `isAdmin && buildBook`) on every render, and cleared
 * on unmount so a stale action never lingers after navigating away.
 */
export const usePublishBuildBookDetailPrimaryAction = buildBookDetailPrimaryActionStore.usePublishPrimaryAction;

/** Referenced from the `build-books/:id` row in `app/routes/library.tsx`. */
export const useBuildBookDetailPrimaryAction = buildBookDetailPrimaryActionStore.usePrimaryAction;
