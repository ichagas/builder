import { createPrimaryActionStore } from "@/lib/state/createPrimaryActionStore";

/**
 * Release page primary action (T112, NV-05). The page publishes "Release
 * vX" with `confirm` (two-step) and its disabled state on every render;
 * the route row in `app/routes/project.tsx` reads it back.
 */
const store = createPrimaryActionStore();

export const usePublishReleasePrimaryAction = store.usePublishPrimaryAction;
export const useReleasePrimaryAction = store.usePrimaryAction;
