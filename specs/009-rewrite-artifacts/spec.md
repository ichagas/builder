# Feature Specification: Rewrite the Artifacts page (Phase R)

**Feature Branch**: `009-rewrite-artifacts`  
**Created**: 2026-09-29  
**Status**: Deferred (does not meet 2 of 5 D-14 criteria under the strict reading, see `007-frontend-new/phase-r-selection.md`; spec kept for later)  
**Input**: User description: "Rewrite the project Artifacts page (`app/frontend-new/src/pages/project/Artifacts.tsx`, route `/p/:id/v/current/define/artifacts`) with inline feedback instead of toasts, one inspector instead of nine dialogs, folder, view and opened artifact held in the URL, and TanStack Query for data. Selected in `specs/007-frontend-new/phase-r-selection.md` (scored 1 of 5 on the strict D-14 reading, so deferred)."

**Related**: `specs/007-frontend-new/contracts/design-system.md`, `contracts/routes.md` (PR-06), `contracts/api.md` (reused unchanged). Follows the patterns settled in `specs/008-rewrite-chat/`.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Browse, find and open artifacts, with the view in the URL (Priority: P1)

A user browses the folder tree, searches, switches between cards, table, gallery and tree views, and opens an artifact to read it. Reloading or sharing the URL returns to the same folder, view, filter and opened artifact.

**Why this priority**: Browsing is the page's main use, and folder, view mode, search and the opened artifact are all lost on reload today.

**Independent Test**: Select a folder, set table view, search "spec", open an artifact, reload, and confirm all four are restored; open the URL in a new tab.

**Acceptance Scenarios**:

1. **Given** a folder is selected and a view mode is chosen, **When** the user reloads, **Then** the same folder and view are shown.
2. **Given** an artifact is opened, **When** the URL is copied to a new tab, **Then** the artifact opens in the inspector with its content and viewer (text, PDF, DOCX, PPTX, XLSX, image).
3. **Given** the search box has text and a provenance filter is set, **When** the user reloads, **Then** both are restored and `FilterChips` show counts.
4. **Given** the URL names an artifact that does not exist or was deleted, **When** it is opened, **Then** an inline notice explains it and the URL is cleaned.
5. **Given** a 390px viewport, **When** the user opens the folder tree, **Then** it opens as a sheet with 44px touch targets and every toolbar icon has an accessible name.

---

### User Story 2 - Add artifacts by upload, drop, paste or import (Priority: P1)

A user adds artifacts through the universal upload and drop zone, text entry, visual-recognition import or AI-enhanced images, and sees progress for each item on the page.

**Why this priority**: Adding artifacts is the page's primary action ("Add artifact") and feeds every later phase.

**Independent Test**: Upload three files at once, one failing, and confirm three rows show pending, done and failed states, and the failed row offers retry.

**Acceptance Scenarios**:

1. **Given** the user chooses "Add artifact", **When** the add panel opens, **Then** it opens in the inspector (not a modal), keeps the drop zone, and closes to leave the list intact.
2. **Given** several files are dropped, **When** they upload, **Then** each shows its own progress row in the list, with done or failed and retry.
3. **Given** the user runs visual recognition or image enhancement on an image, **When** it runs, **Then** its progress and result (import, discard) show in the inspector, and the long task appears in `StatusPill`.
4. **Given** the upload finishes, **When** the list refreshes, **Then** the new artifacts appear without a manual refresh, in the current folder.

---

### User Story 3 - Edit, rename, move, clone, download and delete (Priority: P2)

A user edits an artifact's text (raw or markdown), renames it, moves it between folders, clones or downloads it, and deletes it with undo.

**Why this priority**: These are the maintenance actions in PR-06; they replace the edit, move, create-folder and delete dialogs.

**Independent Test**: Rename, move, clone and delete an artifact; confirm each result on its row with no toast, and that delete can be undone.

**Acceptance Scenarios**:

1. **Given** an artifact is open, **When** the user edits the text and saves, **Then** the save control shows saving then "Saved", and unsaved edits block navigation with an inline prompt, not a dialog.
2. **Given** an artifact, **When** the user moves it, **Then** the folder picker is a section of the inspector, and the row shows the new folder on success.
3. **Given** the user deletes an artifact (two-step confirm), **When** it is removed, **Then** `UndoBar` offers "Undo" for 7 seconds and undo restores the artifact and its content.
4. **Given** the user creates a folder, **When** they confirm the name inline in the tree, **Then** the folder appears selected; a duplicate name shows an inline error.
5. **Given** an artifact, **When** the user chooses download, **Then** the button shows preparing then done, with the same file formats as today.

---

### User Story 4 - Summarize with AI and collaborate on an artifact (Priority: P3)

A user asks for an AI summary of an artifact, and opens the collaboration editor (shared editing, chat, timeline, heatmap) for it.

**Why this priority**: Both are in PR-06 but less frequent, and the collaboration surface is the largest piece to move, so it can land last.

**Independent Test**: Summarize an artifact and confirm the summary streams into the inspector; open collaboration and confirm two sessions see each other's edits.

**Acceptance Scenarios**:

1. **Given** an artifact, **When** the user summarizes it, **Then** the summary streams in the inspector, is stored, and reopening shows the stored text.
2. **Given** an artifact, **When** the user opens collaboration, **Then** it opens as a full-width view addressed by the URL (`?artifact=<id>&mode=collab`) instead of a nearly full-screen modal.
3. **Given** collaboration is open in two browsers, **When** one edits, **Then** the other sees the edit through the existing realtime layer.

---

### Edge Cases

- Deleting a folder that contains artifacts: inline confirmation lists the count, and contents move to the parent or are deleted according to today's behavior (kept unchanged).
- A very large file or a viewer that fails to render (corrupt PDF, DOCX): the inspector shows an inline error with download as fallback.
- Upload of an unsupported type or a file over the size limit: rejected on the row with the reason, without blocking the others.
- Two users edit the same artifact outside collaboration mode: last save wins as today; the saving user gets an inline "changed since you opened it" notice when the stored version differs.
- Share-token access: read-only artifacts hide edit, move and delete, and the token stays in the URL.
- Realtime insert while a filter is set: the new artifact appears only if it matches the filter, and the count updates.
- Zero artifacts: an empty state whose primary action is "Add artifact".

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Selected folder (`?folder=`), view mode (`?view=cards|table|gallery|tree`), search (`?q=`), provenance filter (`?f=`), sort (`?sort=`) and opened artifact (`?artifact=`, plus `mode=edit|collab`) MUST live in the URL through `useUrlState`, and the page MUST restore them on reload and back/forward without remounting the layout.
- **FR-002**: The page MUST NOT call `toast` for actions that have a place on screen; upload, save, move, rename, clone, download, summarize, enhance and import MUST report pending, done and failed on the row, the control or the inspector. A toast is allowed only for events with no place on screen.
- **FR-003**: The page MUST NOT open modal dialogs. Add, edit, preview, move, create-folder, visual recognition, enhance image and summary MUST use the shell `Inspector` (or an inline tree row for create-folder). Delete uses two-step confirmation and `UndoBar`. The collaboration editor MUST be a routed view, not a dialog.
- **FR-004**: Artifacts, folders, artifact content and the project header MUST be read and written through TanStack Query with keyed queries and mutations; realtime events (`useRealtimeArtifacts`) update the cache. Content for large artifacts MUST load lazily when the artifact is opened.
- **FR-005**: Long operations (uploads, summarize, enhance, recognition) MUST register with `useLongTask`.
- **FR-006**: The primary action MUST stay "Add artifact", and every icon-only control MUST have an accessible name at every viewport.
- **FR-007**: All artifact types, viewers and export formats listed under PR-06 MUST keep working with the same stored data and file formats; no schema or API change.
- **FR-008**: The page MUST respect share-token access (read-only, token kept in the URL).
- **FR-009**: Only design-system tokens MUST be used, and the page MUST pass PR-06 at 1440 and 390 with axe at zero violations (the restyled baseline is zero).
- **FR-010**: No file in the Artifacts feature MUST exceed 400 lines; the page file MUST be a composition of list, tree, toolbar and inspector components.

### Compatibility & Operational Requirements *(mandatory for brownfield changes)*

- **CR-001**: Affected contracts: `/p/:id/v/current/define/artifacts` query keys (`folder`, `view`, `q`, `f`, `sort`, `artifact`, `mode`, `t`), the artifacts and folders tables, storage for binary files, realtime channels, the summarize, enhance and recognition function endpoints. No API or schema change. Legacy redirects keep working.
- **CR-002**: No breaking change. Links without query keys open the root folder in the last-used view (stored as a per-viewer preference in `useUiPrefs`).
- **CR-003**: No new privileged action. Edit, move, delete and collaboration remain limited to users with write access; the share token stays read-only.
- **CR-004**: Verification: component and hook unit tests, PR-06 at 1440 and 390 with axe, new E2E for URL restore, batch upload with a failure, and undo delete; collaboration checked with two browser contexts; staging smoke test after deploy.

### Key Entities

- **Artifact**: a project document or file. Title, type, content or file reference, folder, provenance, created/updated, summary.
- **Folder**: hierarchical container with a parent and a name.
- **Provenance**: where the artifact came from (upload, chat, canvas, import, enhancement), used for filtering.
- **Upload item**: a pending or finished upload with progress and error state.
- **Collaboration session**: shared editing state, chat, timeline and heatmap for one artifact.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Reload restores folder, view, search, filter, sort and opened artifact in 100% of tested cases (today 0 of 6).
- **SC-002**: Toast calls in the page and `components/artifacts/` drop from 43 (7 in the page, 36 in components) to at most 3.
- **SC-003**: Modal dialogs drop from about 9 to 0; the collaboration editor is a route.
- **SC-004**: A batch of 10 uploads, 2 failing, shows 10 individual outcomes on screen and needs no toast to be understood.
- **SC-005**: PR-06 passes at 1440 and 390 with 0 axe violations, no file in the feature exceeds 400 lines.
- **SC-006**: Opening a text artifact from the URL shows content within 1 second on the staging stack with a warm cache.

## Assumptions

- The restyled page (T044) is the behavior baseline.
- The `Inspector` component supports stacked sections (viewer, actions, move) and can be opened from a URL key.
- The collaboration components in `components/collaboration/` are reused as is inside the routed view.
- Chat's rewrite (008) has settled the streaming helper, `useLongTask` registration and the undo pattern; this spec reuses them.
- Phase R starts after cutover (T073).
