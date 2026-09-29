# Feature Specification: Rewrite the Repository page (Phase R)

**Feature Branch**: `010-rewrite-repository`  
**Created**: 2026-09-29  
**Status**: Draft  
**Input**: User description: "Rewrite the project Repository page (`app/frontend-new/src/pages/project/Repository.tsx`, route `/p/:id/v/current/build/repository`) with inline feedback instead of toasts, an inspector instead of dialogs, repository, file and tab held in the URL, and TanStack Query for data. Selected in `specs/007-frontend-new/phase-r-selection.md` (order 3 of 5). Also settles the shared file tree, editor and create/rename pieces that `specs/011-rewrite-build/` reuses."

**Related**: `specs/007-frontend-new/contracts/design-system.md`, `contracts/routes.md` (PR-11), `contracts/api.md` (reused unchanged), `specs/008-rewrite-chat/`.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Open a repository and edit a file, with both in the URL (Priority: P1)

A user picks a repository, browses its file tree (with search and a context menu), opens a file in the code editor, edits it and saves it to staging. Reload or a shared link returns to the same repository and file.

**Why this priority**: Browsing and editing files is the page's core; today only the tab is in the URL, so the repository and file are lost on reload.

**Independent Test**: Open repo B, file `src/app.ts`, edit and save, reload, and confirm repo, file and the staged marker are restored; open the URL in a new tab.

**Acceptance Scenarios**:

1. **Given** a repository and a file are open, **When** the user reloads, **Then** the same repository, file and (if set) line are shown.
2. **Given** a file has unsaved edits, **When** the user opens another file, **Then** an inline prompt in the editor header offers "Save", "Discard" or "Stay", not a dialog.
3. **Given** the user saves a file, **When** the save finishes, **Then** the file shows a staged marker in the tree and the editor header, and no toast appears.
4. **Given** a URL names a file that no longer exists, **When** it is opened, **Then** an inline notice replaces the editor and the tree stays usable.
5. **Given** a 390px viewport, **When** the user switches between tree and editor, **Then** the switch is a URL tab and the tab bar keeps 44px targets.

---

### User Story 2 - Connect or create repositories (Priority: P1)

A user creates an empty repository, creates one from a template, links an existing one, or clones a public one, and sets the Prime repository.

**Why this priority**: Without a repository nothing else on the page works, and these flows are five separate functions plus a dialog today.

**Independent Test**: Run each of the four connect flows against the test GitHub connection, and confirm progress and outcome show in the repository list.

**Acceptance Scenarios**:

1. **Given** no repositories, **When** the user opens the page, **Then** an empty state shows "Add repository" as the primary action and the GitHub connect banner if GitHub is not connected.
2. **Given** the user starts any of the four flows, **When** it runs, **Then** the flow opens in the inspector, its steps show progress, and the new repository appears selected in the list on success.
3. **Given** a flow fails (permission, name taken, network), **When** it stops, **Then** the inspector shows the reason and keeps the entered values.
4. **Given** several repositories, **When** the user sets one as Prime, **Then** its card shows the Prime badge and features that need a Prime repository stop showing the "set a Prime repository" inline hint.

---

### User Story 3 - Stage, commit, push and pull (Priority: P1)

A user reviews staged changes, commits them, and pushes to or pulls from GitHub, seeing the result of each step on the page.

**Why this priority**: Sync is the highest-risk action on the page (it changes the remote), so its feedback must be visible and permanent, not a toast that disappears.

**Independent Test**: Stage two changes, commit, push, then pull, and confirm each step's result stays visible in the commit log and the repository card until the next action.

**Acceptance Scenarios**:

1. **Given** staged changes, **When** the user chooses "Push", **Then** the inspector shows the files to push, uncommitted changes are flagged inline (as the current warning), and confirmation is two-step on the button.
2. **Given** a push or pull is running, **When** it runs, **Then** the repository card shows the progress and the run appears in `StatusPill`; on finish the card shows the time and result and stays that way after reload.
3. **Given** a push fails, **When** it stops, **Then** the card shows the error and "Retry", and staged changes are untouched.
4. **Given** auto-sync is on, **When** a save completes, **Then** the card shows "Syncing" then the result, with the same behavior as today.

---

### User Story 4 - Create, rename, delete, upload a ZIP and search content (Priority: P2)

A user creates files and folders, renames and deletes them from the context menu, uploads a ZIP into staging, and searches file contents.

**Why this priority**: These are the everyday tree operations in PR-11 and drive most of the current dialogs and toasts.

**Independent Test**: Create a file, rename it, delete it with undo, upload a ZIP of 50 files, and run a content search; confirm no dialogs open.

**Acceptance Scenarios**:

1. **Given** the tree, **When** the user chooses "New file" or "Rename", **Then** the name is entered inline in the tree row; a name clash shows an inline error.
2. **Given** a file or folder, **When** the user deletes it (two-step confirm), **Then** it is marked deleted in staging and `UndoBar` offers "Undo" for 7 seconds.
3. **Given** a ZIP is dropped on the tree, **When** it extracts and stages, **Then** a progress row shows the current file and count, and the result lists skipped files.
4. **Given** the search field is used with content search, **When** results return, **Then** they list in the inspector, and choosing one opens that file at that line and updates the URL.

---

### User Story 5 - Manage the GitHub token (PAT) and IDE view (Priority: P3)

A user manages the personal access token used to sync and opens a larger IDE view of the repository.

**Why this priority**: Occasional tasks that sit behind the two modals (PAT, IDE) today.

**Independent Test**: Add, replace and remove a PAT; open the IDE view and return.

**Acceptance Scenarios**:

1. **Given** the user opens PAT management, **When** the panel opens, **Then** it is an inspector section, the token is never shown after saving, and the result shows inline.
2. **Given** the user opens the IDE view, **When** it opens, **Then** it is a routed view (`?view=ide`), reloadable, and back returns to the tree.

---

### Edge Cases

- A GitHub rate limit or an expired PAT during load or sync: an inline banner names the cause and the fix, and cached tree data stays visible.
- A repository with more than 5,000 files: the tree loads lazily by folder and search remains responsive.
- A binary or very large file: the editor is replaced by an inline "cannot edit, download instead" state.
- The remote changed since the last pull when the user pushes: the push is refused and the card says "Pull first", with staged changes kept.
- Two sessions of the same user stage changes at once: the staged list is reloaded from the server via the query cache on the next focus.
- Share-token access: read-only browsing; edit, stage, commit and sync are hidden.
- Unsaved edits and the user closes the tab: the browser's native prompt is the only interruption.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The active tab, repository, file (with optional line) and IDE view MUST be part of the page address and restore on reload and back/forward without reloading the surrounding layout.
- **FR-002**: The page MUST NOT call `toast` for actions with a place on screen; create, link, clone, save, stage, delete, commit, push, pull, ZIP upload and PAT changes MUST report pending, done and failed on the control, the tree row, the repository card or the inspector. Results of push and pull MUST stay visible on the card until the next run.
- **FR-003**: The page MUST NOT open modal dialogs. The create-repository flows, sync review, content search, PAT management and the connect banner details MUST open in the shell inspector panel; create and rename MUST be inline tree edits; delete uses two-step confirmation and an undo window.
- **FR-004**: Repositories, file trees, file contents, staged changes, commit log and sync status MUST be read and written through one shared data layer, and realtime changes MUST show without a reload. The page components MUST NOT call backend functions directly.
- **FR-005**: Push, pull, clone, ZIP extraction and repository creation MUST be listed in the global status indicator while they run.
- **FR-006**: The file tree, code editor, create-file and rename pieces MUST be shared components with a documented props contract that the Build rewrite (011) imports, and both pages MUST behave identically for those interactions.
- **FR-007**: Staging semantics, commit and sync behavior, PAT storage, the Prime repository concept and every function endpoint MUST be unchanged (PR-11 list); no API or schema change.
- **FR-008**: The page MUST keep the "Uncommitted changes will not be pushed" protection as an inline, blocking-on-confirm warning, and the "set a Prime repository first" and "add a repository first" guards as inline hints.
- **FR-009**: Only design-system tokens MUST be used; PR-11 MUST pass at 1440 and 390 with axe, no new violation types.
- **FR-010**: The page MUST be split into focused parts (size limit in implementation notes).

### Compatibility & Operational Requirements *(mandatory for brownfield changes)*

- **CR-001**: Affected contracts: `/p/:id/v/current/build/repository` query keys (`tab`, `repo`, `file`, `line`, `view`, `t`), repository, staging and commit tables, the GitHub integration functions (`create-empty-repo`, `create-repo-from-template`, `link-existing-repo`, `clone-public-repo`, `staging-operations`, `sync-repo-push`, `sync-repo-pull`), PAT storage, realtime channels. No change to any of them.
- **CR-002**: No breaking change; links with only `?tab=` open the first repository (the Prime one if set) as today.
- **CR-003**: Security impact: push, pull, PAT and repository creation are privileged and external. Authorization checks stay server-side and unchanged; PATs are never rendered after entry and never appear in the URL or query cache keys; logs must not include tokens.
- **CR-004**: Verification: unit tests for hooks and components, PR-11 at 1440 and 390 with axe, new E2E for URL restore, staged save, undo delete and a failed push; push and pull verified against the test GitHub connection on staging.

### Key Entities

- **Repository**: a linked or created GitHub repository. Name, owner, branch, Prime flag, sync status, last sync time.
- **File node**: a file or folder with path, type, size, staged state.
- **Staged change**: a create, edit, rename or delete not yet committed, with its content.
- **Commit**: message, author, time, changed files.
- **Sync run**: a push or pull with direction, progress and result.
- **Access token (PAT)**: a stored credential used for sync, write-only in the UI.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Reload restores repository, file, tab and IDE view in 100% of tested cases (today: tab only).
- **SC-002**: Toast call sites in the page and its repository components drop from 52 (32 in the page, 20 in components) to at most 4.
- **SC-003**: Modal dialogs drop from about 8 to 0.
- **SC-004**: Backend calls made directly from page components drop from about 25 to 0; every one goes through the shared data layer.
- **SC-005**: A failed push leaves a visible error on the card after reload, in 100% of tested cases.
- **SC-006**: PR-11 passes at 1440 and 390 with no new axe types, and Build (011) reuses the shared tree and editor without a copy.

## Assumptions

- The restyled page (T049) is the behavior baseline.
- Monaco (`CodeEditor`) stays as the editor.
- The staged model is server-side (`staging-operations`) and stays so.
- Build (011) follows this feature and reuses its shared components; if Build is rewritten first, this spec's FR-006 moves there.
- Phase R starts after cutover (T073).

## Implementation notes (for plan)

Non-binding hints for the plan phase. They are not requirements.

- Address keys: `tab`, `repo`, `file`, `line`, `view=ide`, through `useUrlState`.
- Data: TanStack Query with keyed queries and mutations; `useRealtimeRepos` updates the cache; hooks under the feature folder replace the ~25 direct function calls.
- Shell: `Inspector`, `UndoBar`, `useLongTask`.
- Structure: no file in the feature over 400 lines; 0 direct `fetch`/`functions.invoke` in page files.
