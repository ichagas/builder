import { useNavigate } from "react-router-dom";
import { useAdmin } from "@/contexts/AdminContext";
import type { UsePrimaryAction } from "@/components/shell/types";

/**
 * Primary action for the Build Books library list page (T062, WP-L3). See
 * plan.md "the move and restyle recipe" step 2.
 *
 * Legacy's main button here (`pages/BuildBooks.tsx`'s header "New Build
 * Book") is an admin-only, unconditional navigation to `/build-books/new`
 * (redirected to `/library/build-books/new` by `app/redirects.tsx`) -- no
 * page-owned state (dialog open flag, mutation) is involved, so this is a
 * plain hook rather than `createPrimaryActionStore`: `useAdmin()` and
 * `useNavigate()` are both ordinary hooks callable directly here, and
 * `PageHeader` renders inside `BuildBooks.tsx`'s own subtree, so it's still
 * inside the router context `useNavigate()` needs.
 *
 * Legacy hides the button entirely for non-admins (`{isAdmin && ...}`), so
 * this returns `undefined` (no PageHeader button, no mobile
 * PrimaryActionSlot) rather than a visible-but-disabled action, matching
 * what the page itself already did before the restyle -- same convention
 * as `standards.primaryAction.ts` / `techStacks.primaryAction.ts`.
 *
 * Label is "New Build Book", matching legacy exactly (PR-18,
 * `e2e/regression/pr-18.spec.ts`, does
 * `getByRole("button", { name: "New Build Book" }).click()`).
 * `BuildBooks.tsx` no longer renders its own header "New Build Book"
 * button (this replaces it in the fixed header slot); the empty state's
 * differently-labeled "Create Build Book" button stays untouched, so there
 * is no name collision.
 */
export const useBuildBooksPrimaryAction: UsePrimaryAction = () => {
  const { isAdmin } = useAdmin();
  const navigate = useNavigate();

  if (!isAdmin) return undefined;

  return {
    label: "New Build Book",
    onClick: () => navigate("/build-books/new"),
  };
};

export default useBuildBooksPrimaryAction;
