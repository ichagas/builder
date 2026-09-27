import { createPrimaryActionStore } from "@/lib/state/createPrimaryActionStore";

/**
 * Chat primary action (T045, WP-D4). See plan.md "the move and restyle
 * recipe" step 2 and contracts/design-system.md §2 (`PageHeader`): the
 * route registry (`app/routes/project.tsx`) declares `usePrimaryAction`
 * next to the page it belongs to, and `PageHeader` calls that hook by
 * default to render the action in the fixed top-right slot, mirrored into
 * the mobile `PrimaryActionSlot` at <=768px.
 *
 * Legacy's `handleNewChat` (Chat.tsx) is the page's existing new-session
 * flow, already exposed in-page as several buttons (the collapsed sidebar's
 * icon button labeled "New Chat", the expanded sidebar's "New Chat" button,
 * and the empty state's "Start New Chat" button -- all kept, unchanged, as
 * the recipe requires). The label here is "Start a conversation" rather than
 * "New Chat" so it doesn't collide (case-insensitive substring, per
 * `getByRole(..., { name })`) with those existing in-page button names that
 * `e2e/regression/pr-07.spec.ts` locates by role/name.
 */
const chatPrimaryActionStore = createPrimaryActionStore();

/**
 * Called by `Chat.tsx` with its current "start a conversation" action on every
 * render, and cleared on unmount so a stale action never lingers after
 * navigating away.
 */
export const usePublishChatPrimaryAction = chatPrimaryActionStore.usePublishPrimaryAction;

/** Referenced from the `chat` row in `app/routes/project.tsx`. */
export const useChatPrimaryAction = chatPrimaryActionStore.usePrimaryAction;
