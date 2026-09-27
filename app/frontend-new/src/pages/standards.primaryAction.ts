import { useAdmin } from "@/contexts/AdminContext";
import type { ActionSpec } from "@/components/shell/types";

/**
 * standards.primaryAction (T060, WP-L1). See plan.md "the move and restyle
 * recipe" step 2: the page's primary action lives in its own hook, next to
 * the page, and is referenced from the route registry
 * (`src/app/routes/library.tsx`).
 *
 * Standards' legacy "main button" is the inline "Add category" field +
 * button rendered only for admins (`pages/Standards.tsx`). That control
 * needs its own text input before it can submit, so — to avoid reworking
 * it into a dialog (Phase R, out of scope here) — the header's primary
 * action just focuses and scrolls to the existing inline input, matching
 * the same admin gate the inline control already has. Non-admins get no
 * primary action, exactly as they see no "Add category" control today.
 */
export const NEW_CATEGORY_NAME_INPUT_ID = "standards-new-category-name";

export function useStandardsPrimaryAction(): ActionSpec | undefined {
  const { isAdmin } = useAdmin();
  if (!isAdmin) return undefined;

  return {
    label: "New category",
    onClick: () => {
      const input = document.getElementById(NEW_CATEGORY_NAME_INPUT_ID) as HTMLInputElement | null;
      input?.focus();
      input?.scrollIntoView({ behavior: "smooth", block: "center" });
    },
  };
}

export default useStandardsPrimaryAction;
