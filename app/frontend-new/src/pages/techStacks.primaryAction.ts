import { useAdmin } from "@/contexts/AdminContext";
import type { UsePrimaryAction } from "@/components/shell/types";

/**
 * Primary action for the Tech Stacks library page (T061, WP-L2). See
 * plan.md "the move and restyle recipe" step 2.
 *
 * Legacy's "main button" here isn't a single-click create (like a dialog
 * launcher) -- it's the admin-only inline "New tech stack name..." input +
 * "Add Tech Stack" button rendered by the page itself (kept as-is per the
 * recipe: behavior must not change, no dialog rework). Wiring it into the
 * route registry's `usePrimaryAction` without lifting that input's state
 * out of the page would mean duplicating it, so the primary action instead
 * focuses the existing inline input (`TECH_STACK_NAME_INPUT_ID`, rendered by
 * `pages/TechStacks.tsx`).
 *
 * Legacy hides the create control entirely for non-admins (`{isAdmin &&
 * ...}`), and WP-L1's `useStandardsPrimaryAction` follows the same
 * convention, so this returns `undefined` (no PageHeader button, no mobile
 * PrimaryActionSlot) rather than a visible-but-disabled action for
 * non-admins -- matching what the page itself already does.
 *
 * Label is "New tech stack", not "Add Tech Stack" (the page's own inline
 * button, kept as-is): PR-17 (`e2e/regression/pr-17.spec.ts`) does
 * `getByRole("button", { name: "Add Tech Stack" })`, a case-insensitive
 * substring match -- a same-named PageHeader/PrimaryActionSlot button would
 * make that locator ambiguous (strict-mode violation) without the spec
 * itself changing.
 */
export const TECH_STACK_NAME_INPUT_ID = "new-tech-stack-name";

export const useTechStacksPrimaryAction: UsePrimaryAction = () => {
  const { isAdmin } = useAdmin();

  if (!isAdmin) return undefined;

  return {
    label: "New tech stack",
    onClick: () => {
      document.getElementById(TECH_STACK_NAME_INPUT_ID)?.focus();
    },
  };
};

export default useTechStacksPrimaryAction;
