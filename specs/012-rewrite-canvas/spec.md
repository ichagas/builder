# Feature Specification: Rewrite the Canvas page (Phase R)

**Feature Branch**: `012-rewrite-canvas`  
**Created**: 2026-09-29  
**Status**: Draft  
**Input**: User description: "Rewrite the project Canvas page (`app/frontend-new/src/pages/project/Canvas.tsx`, route `/p/:id/v/current/design/canvas`) with inline feedback instead of toasts, one inspector instead of dialogs and the page-local mobile sheet, selection, layer and view held in the URL, and TanStack Query for data. Selected in `specs/007-frontend-new/phase-r-selection.md` (order 5 of 5)."

**Related**: `specs/007-frontend-new/contracts/design-system.md`, `contracts/routes.md` (PR-08), `contracts/api.md` (reused unchanged), and the patterns settled in `specs/008-rewrite-chat/`.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Draw and edit the architecture, with selection and layer in the URL (Priority: P1)

A user places nodes from the palette, connects them with edges, adds zones, notes and labels, moves and deletes them, uses lasso, and edits a selected node or edge in a properties panel. Reload or a shared link returns to the same selection, layer and viewport.

**Why this priority**: Drawing is the page's core, and selected node, edge, active layer and view are lost on reload today.

**Independent Test**: Add two nodes and an edge, select the edge, switch to layer 2, reload, and confirm selection, layer and (rounded) viewport are restored; open the URL in a new tab.

**Acceptance Scenarios**:

1. **Given** a node is selected, **When** the user reloads, **Then** the same node is selected and its properties show in the inspector.
2. **Given** the URL holds `?layer=<id>`, **When** the page loads, **Then** that layer is active and the layer manager shows it highlighted.
3. **Given** a URL that names a node that no longer exists, **When** it is opened, **Then** an inline notice explains it and the URL drops the selection.
4. **Given** the user edits node properties in the inspector, **When** the value changes, **Then** the canvas updates at once and the field shows a saved state; a failed save shows the error on the field and reverts the node.
5. **Given** the user moves nodes with lasso, copy and paste, or delete, **When** the action completes, **Then** it is undoable through `UndoBar` for delete and through the canvas undo for moves.
6. **Given** a 390px viewport, **When** the user opens palette or properties, **Then** the shell `Inspector` opens as a bottom sheet with peek, half and full detents (replacing the page-local `CanvasMobileSheet`).

---

### User Story 2 - Generate and improve the design with AI (Priority: P1)

A user asks the AI Architect to generate or extend the design, runs the critic, and runs iterative enhancement, then keeps or discards the result.

**Why this priority**: "AI Architect" is the page's primary action and the fastest way to a first design.

**Independent Test**: Run AI Architect from a prompt, watch progress, keep the result, and confirm the nodes and edges are saved and the run shows in `StatusPill`.

**Acceptance Scenarios**:

1. **Given** the user chooses "AI Architect", **When** the panel opens, **Then** it opens in the inspector (not a dialog), keeps its prompt and options, and shows progress and the proposed changes.
2. **Given** a proposal is ready, **When** the user reviews it, **Then** added and changed nodes are highlighted on the canvas, and "Keep" or "Discard" applies or drops it; keeping is undoable.
3. **Given** the run fails, **When** it stops, **Then** the inspector shows the reason and "Retry" and the canvas is unchanged.
4. **Given** a run is active, **When** the user leaves the page, **Then** it continues and `StatusPill` shows it.

---

### User Story 3 - Organise with layers, node types and views (Priority: P2)

A user manages layers (create, rename, hide, isolate), filters visible node types, and uses zoom, fit and the mini-map.

**Why this priority**: Needed for large diagrams, and its state is part of what should survive a reload.

**Independent Test**: Create a layer, isolate it, hide one node type, reload, and confirm the same visible set.

**Acceptance Scenarios**:

1. **Given** layers exist, **When** the user isolates one, **Then** other layers dim and `?isolate=1` is set in the URL.
2. **Given** node-type filters are set, **When** the user reloads, **Then** the same types are visible (`?types=`), and the filter chips show counts.
3. **Given** the user clears the canvas, **When** they use the two-step confirm on the button, **Then** all nodes leave and `UndoBar` offers "Undo" for 7 seconds.

---

### User Story 4 - Review changes, infographic and agent flow (Priority: P3)

A user opens the change heatmap and change log, generates an infographic of the design, and views the agent flow and blackboard.

**Why this priority**: Read-mostly views that sit on top of the drawing and are in PR-08 but not needed to draw.

**Independent Test**: Open each view and confirm it reloads to the same view and shows realtime changes from a second browser.

**Acceptance Scenarios**:

1. **Given** the user opens the heatmap, change log or agent flow, **When** the view opens, **Then** it is a URL view (`?panel=heatmap|changes|flow`) in the inspector or a side panel and survives reload.
2. **Given** the user generates an infographic, **When** it runs, **Then** progress and the result show in the inspector with "Download" and "Save as artifact", and no dialog opens.
3. **Given** two browsers open the same canvas, **When** one adds a node, **Then** the other sees it through the existing realtime layer.

---

### Edge Cases

- Realtime update to the node the user is editing: the inspector shows an inline "changed by <user>" notice with reload or keep.
- A canvas with 500+ nodes: viewport culling stays on, the inspector opens without a layout jump, and interactions stay responsive.
- Deleting a node that has edges: edges are removed with it, and undo restores both.
- Pasting nodes with clipboard data from another project: rejected inline with the reason.
- Share-token access: read-only canvas, palette and property editing hidden, pan and zoom kept.
- Touch use: lasso and multi-select have touch equivalents, and drag targets are at least 44px on phones.
- The node type list fails to load: an inline banner offers "Retry", and existing nodes render with a generic style.
- An AI run finishes after the user changed the canvas: the proposal is rebased or flagged as conflicting inline before it is kept.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Selected node (`?node=`), selected edge (`?edge=`), active layer (`?layer=`), isolate mode (`?isolate=`), visible node types (`?types=`), open panel (`?panel=`) and viewport (`?vp=x,y,z`, rounded and debounced) MUST live in the URL through `useUrlState`, and restore on reload and back/forward without remounting the layout.
- **FR-002**: The page MUST NOT call `toast` for actions with a place on screen; node and edge edits, delete, paste, clear, layer changes, AI runs, enhancement, infographic and save results MUST report on the field, the node, the panel or the inspector. A toast is allowed only for events with no place on screen.
- **FR-003**: The page MUST NOT open modal dialogs. Node and edge properties, AI Architect, infographic, agent-prompt editing, layers and change views MUST use the shell `Inspector`, and the page-local `CanvasMobileSheet` MUST be removed. Clear canvas uses two-step confirmation plus `UndoBar`.
- **FR-004**: Nodes, edges, layers, node types, change log and project data MUST be read and written through TanStack Query with keyed queries and mutations; realtime updates (`useRealtimeCanvas`, `useRealtimeLayers`) apply to the cache. Optimistic updates MUST be used for moves and property edits, with rollback on failure.
- **FR-005**: AI Architect, critic, iterative enhancement and infographic runs MUST register with `useLongTask`, and the primary action MUST stay "AI Architect".
- **FR-006**: Saved data (node and edge shape, layers, zones, notes, labels, node type definitions) MUST stay unchanged so existing canvases open and save identically; no API or schema change.
- **FR-007**: Copy, paste, lasso, isolate, delete, undo and keyboard shortcuts MUST keep working with the same shortcuts, and touch alternatives MUST exist for each.
- **FR-008**: Full-bleed layout MUST be kept (no page padding), and the canvas MUST keep viewport culling for large graphs.
- **FR-009**: Only design-system tokens MUST be used (including node and mini-map colors via tokens); PR-08 MUST pass at 1440 and 390 with axe, no new violation types.
- **FR-010**: No file in the Canvas feature MUST exceed 400 lines; the page MUST compose canvas, palette, inspector content and toolbar components.

### Compatibility & Operational Requirements *(mandatory for brownfield changes)*

- **CR-001**: Affected contracts: `/p/:id/v/current/design/canvas` query keys (`node`, `edge`, `layer`, `isolate`, `types`, `panel`, `vp`, `t`), canvas node, edge, layer and node type tables, the AI Architect, critic, enhancement and infographic functions, realtime channels. No change to any of them.
- **CR-002**: No breaking change. Links without query keys open the default layer at fit-to-view, as today.
- **CR-003**: No new privileged action. Editing and AI runs stay limited to users with write access; the share token stays read-only. AI prompts use the existing authorization and rate limits.
- **CR-004**: Verification: unit tests for hooks and serialisation of URL state, PR-08 at 1440 and 390 with axe, new E2E for URL restore, undo delete and two-browser realtime; a 500-node performance check; staging smoke test after deploy.

### Key Entities

- **Canvas node**: a typed element with position, size, label, properties, layer and links.
- **Canvas edge**: a connection between two nodes with style and label.
- **Layer**: a named grouping with visibility and order.
- **Node type**: definition (icon, colors, properties) used by the palette.
- **Zone, note, label**: annotation elements that are not architecture nodes.
- **AI proposal**: a set of added and changed nodes and edges awaiting keep or discard.
- **Change log entry**: a recorded change used by the heatmap and log.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Reload restores selection, layer, isolate mode, type filter, open panel and viewport in 100% of tested cases (today 0 of 6).
- **SC-002**: `toast` calls in the page and `components/canvas/` drop from 92 (38 in the page, 54 in components) to at most 8.
- **SC-003**: Modal dialogs drop from about 4 to 0, and the page-local mobile sheet is deleted.
- **SC-004**: A 500-node canvas keeps pan and drag at 30 frames per second or better on the reference laptop, equal to or better than today.
- **SC-005**: PR-08 passes at 1440 and 390 with no new axe types, and no file in the feature exceeds 400 lines.
- **SC-006**: A property edit shows its new value on the canvas within 100 ms (optimistic) and rolls back visibly within 3 seconds when the save fails.

## Assumptions

- The restyled page (T046) is the behavior baseline.
- React Flow stays as the diagram engine.
- The `Inspector` supports being opened from a URL key and holds long forms (node properties) in the same way at desktop and phone detents.
- Chat (008) has settled the streaming, long-task and undo patterns.
- Phase R starts after cutover (T073).
