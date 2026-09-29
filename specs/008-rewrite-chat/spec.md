# Feature Specification: Rewrite the Chat page (Phase R)

**Feature Branch**: `008-rewrite-chat`  
**Created**: 2026-09-29  
**Status**: Draft  
**Input**: User description: "Rewrite the project Chat page (`app/frontend-new/src/pages/project/Chat.tsx`, route `/p/:id/v/current/define/chat`) with inline feedback instead of toasts, an inspector instead of dialogs, and state held in the URL. Selected in `specs/007-frontend-new/phase-r-selection.md` (order 1 of 4)."

**Related**: `specs/007-frontend-new/contracts/design-system.md` (shell components, state hooks), `contracts/routes.md` (route and PR-07), `contracts/api.md` (endpoints are reused unchanged). Regression baseline: PR-07.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Resume a conversation after reload or from a link (Priority: P1)

A user chats with the project assistant, reloads the browser or opens a shared link to a specific conversation, and lands in that same conversation with its messages, not an empty start.

**Why this priority**: Today the open session is component state, so a reload drops the conversation and a link cannot point at one. This is the most visible reason for the rewrite and every other story builds on the session being addressable.

**Independent Test**: Open a session, reload the page, and confirm the same session and its messages are shown; paste the URL in a new tab and confirm the same result.

**Acceptance Scenarios**:

1. **Given** a session is open, **When** the user reloads, **Then** the same session opens with its full message history and the sessions list highlights it.
2. **Given** a URL with a session id the user can access, **When** it is opened in a new tab, **Then** that session opens without an intermediate empty state.
3. **Given** a URL with a session id that does not exist or belongs to another project, **When** it is opened, **Then** an inline message says the conversation was not found, offers "Start a conversation" and the URL is cleaned.
4. **Given** a share-token link (`?t=`), **When** the user opens a session, **Then** the token is kept in the URL and sessions load as before (`useShareToken` behavior unchanged).

---

### User Story 2 - Send a message and follow the streamed answer (Priority: P1)

A user types a prompt (optionally with attached project context), sends it and watches the answer stream in. Failures show where the message is, with a retry.

**Why this priority**: This is the page's core job (PR-07: streaming responses, attach context).

**Independent Test**: Send a prompt with an attached artifact and confirm the streamed answer, its persistence after reload, and that a forced failure shows an inline retry with no toast.

**Acceptance Scenarios**:

1. **Given** an open session, **When** the user sends a message, **Then** the message appears at once, the answer streams below it, and the send control shows a pending state until the stream ends.
2. **Given** context has been attached (artifacts, canvas, requirements, repository files, schema), **When** the message is sent, **Then** the attached items are listed on the message, and the picker itself opens in the inspector.
3. **Given** the AI request fails, **When** the stream errors, **Then** the failed message shows an inline error with "Retry", and the composer keeps the user's text.
4. **Given** a long answer is streaming, **When** the user scrolls up, **Then** auto-scroll pauses and a "Jump to latest" control appears.

---

### User Story 3 - Manage sessions: create, rename, clone, delete (Priority: P2)

A user keeps several conversations, renames them, clones one to branch off, and deletes ones they no longer need, with an undo for deletion.

**Why this priority**: Sessions CRUD and clone are in PR-07 and are used constantly, but only after a conversation exists.

**Independent Test**: Create, rename, clone and delete a session; confirm each result shows on the affected row and the delete can be undone within the UndoBar window.

**Acceptance Scenarios**:

1. **Given** the sessions list, **When** the user renames a session inline and confirms, **Then** the row shows a saved state and no toast appears; on error the row shows the error and keeps the edit field open.
2. **Given** a session, **When** the user clones it, **Then** the clone appears selected in the list and the URL points at it.
3. **Given** a session, **When** the user deletes it (two-step confirm on the button), **Then** it leaves the list, the UndoBar offers "Undo" for 7 seconds, and undoing restores it with its messages.
4. **Given** the viewport is 390px wide, **When** the user opens the sessions list, **Then** it opens as a sheet with touch targets of at least 44px, as in the restyled page.

---

### User Story 4 - Summarize and save results as artifacts (Priority: P2)

A user generates an AI summary of a conversation, reads it in the inspector, and saves the summary, the full chat or a single message as an artifact.

**Why this priority**: These are the page's exit paths into the rest of the project (artifacts feed Design), and today they are a full-screen dialog plus five loading/success/error toasts.

**Independent Test**: Generate a summary, open it, save it as an artifact, and confirm the state of each step shows on the button or in the inspector, and the saved artifact exists on the Artifacts page.

**Acceptance Scenarios**:

1. **Given** a session with messages, **When** the user chooses "Summarize", **Then** the inspector opens with the summary streaming in, the action shows progress, and the summary is stored on the session.
2. **Given** a stored summary, **When** the user reopens "Summary", **Then** it shows the stored text without regenerating and offers "Regenerate".
3. **Given** the user saves a message, the full chat or the summary as an artifact, **When** the save finishes, **Then** the button shows "Saved" with a link to the artifact; on failure it shows the error with "Retry".
4. **Given** the inspector is open on a phone, **When** the user drags it, **Then** it moves between peek, half and full detents.

---

### Edge Cases

- Reload while an answer is streaming: the messages saved so far are shown and the interrupted answer does not resume. Resuming would need server-side run state, which chat does not have today and this rewrite does not add (see Assumptions; compare 011, whose agent runs are server-side).
- Two tabs open on the same session: new messages from either tab appear in both through the existing realtime hooks.
- A session deleted in another tab while it is open here: an inline notice replaces the thread and the URL is cleaned.
- Session list empty: an empty state with "Start a conversation" as the primary action.
- Attached context grows very large: the composer shows the attached count. The current page enforces no client-side limit on message or attached-context size (the only bound is the assistant's output cap: the project's maximum tokens, default 32,768, and 4,096 for summaries), and this rewrite adds none. If the service rejects a request as too large, the failed message shows the error inline with "Retry" (User Story 2, scenario 3).
- Token expired or share token invalid: the existing `TokenRecoveryMessage` behavior is kept.
- Only the user's own text is in the composer draft: a draft per session survives a session switch, and is lost on reload (acceptable; drafts are not URL state).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The selected session MUST be part of the page address and the page MUST restore it on reload, back/forward and link open, without reloading the surrounding project layout.
- **FR-002**: The page MUST NOT call `toast` for any action that has a place on screen. Every action listed in the stories reports pending, done and failed on the control that started it (`ActionButton`), on the affected row, or in the inspector. A toast is allowed only for events with no place on screen.
- **FR-003**: The page MUST NOT open a modal dialog. The summary view, the project-context picker and message details MUST open in the shell inspector panel (right panel on desktop, bottom sheet at 768px and below). Destructive actions use two-step confirmation on the button plus an undo window, not a dialog.
- **FR-004**: Every read and write of sessions, messages, project header, requirements, canvas nodes and artifacts MUST go through one shared data layer, and realtime updates MUST show on screen without a reload. No component may issue ad-hoc network requests from event handlers.
- **FR-005**: The AI streaming behavior (endpoint selection, system prompt, attached-context format, persistence of the assistant message) MUST be unchanged, so the same conversations produce the same stored messages (contract: `contracts/api.md` §1, no changes).
- **FR-006**: Long AI operations (streaming answer, summary) MUST be listed in the global status indicator while the user is on other pages.
- **FR-007**: The primary action MUST remain "Start a conversation" (route metadata), and the sessions sidebar toggle MUST keep its accessible name.
- **FR-008**: The page MUST keep the share-token behavior of `useShareToken` and `TokenRecoveryMessage`.
- **FR-009**: Only tokens from the design system MUST be used (token lint passes); the page MUST pass PR-07 at 1440 and 390 and axe with no new violations against the restyled baseline.
- **FR-010**: The page MUST be split into focused parts so that no single part carries the whole page (limit in implementation notes).

### Compatibility & Operational Requirements *(mandatory for brownfield changes)*

- **CR-001**: Affected contracts: the `/p/:id/v/current/define/chat` route (query keys `session`, `t`), the `chat_sessions`/`chat_messages` tables and realtime channels, the AI streaming function endpoints. No API or schema change. Legacy redirects from `/project/:id/chat` keep working.
- **CR-002**: No breaking change. Old links without `?session` open the sessions list with the most recent session selected, as today.
- **CR-003**: No new privileged action. Sessions remain scoped by project access and share token; the summary and save actions use the existing authorization.
- **CR-004**: Verification: unit tests for the hooks and components, PR-07 at 1440 and 390 with axe, a new E2E for reload restore and undo delete, then a smoke test on the staging stack after deploy.
- **CR-005**: On a released version (the version scope is read-only), the page MUST stay inert: send, create, rename, clone, delete and save-as-artifact are disabled with the reason shown, while browsing sessions and reading messages and summaries keep working.

### Key Entities

- **Chat session**: a conversation in a project. Title, AI title, AI summary, created/updated times, message list. Addressed by id in the URL.
- **Chat message**: user or assistant text, attached-context references, ordering, session id.
- **Attached context**: references to artifacts, canvas nodes, requirements, repository files or schema chosen for a message.
- **Summary**: AI text stored on the session, viewed in the inspector.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A reload on an open session returns the user to the same conversation in 100% of tested cases (PR-07 extended E2E), against 0% today.
- **SC-002**: Toast notifications raised by the Chat page and its components drop from 23 call sites to at most 2 (events with no place on screen); the goal is 0.
- **SC-003**: Modal dialogs on the page drop from 1 (plus the project selector) to 0.
- **SC-004**: Ad-hoc network requests issued from page components drop to 0; all go through the shared data layer.
- **SC-005**: No visible regression: PR-07 passes at 1440 and 390, and axe violations are equal or fewer than the restyled baseline.
- **SC-006**: First message appears on screen within 100 ms of pressing send (optimistic).

## Assumptions

- The restyled page (T045) is the behavior baseline; nothing is redesigned beyond the four goals.
- Realtime hooks (`useRealtimeChatSessions`, `useRealtimeChatMessages`) stay and feed the query cache.
- The shell components and state hooks named in `contracts/design-system.md` exist and are used as documented.
- Chat answers are streamed by a client-initiated request and there is no server-side run state for them. This is why a reload mid-answer keeps only the saved messages; agent runs in Build (011) are server-side, which is why they can reopen after reload.
- Phase R starts after cutover (T073); this spec is not a prerequisite for it.
- French translation keys are not required for this rewrite (research D-16), but new strings should go through `react-i18next` keys where the codebase already does so.

## Implementation notes (for plan)

Non-binding hints for the plan phase. They are not requirements.

- Address: `?session=<id>` via `useUrlState`, with `?t=` kept for share tokens.
- Data: TanStack Query with keyed queries and mutations; realtime hooks feed the query cache; one shared streaming helper.
- Feedback and shell: `ActionButton`, `Inspector` (peek/half/full detents), `UndoBar` (7 s), `StatusPill` via `useLongTask`.
- Structure: components and hooks each under 400 lines; no direct `fetch` or `functions.invoke` in page files outside the streaming helper and mutations.
- Read-only: rely on the `VersionScope` readOnly guard plus explicit `disabled` on the mutating controls.
