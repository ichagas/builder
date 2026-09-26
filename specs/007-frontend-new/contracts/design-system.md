# Contract: Design System and Shell Components

The design source is `docs/design/frontend-redesign/option-a-styles/`:
- `shared/base.css` sets structure and responsive rules.
- `shared/blueprint.css` sets the visual style.
- `shared/lifecycle.css` defines the timeline, step bar and mode styles.
- `shared/onboarding.css` defines the mesh, stack, portfolio and wizard styles.

Behavior references are the prototypes `approach-3-versions.html` (Builder) and `onboard-b-console.html` (Assurance). When code and prototype disagree, this contract wins. Change it through a PR that updates the prototype too.

## 1. Tokens (`src/design/tokens.css`)

Defined on `:root` (light) and `[data-theme="dark"]` / `prefers-color-scheme: dark` (dark). Tailwind maps them in `tailwind-preset.ts`. Components use Tailwind classes or `var(--…)`, never raw hex.

| Group | Tokens (light values from Blueprint) |
|---|---|
| Surface | `--bg #E8EDF4`, `--surface #FFFFFF`, `--surface-2 #F2F5F9`, `--line #D3DBE6`, `--line-2 #AFBCCE` |
| Text | `--ink #0F1D35`, `--muted #4F5F78` |
| Brand | `--primary #2451D6`, `--primary-soft #E3EAFC`, `--focus #2451D6` |
| Status | `--ok #13803D`, `--warn #B45309`, `--bad #C0262D`, `--run #D97706` + `-soft` variants |
| Phases | `--c-define #7C3AED`, `--c-design #0891B2`, `--c-build #D97706`, `--c-ship #16A34A` |
| Change types | `--t-bug`, `--t-feat`, `--t-enh`, `--t-base` + `-soft` |
| Mesh agents | `--m-green #16A34A`, `--m-yellow #CA8A04`, `--m-red #DC2626`, `--m-blue #2563EB` |
| Mode band | `--mode-building #4C8DFF`, `--mode-released #2FBF71`, `--mode-connected #A78BFA` |
| Chrome | `--rail-bg #102040`, `--rail-ink`, `--rail-muted`, `--rail-hover`, `--rail-line`, `--rail-active`, `--gbar-bg #0B1830` |
| Type | `--font "IBM Plex Sans"`, `--mono "IBM Plex Mono"` (identifiers only), `--fs 14px`, `--h1 26px/600`, `--h2 14px/600` |
| Shape | `--radius 4px`, `--radius-s 3px`, `--radius-pill 3px` |
| Density | `--row 48px` (min target 44px), `--pad 14px`, `--gap 14px` |
| Layout | `--rail-w 248px` (collapsed 76px), `--bar-h 52px`, `--timeline-h 76px`, `--tabbar-h 62px` |
| Elevation | `--shadow none`, `--shadow-pop 0 10px 28px rgba(11,24,48,.28)` |

Dark theme: invert surfaces (`--bg #0E1626`, `--surface #142036`…) while keeping status and phase hues, with contrast ≥ 4.5:1. The rail and global bar stay navy in both themes.

### 1.1 Mapping the existing shadcn variables (redesign route, research D-3)

The fork keeps shadcn's HSL variables in `src/index.css`. They are **re-pointed** to Blueprint so every existing component restyles without edits:

| Existing variable | Blueprint value |
|---|---|
| `--background` | `--bg` (#E8EDF4) |
| `--foreground`, `--card-foreground`, `--popover-foreground` | `--ink` (#0F1D35) |
| `--card`, `--popover` | `--surface` (#FFFFFF) |
| `--primary` / `--ring` | `--primary` (#2451D6) |
| `--secondary`, `--muted` | `--surface-2` (#F2F5F9) |
| `--muted-foreground` | `--muted` (#4F5F78) |
| `--accent` | `--primary-soft` (#E3EAFC), foreground `--primary` |
| `--destructive` | `--bad` (#C0262D) |
| `--border`, `--input` | `--line` (#D3DBE6) |
| `--success` / `--warning` / `--info` | `--ok` / `--warn` / `--primary` |
| `--status-design` / `--status-audit` / `--status-build` | `--c-design` / `--warn` / `--c-build` |
| `--sidebar-*` | the rail tokens (`--rail-bg`, `--rail-ink`…) |
| `--radius` | `4px` |

Codemod mapping for hard-coded Tailwind colors (T031). Unmapped cases are listed for manual review:

| Found | Replace with |
|---|---|
| `text/bg/border-(green|emerald)-5xx–7xx` | `text-ok` / `bg-ok` / `border-ok` |
| `bg-(green|emerald)-50/100` | `bg-ok-soft` |
| `(…)-(red)-5xx–7xx`, `bg-red-50/100` | `…-bad`, `bg-bad-soft` |
| `(…)-(yellow|amber|orange)-5xx–7xx`, `-50/100` | `…-warn`, `bg-warn-soft` |
| `(…)-(blue|indigo)-5xx–7xx`, `-50/100` | `…-primary`, `bg-primary-soft` |
| `(…)-(purple|violet)-5xx–7xx` | `…-define` (phase) or `…-feat` (type), by context |
| `text-(gray|slate)-4xx–6xx` | `text-muted-foreground` |
| `text-(gray|slate)-7xx–9xx` | `text-foreground` |
| `bg-(gray|slate)-50–200`, `border-(gray|slate)-200–300` | `bg-surface-2`, `border-line` |
| hex values in `style={}` or `stroke`/`fill` | the nearest token via `var(--…)`, charts via the `--chart-*` tokens |

## 2. Shell components (`src/components/shell/`)

| Component | Contract |
|---|---|
| `AppShell` | Layout route element. Renders `GlobalBar`, `Rail`, optional `TimelineStrip`, `<Outlet/>`, `StatusCenter`, `UndoBar`, `PrimaryActionSlot` (mobile) and `MobileTabBar`. **Mounted once per layout.** |
| `GlobalBar` | Logo, `ProjectSwitcher` (project layout) **or** `TeamSwitcher` (assurance layout, the **only** team control), `ModeBadge` (Building, Released vX, or Standards vX), search (⌘K), `StatusPill`, account menu. 3px mode band. |
| `Rail` | Props: `sections: RailSection[]`. Project layout: "All versions" + version card + 4 `PhaseNode`s (state `base|todo|active|done|skipped`, note text). Assurance: Portfolio, Onboard, Applications list (count + worst status dot), Organization. Collapsible (pref persisted). Hidden ≤768px. |
| `TimelineStrip` | Props: `nodes: {id, label, sub, kind: hist|current|building|hotfix|planned|more|day, verdict?}[]`, `flags`, `selectedId`, `onSelect`. Collapses history into "N more". Keeps the selection in view. Horizontal scroll with no visible scrollbar on mobile. |
| `PageHeader` | `crumb`, `title`, `primary?: ActionSpec`. The primary action renders top right and is mirrored in `PrimaryActionSlot` at ≤768px. |
| `ActionButton` | `idle → pending (spinner + progress) → done/failed`. `confirm?: string` enables two-step confirmation. `undo?: () => void` pushes to `UndoBar`. |
| `NextStepBanner` | `title`, `body`, `cta?`, `tone: info|ok|warn|lock`. One per page at most. |
| `Stepper` | Horizontal steps (change page, onboarding). Props `steps[{id,label,state,note}]`, `current`, `onSelect`. Future steps are disabled in wizards. |
| `Disclosure` | `<details>`-based. `prefKey` remembers open state. |
| `Inspector` | Right panel on desktop, bottom sheet with detents (peek, half, full) at ≤768px. |
| `StatusPill` / `StatusCenter` | Shows running long tasks (`useLongTask`) from realtime: agent sessions, audits, deploys, sandbox runs. |
| `UndoBar` | A single slot, bottom left on desktop and above the mobile action on phones. One message at a time, 7s. |
| `MobileTabBar` | 4–5 items. Project: Versions + 4 phases. Assurance: Portfolio, Onboard, Packs, Policy. |
| `FilterChips` | URL-bound (`?f=`), with counts. |
| Domain atoms | `TypeChip`, `DeltaChip`, `MeshDots` (G, Y, R, B letters + aria-label), `StackBadge`, `PrChip`, `VersionTag`, `RepoRow`, `AdoptionBar`, `EmptyState` |

## 3. State hooks (`src/lib/state/`)

- `useUrlState<T>(key, default, {parse, serialize})` reads and writes path or query without remounting layouts.
- `useUiPrefs()` is a typed local-storage store with try/catch fallback. Keys: `rail.collapsed`, `open.<disclosure>`, `exp.<appId>`, `group.<appId>`.
- `useUndo()` exposes `push({text, undo})`.
- `useLongTask()` exposes `start({id, label, channel})` and progress from realtime.

## 4. Copy rules

Sentence case. Buttons name the action ("Send update PRs (3)", not "Submit"). No toast for anything that has a place on screen. Errors say what happened and how to fix it. Mono font only for identifiers (WI-42, branches, versions, repo names).
