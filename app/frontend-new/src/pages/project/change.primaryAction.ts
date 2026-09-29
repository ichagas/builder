import { createPrimaryActionStore } from "@/lib/state/createPrimaryActionStore";

/**
 * Change page primary action (T111, WP-V2, NV-03). The action depends on the
 * step being shown and the change's state (mark definition ready, approve
 * design, send for review, open release), so `Change.tsx` publishes it on
 * every render and the route row in `app/routes/project.tsx` reads it back
 * (same pattern as `audit.primaryAction.ts`).
 */
const changePrimaryActionStore = createPrimaryActionStore();

export const usePublishChangePrimaryAction = changePrimaryActionStore.usePublishPrimaryAction;
export const useChangePrimaryAction = changePrimaryActionStore.usePrimaryAction;
