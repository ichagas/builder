# Feature Specification: Rewrite the Build (agent) page (Phase R)

**Feature Branch**: `011-rewrite-build`  
**Created**: 2026-09-29  
**Status**: Draft  
**Input**: User description: "Rewrite the project Build page (`app/frontend-new/src/pages/project/Build.tsx`, route `/p/:id/v/current/build/agent`) with inline feedback instead of toasts, an inspector instead of dialogs, agent session, file and tab held in the URL, and TanStack Query for data. Selected in `specs/007-frontend-new/phase-r-selection.md` (order 4 of 5)."

**Related**: `specs/007-frontend-new/contracts/design-system.md`, `contracts/routes.md` (PR-10), `contracts/api.md` (reused unchanged), `specs/010-rewrite-repository/` (shared file tree, editor, create and rename).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Run the coding agent and follow it (Priority: P1)

A user writes a prompt, starts the agent against the Prime repository, and follows its status, progress, chat and file changes, with the option to stop it.

**Why this priority**: Running the agent is the page's primary action ("Run agent" / "Stop agent") and the reason for the page.

**Independent Test**: Start a run, reload mid-run, confirm the same run is shown with live progress, stop it, and confirm the stopped state shows.

**Acceptance Scenarios**:

1. **Given** a prompt and a Prime repository, **When** the user starts the agent, **Then** the primary action changes to "Stop agent", the run appears in `StatusPill`, and progress shows on the page.
2. **Given** a run is active, **When** the user reloads, **Then** the page reopens on that run (`?session=`) with its messages, progress and file changes.
3. **Given** no Prime repository is set, **When** the user opens the page, **Then** an inline `NextStepBanner` links to Repository to set one and the run action is disabled with the reason.
4. **Given** a run fails or is aborted, **When** it stops, **Then** the status shows the reason inline with "Run again", and the log stays available.
5. **Given** a 390px viewport, **When** the user switches between prompt, chat, files and staging, **Then** the switch is a URL tab (`?tab=`) and the whole page keeps 44px touch targets.

---

### User Story 2 - Review agent output: files, staging and diff (Priority: P1)

A user reviews the files the agent changed, opens a diff, edits a file, and stages or discards changes before committing.

**Why this priority**: Reviewing output before it reaches the repository is the trust step of the Build phase.

**Independent Test**: Run the agent on a small task, open two changed files, stage one, discard the other, and confirm the staging panel and tree agree.

**Acceptance Scenarios**:

1. **Given** the agent changed files, **When** the user opens the files tab, **Then** changed files are marked in the tree and selecting one shows the file or its diff, with the selection in the URL (`?file=`).
2. **Given** a file is selected, **When** the user stages or discards the change, **Then** the row and the staging panel update at once and the result shows inline; discard is two-step with `UndoBar`.
3. **Given** a file is very large, **When** it is selected, **Then** an inline warning offers "Open anyway" or "Stay" instead of a dialog.
4. **Given** the user edits a file, **When** they save, **Then** the save control shows saving then "Saved" and the file is staged.

---

### User Story 3 - Configure the agent and prompts (Priority: P2)

A user edits the agent prompt, and adjusts agent configuration (model, limits, tools) before a run.

**Why this priority**: Needed to steer the agent, but changed less often than running it.

**Independent Test**: Change the configuration, start a run, and confirm the run used it; reload and confirm the configuration persists.

**Acceptance Scenarios**:

1. **Given** the user opens configuration, **When** the panel opens, **Then** it is an inspector section (not a modal) and each setting saves with an inline saved state.
2. **Given** an invalid value, **When** the user saves, **Then** the field shows the error and the previous valid value stays in force.
3. **Given** a run is active, **When** the user opens configuration, **Then** the panel shows it as read-only for the running session.

---

### User Story 4 - Commit history and file operations (Priority: P2)

A user views commit history, creates a file or folder, renames and deletes files through the agent workspace, using the same tree behavior as the Repository page.

**Why this priority**: File operations and history complete the workspace, and they reuse the shared components from the Repository rewrite.

**Independent Test**: Create a file, rename it, delete it with undo, and open a commit from history.

**Acceptance Scenarios**:

1. **Given** the files tab, **When** the user creates or renames, **Then** the name is entered inline in the tree, exactly as on the Repository page.
2. **Given** a delete, **When** confirmed on the button, **Then** it is staged for deletion and `UndoBar` offers "Undo".
3. **Given** commit history, **When** the user selects a commit, **Then** its files and diff open in the inspector.

---

### User Story 5 - Inspect raw agent logs (Priority: P3)

A user opens the raw LLM logs and the log viewer to debug a run.

**Why this priority**: A debugging tool, used rarely.

**Independent Test**: Open the logs for a finished run and filter them.

**Acceptance Scenarios**:

1. **Given** a run, **When** the user opens logs, **Then** they open in the inspector or a URL tab and survive reload.
2. **Given** a long log, **When** the user scrolls, **Then** it stays responsive (virtualised) and can be filtered.

---

### Edge Cases

- The agent runs and the user leaves the page: the run continues, `StatusPill` shows it, and returning restores the view.
- Two users start a run on the same repository: the second sees an inline notice that a run is active and cannot start one.
- The agent edits a file the user has open with unsaved edits: the editor shows an inline "changed by the agent" notice with reload or keep.
- Prime repository unavailable (deleted, token expired): the banner explains and links to the fix; existing session data stays readable.
- Aborting during a file write: staged state reflects only completed writes.
- Share-token access: read-only view of sessions, files and logs; run, stage and edit are hidden.
- Very long sessions (thousands of messages or log lines): lists are virtualised.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The agent session (`?session=`), the selected file (`?file=`), and the desktop tab and mobile tab MUST live in the URL through `useUrlState`, replacing the two separate keys (`tab`, `mobileTab`) with one `tab` key that the layout maps per viewport, and restore on reload and back/forward without remounting the layout.
- **FR-002**: The page MUST NOT call `toast` for actions with a place on screen; run, stop, save, stage, discard, create, rename, delete, configuration and commit MUST report pending, done and failed on the control, the tree row, the panel or the inspector. A toast is allowed only for events with no place on screen.
- **FR-003**: The page MUST NOT open modal dialogs. Configuration, commit details, log viewers, the large-file warning and create/rename MUST use the shell `Inspector`, inline warnings or inline tree edits; delete and discard use two-step confirmation and `UndoBar`.
- **FR-004**: Agent sessions, messages, progress, files, staged changes and commit history MUST be read and written through TanStack Query with keyed queries and mutations; realtime updates the cache. Direct function calls in the page (about 11) MUST move into hooks.
- **FR-005**: Agent runs MUST register with `useLongTask`, and the primary action MUST switch between "Run agent" and "Stop agent" (live primary action store), with a disabled reason when no Prime repository exists.
- **FR-006**: The file tree, code editor, create-file and rename pieces MUST be the shared components delivered by the Repository rewrite (010); Build MUST NOT keep its own copies.
- **FR-007**: Agent behavior, endpoints, staging semantics, the file buffer, and the raw log contents MUST be unchanged (PR-10 list); no API or schema change.
- **FR-008**: Resizable desktop panels MUST keep their sizes as a per-viewer preference (`useUiPrefs`), and panels MUST collapse into the URL tab model on phones.
- **FR-009**: Only design-system tokens MUST be used; PR-10 MUST pass at 1440 and 390 with axe, no new violation types.
- **FR-010**: No file in the Build feature MUST exceed 400 lines.

### Compatibility & Operational Requirements *(mandatory for brownfield changes)*

- **CR-001**: Affected contracts: `/p/:id/v/current/build/agent` query keys (`tab`, `session`, `file`, `t`; the legacy `mobileTab` is read once and rewritten to `tab`), agent session, message and log tables, the agent run and abort functions, staging and commit functions, realtime channels. No change to any endpoint or table.
- **CR-002**: The legacy `mobileTab` key stays readable for one release so saved links keep working.
- **CR-003**: Security impact: running the agent writes to the repository through staging; write access checks stay server-side and unchanged. Prompts and raw logs may contain secrets and stay limited to users with project access; nothing is written to URLs beyond ids.
- **CR-004**: Verification: unit tests, PR-10 at 1440 and 390 with axe, new E2E for reload mid-run, stop, stage and discard with undo; an agent run verified end to end on staging.

### Key Entities

- **Agent session**: one run with prompt, configuration, status, progress, start and end times.
- **Agent message**: prompt, response, tool call or system entry inside a session.
- **Workspace file**: a file in the Prime repository as seen by the agent, with changed and staged markers.
- **Staged change**: as in the Repository spec (010).
- **Agent configuration**: model, limits and tools used for runs.
- **Raw log entry**: a recorded LLM request or response for debugging.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Reload during a run reopens the same run with live progress in 100% of tested cases.
- **SC-002**: `toast` calls in the page and `components/build/` drop from 83 (22 in the page, 61 in components) to at most 5.
- **SC-003**: Modal dialogs drop from about 4 to 0.
- **SC-004**: Direct function calls in page files drop from about 11 to 0.
- **SC-005**: Duplicate file-tree, editor, create and rename code between Build and Repository drops to 0 files.
- **SC-006**: PR-10 passes at 1440 and 390, no file in the feature exceeds 400 lines.

## Assumptions

- The restyled page (T048) is the behavior baseline.
- The Repository rewrite (010) lands first and exports the shared file components.
- Agent execution stays server-side; the page is a client for it.
- `StatusCenter` already lists agent sessions from realtime (as in the design system).
- Phase R starts after cutover (T073).
