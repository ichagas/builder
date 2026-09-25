# Pronghorn frontend redesign proposal

**Status:** Draft for decision · **Date:** 2026-09-24 · **Scope:** `app/frontend` shell, navigation, and interaction patterns

This proposal replaces Pronghorn's page-per-tool navigation with a shell built around the tasks people do in a project. The layout, component library (shadcn/ui, Tailwind, React Flow, Monaco) and backend API stay as they are. The work is in the shell, the routing model, and a small set of shared interaction primitives.

Three design directions are included as interactive prototypes. Each one applies the same five principles in a different way. Open `index.html` in this folder to compare them side by side at desktop and phone widths.

| Option | File | In one line |
|---|---|---|
| A. Lifecycle Rail | `option-a-lifecycle.html` | Navigate by project phase (Define, Design, Build, Ship). Tools sit inside their phase. |
| B. Next Action | `option-b-next-action.html` | Each project opens on a queue of things that need you, and each item has one clear action. |
| C. Workbench | `option-c-workbench.html` | One persistent workspace with a tool dock, an inspector that appears on selection, and a live run dock. |

---

## 1. What is wrong today

These findings come from reading the current code, not only from looking at screenshots.

### 1.1 The hierarchy lists tools, not tasks
- `components/layout/ProjectSidebar.tsx` shows **13 peer links** in no particular order: Settings, Artifacts, Chat, Requirements, Standards, Canvas, Specifications, Repository, Build, Database, Deploy, then Audit and Present under "Experimental".
- **Settings is the first item**, even though it's the least-used destination. The real workflow (requirements → design → spec → build → deploy) isn't visible in the order.
- There are **two separate navigation systems**: a global `PrimaryNav` across the top (Dashboard, Standards, Tech Stacks, Build Books) and the `ProjectSidebar`. Both use the same visual weight, so the user can't tell whether they are inside a project or in the organization library.

### 1.2 Disclosure is either all or nothing
- Heavy pages load everything at once: `Canvas.tsx` (1,791 lines), `Present.tsx` (1,345), `Artifacts.tsx` (1,330), `Repository.tsx` (1,299), `Specifications.tsx` (1,284), `Build.tsx` (1,187).
- Secondary tasks go to modals instead of expanding in place. `Artifacts.tsx` has about 25 dialog references and `Chat.tsx` has 11. There are 20 files using `AlertDialog`. Every modal breaks the user's context.
- `Build.tsx` has 7 tab triggers and `Repository.tsx` has 4. The tabs are chosen by the layout, not by what the user is doing, and they aren't in the URL.

### 1.3 State is not fixed or predictable
- Each page renders its own `<PrimaryNav />` and `<ProjectSidebar />`, so **the shell remounts on every route change**.
- The sidebar's `isCollapsed` is local `useState`. It resets each time the user navigates. The project name is fetched again on every page.
- Tab selection, panel sizes and the selected file or node are not stored in the URL. Reloading or sharing a link loses where the user was.
- The page header puts the hamburger menu **inside the page content**, so its position changes with each page layout.

### 1.4 Reach is poor on phones
- On mobile, all project navigation is behind a hamburger in the **top-left corner**, which is the hardest spot to reach with one thumb.
- `ProjectPageHeader` puts actions in a wrapping row at the top of the page. On a phone, the primary action ends up in the least reachable area.
- The sidebar's links use `py-2` with 16px icons, which gives rows about 36px tall. That is below the 44–48px minimum touch target.

### 1.5 Feedback is scattered and short-lived
- The frontend has **628 `toast.*` calls**. Toasts disappear, stack up, and aren't tied to the object that changed. For example, "File created successfully" appears in a corner, away from the file tree.
- Long-running work has no persistent home: agent runs, staging, commits, deploys and audits. The user has to stay on the originating page, or keep switching between pages, to see progress.
- Loading states are uneven: many pages have no skeleton or `Loader2` at all.

---

## 2. Design principles as rules

Each principle is written as a rule that can be checked in review.

### P1. Task-oriented hierarchy
1. The top level of project navigation is **what the user is trying to do**, grouped into at most 4–5 entries. Individual tools are the second level.
2. The order follows the workflow. Settings, sharing and danger-zone actions move to a project menu, out of the main navigation.
3. The organization library (Standards, Tech Stacks, Build Books, Gallery) is a separate, clearly different area. It isn't mixed into project navigation.
4. Every screen has **one primary action**, and it is always in the same place.

### P2. Contextual progressive disclosure
1. Show the minimum needed for the current task. Reveal detail **where the user's attention already is**: an inline expander, an inspector that appears on selection, or a bottom sheet. Don't open a modal.
2. Modals are only for decisions that are destructive or can't be undone.
3. "Advanced" options are collapsed by default and remember whether the user opened them.
4. Empty states offer the next action. They don't explain the feature.

### P3. Fixed and predictable state
1. **A persistent app shell.** Layout routes (`<Outlet />`) mount the navigation once. Pages never render their own shell.
2. **The URL holds the view state:** tool, tab, selected entity and open panel. Examples: `/p/:id/build/repo?file=src/app.ts&panel=diff`. Back, forward, reload and share all return the user to the same view.
3. **Preferences persist** (rail collapsed, panel sizes, disclosed sections) in one `useUiPrefs` store.
4. Landmarks don't move. The primary action, status area and navigation keep their positions on every screen at a given breakpoint.

### P4. Thumb and reach optimization
1. At phone widths (≤ 768px), navigation and the primary action are in the **bottom third** of the screen. The top of the screen is for reading (title, context).
2. Touch targets are at least **44 × 44px**, with 8px between them.
3. Secondary panels become **bottom sheets** with detents (peek, half, full). They don't slide in from the side.
4. Destructive actions are not placed inside the easy thumb arc, which prevents accidental taps.

### P5. Immediate state feedback
1. Every action responds within **100ms** with a visible state change on the control itself: pressed, then pending, then done or failed.
2. Mutations update the screen **optimistically** and roll back on failure. The item that changed shows the result inline, not in a distant toast.
3. Long-running work (agents, commits, deploys, audits) shows in one **persistent status area** that is visible from every screen.
4. Toasts are only for events not tied to anything on screen. Reversible actions show **Undo** in a fixed position.

---

## 3. Target architecture (same for all three options)

```
<AppShell>                          ← mounted once (layout route)
  <GlobalBar/>                      project switcher, search/⌘K, status
  <ProjectNav variant={A|B|C}/>     rail | tabs | dock   (bottom bar ≤768px)
  <main><Outlet/></main>            page content only
  <StatusCenter/>                   live runs: agent, commit, deploy, audit
  <UndoBar/>                        single fixed slot for reversible actions
</AppShell>
```

**New shared primitives** (in `src/components/shell/` and `src/hooks/`):

| Primitive | Replaces | Notes |
|---|---|---|
| `AppShell` + nested layout routes | Per-page `PrimaryNav`/`ProjectSidebar` | Removes the remounts. Also merges the duplicated `/t/:token` routes into one optional segment. |
| `useUrlState(key, default)` | Local `useState` for tabs/selection | Thin wrapper around `useSearchParams`. |
| `useUiPrefs()` | Scattered local UI state | Persists to localStorage and falls back safely. |
| `StatusCenter` + `useLongTask()` | Page-bound spinners + toasts | Fed by the existing `useRealtime*` WebSocket hooks. |
| `ActionButton` | Plain `<Button>` + toast | Built-in idle → pending → success/error states. Accepts an `undo` callback. |
| `Disclosure` / `Inspector` / `Sheet` | Most `Dialog` usage | `Sheet` becomes a bottom sheet with detents on mobile. |
| `NextActions` feed (option B) | none | Derived from existing data: staged changes, failed deploys, unanswered agent questions. |

**Proposed route map (task-grouped):**

| Task group | Tools inside | Current routes |
|---|---|---|
| Define | Requirements, Standards, Artifacts, Chat | `requirements`, `standards`, `artifacts`, `chat` |
| Design | Canvas, Specifications | `canvas`, `specifications` |
| Build | Agent, Repository, Database | `build`, `repository`, `database` |
| Ship | Deploy, Audit, Present | `deploy`, `audit`, `present` |
| Project menu | Settings, Sharing, Clone, Delete | `settings` |

Keep the old URLs working with `<Navigate>` redirects so existing share links still resolve.

---

## 4. The three options

### Option A: Lifecycle Rail
- **Hierarchy:** A left rail lists the four phases. Each phase shows its progress, for example "12/18 requirements have acceptance criteria". The tools inside a phase are a segmented control at the top of the page.
- **Disclosure:** A "next step" banner in each phase suggests the single most useful action. Rows expand in place. A detail panel opens on the right only after the user selects something.
- **Reach:** On phones, the rail becomes a 4-item bottom bar. The phase's primary action is a full-width button right above that bar.
- **Feedback:** A status pill in the global bar shows agent runs and the staged-file count. Commits and deploys run inside the button itself, and Undo appears in a fixed bar.
- **Best for:** Onboarding new users and teams who follow the process in order. It is the closest match to the four modes in the README.
- **Cost:** Low to medium. This is mostly a shell change. Pages move into phases with few internal changes.

### Option B: Next Action
- **Hierarchy:** Each project opens on **Now**, a ranked queue of items that need the user: review 3 staged files, answer an agent's question, fix a failed deploy. The full tool set is one tap away under **Project**, grouped by task.
- **Disclosure:** Each card shows one line and one action. Selecting "Details" expands the diff, log or question inline.
- **Reach:** On phones, a bottom tab bar has a raised central **Ask agent** button. Cards are full-width, with actions on the right edge, where the thumb rests.
- **Feedback:** A resolved card shows a check mark, collapses, and moves into the Activity timeline. Counters update right away.
- **Best for:** Supervising agents and working on a phone. It fits "Pronghorn orchestrates agents" and moves the user from operator to reviewer.
- **Cost:** Medium. Needs a `NextActions` aggregator built from existing realtime hooks.

### Option C: Workbench
- **Hierarchy:** One workspace. A tool dock is grouped by task with visible labels. The breadcrumb (project / group / tool / entity) always shows where the user is.
- **Disclosure:** The work surface takes the full screen. Selecting a canvas node or file opens an **inspector** on the right, which becomes a bottom sheet on phones, with "Advanced" collapsed.
- **Reach:** On phones, the dock moves to the bottom, the inspector becomes a 3-detent sheet, and a floating "Run agent" button sits in the right thumb zone.
- **Feedback:** A persistent **run dock** at the bottom works like an IDE status bar: agent state, staged count and environment health. It expands into logs or the staged tray. Canvas nodes that an agent is editing pulse in place.
- **Best for:** Power users spending long sessions on Canvas and Build. It feels like VS Code or Figma.
- **Cost:** Medium to high. Canvas and Build need to be split into surface + inspector components.

### Comparison

| | A. Lifecycle | B. Next Action | C. Workbench |
|---|---|---|---|
| Learnability for new users | ★★★ | ★★☆ | ★☆☆ |
| Speed for power users | ★★☆ | ★★☆ | ★★★ |
| Phone / one-handed use | ★★☆ | ★★★ | ★★☆ |
| Agent supervision | ★★☆ | ★★★ | ★★★ |
| Implementation effort | Low–Med | Med | Med–High |
| Fit with current pages | High | Medium | Medium |

**Suggested combination if you don't want to pick just one:** Use A's hierarchy for navigation, B's "Now" queue as each project's landing page, and C's run dock as the shared `StatusCenter`. The three options use the same shell contract, so they can be combined.

---

## 5. Rollout plan (whichever option is chosen)

1. **Shell first, without visual changes (1 sprint).** Introduce `AppShell` layout routes, remove per-page nav rendering, merge the token routes, and add `useUrlState` and `useUiPrefs`. Existing pages render unchanged inside `<Outlet/>`.
2. **Navigation and reach (1 sprint).** Ship the chosen `ProjectNav` variant, the mobile bottom bar, the fixed primary-action slot, and the project menu (Settings moves out).
3. **Feedback (1 sprint).** Add `ActionButton`, `StatusCenter` and `UndoBar`, and wire them to the `useRealtime*` hooks. Replace toasts page by page. Target at least 70% fewer `toast.*` calls.
4. **Disclosure (ongoing, one page per PR).** Convert non-destructive dialogs to inspectors, inline expanders and sheets. Start with Build, Canvas and Artifacts, which have the most dialogs.
5. **Measure.** Track time-to-first-commit for new projects, the percentage of sessions on mobile that reach Build or Deploy, and the number of navigations per completed task.

## 6. Acceptance checks
- [ ] Navigating between project tools never remounts the shell. Verify with the React Profiler.
- [ ] Reloading any project screen restores the tool, tab, selection and open panel.
- [ ] At 390 × 844, the primary action and navigation are both in the bottom 35% of the viewport.
- [ ] All interactive targets are at least 44px. Keyboard focus is visible on every control.
- [ ] Every mutation shows a pending state within 100ms, on the control that triggered it.
- [ ] Agent, commit and deploy progress is visible from every project screen.
- [ ] `prefers-reduced-motion` turns off non-essential animation.
