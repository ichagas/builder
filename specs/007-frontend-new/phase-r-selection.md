# Phase R selection (T170)

Applies research **D-14** to the restyled pages on `wp/P5` (measured after the restyle, so line counts differ slightly from the pre-cutover numbers in D-14).

> A page moves to a full rewrite only if at least two apply: (1) > 800 lines; (2) > 10 dialogs; (3) > 20 toast calls; (4) state lost on reload that users complain about; (5) unusable at 390px after restyling.

## How each criterion was measured

| Criterion | Method | Caveat |
|---|---|---|
| 1 Lines | `wc -l` of `src/pages/project/<Page>.tsx` | Child components are not counted |
| 2 Dialogs | Same method as D-14: count of `Dialog` token references in the page file (imports, tags, state), then the real number of distinct dialog surfaces | Token references overstate. The real surfaces are given in brackets. On the strict reading (> 10 surfaces) no page passes; only Artifacts comes close |
| 3 Toasts | `toast` references in the page file (sonner `toast.*(` or `use-toast`), plus the total in the tool's own `components/<tool>/` folder | The page-file number is the D-14 criterion; the component number shows real weight |
| 4 State lost on reload | Selection, panel or view state held in `useState` with no `useUrlState`; a bare `tab` in the URL counts as partial | No user complaint is on record (no issue tracker evidence). The criterion is therefore met mechanically, not by complaint |
| 5 Unusable at 390px | PR rows at 390 and axe, from `progress.md` | Every candidate passed its PR row at 390 after the restyle, so no page meets this. Canvas and Chat needed page-local sheets to get there (workarounds, not rewrites) |

## Scoring

| Page | Lines (C1) | Dialog refs [surfaces] (C2) | Toasts page / tool components (C3) | Reload state (C4) | 390px (C5) | Criteria met |
|---|---|---|---|---|---|---|
| Canvas | 1,871 yes | 20 yes [~4: clear-canvas alert, AI Architect, Infographic, agent-prompt edit] | 38 / 54 yes | yes: selected node and edge, active layer, panel and detent, lasso and isolate mode are `useState` (0 `useUrlState`) | no (PR-08 green; page-local `CanvasMobileSheet` workaround) | **4 of 5** |
| Repository | 1,272 yes | 21 yes [~8 dialog components: create repo, create file, rename, sync, IDE, PAT, content search, GitHub connect] | 32 / 20 yes | partial: `tab` in the URL, but selected repo, file and staged state are not | no (PR-11 green) | **4 of 5** |
| Build | 1,182 yes | 41 yes [~4: large-file alert, create file, rename, agent configuration] | 22 / 61 yes | partial: `tab` and `mobileTab` in the URL, selected file and session are not | no (PR-10 green) | **4 of 5** |
| Artifacts | 1,339 yes | 54 yes [~9: edit, preview, delete alert, add, create folder, move, visual recognition, enhance image, collaborator] | 7 / 36 no on the page, yes with components | yes: folder, view mode, search, opened artifact are `useState` | no (PR-06 green, 0 axe violations) | **3 of 5** (4 counting component toasts) |
| Chat | 1,197 yes | 13 yes [3: summary dialog, project selector, sessions sheet] | 23 / 0 yes | yes: `selectedSessionId` is `useState`, so a reload drops the open conversation | no (PR-07 green; sessions sidebar became a Sheet) | **3 of 5** |

Other project pages measured for completeness, none in the D-14 candidate list:

| Page | Lines | Dialog refs | Toasts | Reload state | Criteria met |
|---|---|---|---|---|---|
| Specifications | 1,308 | 1 | 25 | partial | 2 (lines, toasts) |
| Present | 1,341 | 17 | 16 | tab in URL | 2 (lines, dialogs by refs) |
| Audit | 1,094 | 0 | 22 | tab in URL | 2 (lines, toasts) |
| Requirements, Standards, Database, Deploy, Change, Versions, Settings | 154 to 597 | 0 | 0 to 6 | | 0 |

## Other evidence

- Every candidate talks to the API directly (`fetch`, `functions.invoke`, `supabase.from`) with `useState` for results. Only Chat and Artifacts use `useQuery`, and only for the project header, requirements, canvas nodes and artifact lists. Repository has ~25 direct calls, Build ~11.
- Known carried legacy bugs sit in Chat (sidebar toggle had no aria-label, fixed in D4) and none in the other four. Restyle workarounds are recorded for Canvas (page-local mobile sheet) and Build (two URL tab keys, `tab` and `mobileTab`, to work around the resizable panels).
- Repository and Build share `CodeEditor`, `CreateFileDialog`, `RenameDialog`, the file tree and the staging model. A rewrite of one shapes the other.
- Usage: Canvas, Repository and Build are the core of the Design and Build phases; Chat and Artifacts are the Define entry points and are used first in every project.
- Cost: `plan.md` budgets 3 to 5 agent-days each.

## Decision

All five candidates qualify (each meets at least three of five). The three unlisted pages that also meet two criteria (Specifications, Present, Audit) **wait**.

Order, with the reasons for it:

| Order | Page | Spec | Why here |
|---|---|---|---|
| 1 | Chat | `specs/008-rewrite-chat/` | Smallest surface and least shared code (no tool components). It is where a reload loses the most obvious thing (the open conversation), and the summary dialog and 23 toasts have clear inline homes. It proves the patterns (URL id, TanStack Query for sessions and messages, `ActionButton` for save/summary, Inspector for the summary) at the lowest risk |
| 2 | Artifacts | `specs/009-rewrite-artifacts/` | Highest dialog count (nine surfaces) and used at the start of every project. Its dialogs become one Inspector, which is the strongest test of the "inspector instead of dialogs" goal. Reuses the Chat patterns |
| 3 | Repository | `specs/010-rewrite-repository/` | Most direct API calls and toasts; the file tree, editor and create/rename dialogs it rewrites are the shared parts Build needs |
| 4 | Build | `specs/011-rewrite-build/` | Consumes the shared file tree, editor and staging model from Repository. Agent runs already fit `StatusCenter` |
| 5 | Canvas | `specs/012-rewrite-canvas/` | Highest score but highest risk: React Flow, realtime, 22 tool components and the heaviest interaction model. Goes last so the inspector and inline-feedback patterns are settled. It is also the only page with a mobile workaround, so the payoff is real, but nothing is broken today |

Waiting (no spec yet, revisit after the five ship):

- **Specifications** (2 criteria): a single generation flow that already uses `useLongTask`; its toasts are mostly generation results that move to `StatusCenter` cheaply, with no dialogs.
- **Present** (2 criteria): 17 dialog refs are mostly the slide editor's own controls, the tab is already in the URL, and no reload complaint exists.
- **Audit** (2 criteria): the tab is in the URL and runs go through the `useAuditPipeline` bridge; the toasts are run-lifecycle messages that `StatusCenter` already covers.
- Everything under 600 lines meets no criterion.

Each rewrite is an independent feature with its own spec, plan and tasks, shipped behind the existing route so the restyle regression row (PR-xx) stays the acceptance baseline. Phase R starts only after cutover (T073 onward) and is optional per page: dropping a page from the list needs no change to the others except the Repository to Build dependency noted above.
