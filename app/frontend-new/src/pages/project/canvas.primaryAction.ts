import { createPrimaryActionStore } from "@/lib/state/createPrimaryActionStore";

/**
 * Canvas primary action (T046, WP-G1). See plan.md "the move and restyle
 * recipe" step 2 and contracts/design-system.md §2 (`PageHeader`): the
 * route registry (`app/routes/project.tsx`) declares `usePrimaryAction`
 * next to the page it belongs to.
 *
 * Legacy Canvas has no single "add a node" button -- nodes are added by
 * dragging a type from the palette (or, on touch devices, tapping one).
 * The closest thing to a page-level "main button" is "AI Architect"
 * (`Sparkles` icon): it's the first, always-visible action in both the
 * desktop toolbar and the mobile tools menu, and it's the one flow that
 * populates the canvas with nodes+edges in one step. The header's primary
 * action opens the same `AIArchitectDialog` the existing toolbar button
 * already opens -- see `Canvas.tsx`'s `setIsAIArchitectOpen`.
 *
 * `UsePrimaryAction` is a plain hook with no props, so it can't be handed
 * `Canvas.tsx`'s local `setIsAIArchitectOpen` directly -- same reasoning
 * as `requirements.primaryAction.ts`. Canvas publishes its current action
 * into this store's external state on every render.
 */
const canvasPrimaryActionStore = createPrimaryActionStore();

/** Called by `Canvas.tsx` with its current action on every render, cleared on unmount. */
export const usePublishCanvasPrimaryAction = canvasPrimaryActionStore.usePublishPrimaryAction;

/** Referenced from the `canvas` row in `app/routes/project.tsx`. */
export const useCanvasPrimaryAction = canvasPrimaryActionStore.usePrimaryAction;
