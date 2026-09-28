import { createPrimaryActionStore } from "@/lib/state/createPrimaryActionStore";

/**
 * Build Book editor primary action (T062, WP-L3). See plan.md "the move
 * and restyle recipe" step 2 and contracts/design-system.md §2
 * (`PageHeader`): the route registry (`app/routes/library.tsx`) declares
 * `usePrimaryAction` next to the page it belongs to, and `PageHeader`
 * (rendered inside `BuildBookEditor.tsx`) calls that hook to render the
 * action in the fixed top-right slot, mirrored into the mobile
 * `PrimaryActionSlot` at <=768px.
 *
 * Legacy's main button (`pages/BuildBookEditor.tsx`'s header row) is
 * "Create" while creating a new build book (`isNew`) or "Save" while
 * editing an existing one, disabled while `isSaving`, and calls the page's
 * own `handleSave` -- unchanged, including the known bug it keeps (see
 * `handleSave`'s comment): `pronghornApiAdapter`'s `QueryBuilder.select()`
 * always sets `queryType = "select"`, so the create path's
 * `.insert(data).select("id").single()` silently turns into a no-filter
 * SELECT and never inserts a row (T013). `UsePrimaryAction` is a plain
 * no-arg hook, so it can't be handed `BuildBookEditor.tsx`'s local
 * `handleSave`/`isSaving`/`isNew` directly -- the page publishes its
 * current action into this store on every render instead (including
 * `undefined` for the non-admin branch, which legacy also renders nothing
 * for).
 *
 * The page's own header-row "Create"/"Save" button is removed (this
 * replaces it in the fixed header slot) so `e2e/regression/pr-18.spec.ts`'s
 * `getByRole("button", { name: "Save", exact: true })` keeps matching
 * exactly one button; "Delete" and "Back" stay as in-page buttons,
 * untouched.
 */
const buildBookEditorPrimaryActionStore = createPrimaryActionStore();

/**
 * Called by `BuildBookEditor.tsx` with its current "Create"/"Save" action
 * on every render, and cleared on unmount so a stale action never lingers
 * after navigating away.
 */
export const usePublishBuildBookEditorPrimaryAction = buildBookEditorPrimaryActionStore.usePublishPrimaryAction;

/** Referenced from the `build-books/new` and `build-books/:id/edit` rows in `app/routes/library.tsx`. */
export const useBuildBookEditorPrimaryAction = buildBookEditorPrimaryActionStore.usePrimaryAction;
