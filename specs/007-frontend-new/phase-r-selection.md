# Phase R selection (T170)

Applies research **D-14** to the restyled pages on `wp/P5` (measured after the restyle, so line counts differ slightly from the pre-cutover numbers in D-14).

> A page moves to a full rewrite only if at least two apply: (1) > 800 lines; (2) > 10 dialogs; (3) > 20 toast calls; (4) state lost on reload that users complain about; (5) unusable at 390px after restyling.

## How each criterion was measured

Scored by the literal text of D-14, with no partial credit.

| Criterion | Method | Caveat |
|---|---|---|
| 1 Lines (> 800) | `wc -l` of `src/pages/project/<Page>.tsx`, measured on the current branch | Child components are not counted |
| 2 Dialogs (> 10) | The number of distinct dialog surfaces (dialogs, alert dialogs, sheets used as dialogs) the page opens. The count of `Dialog` token references in the file is shown for comparison only | D-14's own example ("25 dialog refs" for Artifacts) counted tokens, which overstate: imports, tags and state each count. "> 10 dialogs" is read as dialogs, so surfaces decide |
| 3 Toasts (> 20) | `toast` references in the page file (sonner `toast.*(` or `use-toast`). The tool's own `components/<tool>/` total is shown for context and does not score | D-14 names toast counts of the page file (Canvas 38, Repository 32, Build 22, Chat 23) |
| 4 State lost on reload, with user complaints | Needs a user complaint on record. None is (no issue tracker or feedback evidence was found) | Mechanically lost state (see the "Reload state" column) is context, not a hit. **Marked "no evidence" and not met for every page** |
| 5 Unusable at 390px after restyle | PR rows at 390 and axe, from `progress.md` | Every candidate passed its PR row. Canvas and Chat needed page-local sheets (workarounds, not rewrites) |

## Scoring

| Page | Lines (C1) | Dialog surfaces [token refs] (C2) | Toasts, page file / tool components (C3) | Reload state (context only) | C4 | C5 | Criteria met |
|---|---|---|---|---|---|---|---|
| Canvas | 1,939 yes | no: ~4 [31] (clear-canvas alert, AI Architect, Infographic, agent-prompt edit) | 38 yes / 54 | selected node and edge, layer, panel, lasso mode are `useState` (0 `useUrlState`) | no evidence | no (PR-08 green; page-local `CanvasMobileSheet`) | **2 of 5** (C1, C3) |
| Repository | 1,291 yes | no: ~8 [27] (create repo, create file, rename, sync, IDE, PAT, content search, GitHub connect) | 32 yes / 20 | `tab` in the URL; selected repo, file and staged state are not | no evidence | no (PR-11 green) | **2 of 5** (C1, C3) |
| Build | 1,190 yes | no: ~4 [45] (large-file alert, create file, rename, agent configuration) | 22 yes / 61 | `tab` and `mobileTab` in the URL; selected file and session are not | no evidence | no (PR-10 green) | **2 of 5** (C1, C3) |
| Chat | 1,218 yes | no: 3 [22] (summary dialog, project selector, sessions sheet) | 23 yes / 0 | `selectedSessionId` is `useState` | no evidence | no (PR-07 green; sessions sidebar became a Sheet) | **2 of 5** (C1, C3) |
| Artifacts | 1,377 yes | no: ~9 [68] (edit, preview, delete alert, add, create folder, move, visual recognition, enhance image, collaborator) | 7 no / 36 | folder, view mode, search, opened artifact are `useState` | no evidence | no (PR-06 green, 0 axe violations) | **1 of 5** (C1 only) |

No page has more than 10 dialog surfaces, so criterion 2 is met by none. Artifacts comes closest (~9) but scores its toasts on the page file, where it has 7.

Other project pages, measured the same way (none in the D-14 candidate list):

| Page | Lines | Dialog surfaces [token refs] | Toasts | Criteria met |
|---|---|---|---|---|
| Specifications | 1,316 | 0 [1] | 25 | 2 (lines, toasts) |
| Audit | 1,104 | 1 [12] (configuration dialog) | 22 | 2 (lines, toasts) |
| Present | 1,354 | ~2 [23] | 16 | 1 (lines) |
| Requirements, Standards, Database, Deploy, Change, Versions, Settings | 154 to 597 | 0 | 0 to 6 | 0 |

## Other evidence

- Every candidate talks to the API directly (`fetch`, `functions.invoke`, `supabase.from`) with `useState` for results. Only Chat and Artifacts use `useQuery`, and only for the project header, requirements, canvas nodes and artifact lists. Repository has ~25 direct calls, Build ~11.
- Known carried legacy bugs sit in Chat (sidebar toggle had no aria-label, fixed in D4) and none in the other four. Restyle workarounds are recorded for Canvas (page-local mobile sheet) and Build (two URL tab keys, `tab` and `mobileTab`, to work around the resizable panels).
- Repository and Build share `CodeEditor`, `CreateFileDialog`, `RenameDialog`, the file tree and the staging model. A rewrite of one shapes the other.
- Usage: Canvas, Repository and Build are the core of the Design and Build phases; Chat is the Define entry point and is used first in every project.
- Cost: `plan.md` budgets 3 to 5 agent-days each.

## Decision

**Strict D-14 reading.** A page qualifies with at least two criteria. Criterion 4 needs a user complaint and there is none on record, criterion 2 needs more than 10 dialog surfaces and no page has them, and criterion 5 fails everywhere. The only criteria any page meets are 1 (lines) and 3 (toasts on the page file). That selects exactly four pages: **Chat, Repository, Build and Canvas** (2 of 5 each). **Artifacts meets 1 of 5 and does not qualify.**

**What this doc does with Artifacts.** It is dropped from Phase R: `specs/009-rewrite-artifacts/` is kept (not deleted) and its status is set to **Deferred**. It can come back if a complaint about its reload state is recorded (criterion 4) or its toast count on the page file passes 20.

**Specifications and Audit also meet two criteria** (lines, toasts) on the strict reading, so they qualify on paper. They are not selected: their toasts are generation and run-lifecycle messages that `StatusCenter` already covers, they have no dialogs to consolidate, and a rewrite there buys nothing a restyle did not. This is a product and sequencing decision, not a D-14 result. Revisit them after the four ship.

Order, with the reasons for it (sequencing is a product decision; D-14 only decides who qualifies):

| Order | Page | Spec | Why here |
|---|---|---|---|
| 1 | Chat | `specs/008-rewrite-chat/` | Smallest surface and least shared code (no tool components). Reloading drops the open conversation, and the summary dialog and 23 toasts have clear inline homes. It proves the patterns (URL id, server data cache, `ActionButton` for save/summary, Inspector for the summary) at the lowest risk |
| 2 | Repository | `specs/010-rewrite-repository/` | Most direct API calls and toasts; the file tree, editor and create/rename dialogs it rewrites are the shared parts Build needs |
| 3 | Build | `specs/011-rewrite-build/` | Consumes the shared file tree, editor and staging model from Repository. Agent runs already fit `StatusCenter` |
| 4 | Canvas | `specs/012-rewrite-canvas/` | Highest score but highest risk: React Flow, realtime, 22 tool components and the heaviest interaction model. Goes last so the inspector and inline-feedback patterns are settled. It is the only page with a mobile workaround, but nothing is broken today |

Each rewrite is an independent feature with its own spec, plan and tasks, shipped behind the existing route so the restyle regression row (PR-xx) stays the acceptance baseline. Phase R starts only after cutover (T073 onward). Repository to Build is the only dependency between the four.
