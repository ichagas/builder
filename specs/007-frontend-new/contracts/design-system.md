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
| Status | `--ok #127B3B`, `--warn #B05109`, `--bad #C0262D`, `--run #D97706` + `-soft` variants |
| Status foreground | `--ok-foreground`, `--warn-foreground`, `--bad-foreground`: `#FFFFFF` in light, `#0B1830` in dark; text/icons on solid ok/warn/bad fills |
| Phases | `--c-define-ink` (`#6D28D9` light / `#C4B5FD` dark: text on define-tinted chips, AA), `--c-define #7C3AED`, `--c-design #0891B2`, `--c-build #D97706`, `--c-ship #16A34A` |
| Change types | `--t-bug`, `--t-feat`, `--t-enh`, `--t-base` + `-soft` |
| Mesh agents | `--m-green #16A34A`, `--m-yellow #CA8A04`, `--m-red #DC2626`, `--m-blue #2563EB` |
| Mode band | `--mode-building #4C8DFF`, `--mode-released #2FBF71`, `--mode-connected #A78BFA` |
| Chrome | `--rail-bg #102040`, `--rail-ink`, `--rail-muted`, `--rail-hover`, `--rail-line`, `--rail-active`, `--gbar-bg #0B1830` |
| Categorical | `--cat-1..--cat-8` (+ `-rgb`), see §1.2 |
| IDE surface | `--ide-*`, see §1.3 |
| Type | `--font "IBM Plex Sans"`, `--mono "IBM Plex Mono"` (identifiers only), `--fs 14px`, `--h1 26px/600`, `--h2 14px/600` |
| Shape | `--radius 4px`, `--radius-s 3px`, `--radius-pill 3px` |
| Density | `--row 48px` (min target 44px), `--pad 14px`, `--gap 14px` |
| Layout | `--rail-w 248px` (collapsed 76px), `--bar-h 52px`, `--timeline-h 76px`, `--tabbar-h 56px` |
| Elevation | `--shadow none`, `--shadow-pop 0 10px 28px rgba(11,24,48,.28)` |

Dark theme: invert surfaces (`--bg #0E1626`, `--surface #142036`…) while keeping status and phase hues, with contrast ≥ 4.5:1. The rail and global bar stay navy in both themes.

Note (WP-F2 fix round 1): light `--ok` and `--warn` were darkened minimally from the original Blueprint values (`#13803D` → `#127B3B`, `#B45309` → `#B05109`) so that the DeltaChip/TypeChip `-soft`-background pairing (`ok` on `ok-soft`, `warn` on `warn-soft`) clears WCAG AA (was 4.28:1 / 4.40:1, now ≥ 4.5:1); both still clear AA against `--surface` with margin.

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

**Collision rule (T020 follow-up, WP-F2c):** `tokens.css` (Blueprint) and `index.css` (shadcn) must never declare the *same* CSS custom property name. `--muted`, `--primary`, `--primary-foreground` and `--radius` used to be defined in both files — `tokens.css`'s hex/px values (the source of truth) *and* `index.css`'s re-pointed HSL triplet for the same name — and since `index.css` loads after `tokens.css`, the HSL triplet silently won everywhere, including `var(--x)` used as a raw CSS color (e.g. `tokens.css`'s own `--chart-1: var(--primary)`, which resolved to a bare, invalid "H S% L%" string). The fix: those four are defined exactly once, in `tokens.css` only; `index.css` no longer redeclares them, and `tailwind.config.ts`'s `muted`/`primary` color entries read the Blueprint `-rgb` tokens directly (`rgb(var(--surface-2-rgb) / <alpha-value>)` etc.) instead of `hsl(var(--muted))`/`hsl(var(--primary))`. `src/design/__tests__/no-token-collision.test.ts` guards against a regression (no property name defined in both files; the compiled Tailwind output for `text-muted-foreground`/`bg-muted`/`bg-primary`/`text-primary-foreground` uses the rgb tokens, not the old HSL vars; no bare `text-muted` class in `src/`).

Utility classes, resolved after the fix: `bg-muted` → `--surface-2` (a *background* tone); `text-muted-foreground` → `--muted` (Blueprint's muted *ink*) — use `text-muted-foreground` for muted body/caption text, never the bare `text-muted` class (it renders the muted *background* color as text, ~1:1 contrast). `bg-primary`/`text-primary-foreground` → `--primary`/`--primary-foreground`.

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

### 1.2 Categorical palette (WP-F2b fix round 1, hues adjusted fix round 2)

`--chart-1..6` are *not* a categorical palette: they alias `--primary`/`--ok`/`--warn`/`--bad`/`--c-define`/`--c-design`, i.e. status and phase semantics. Using them (or the status/phase tokens directly) to color a legend that has no status or phase meaning — an agent-type color map, a database-object-type icon, a canvas node-type badge — makes the color lie: a node colored `--bad` reads as "broken", not "this is a webhook."

`--cat-1..--cat-8` are a dedicated, non-semantic categorical palette for exactly that case: coloring items in a fixed, unordered set (agent kind, schema-object kind, canvas node type) where the color's only job is "these are different kinds of thing," never "this is good/bad/in-progress." Rules:

- Never imply status, severity or phase. Don't reuse `--ok`/`--warn`/`--bad`/`--run`/`--c-*`/`--chart-*` for a categorical legend, and don't add new status-colored entries to this palette.
- Color is never the only differentiator — pair every categorical color with a distinct icon or label (WCAG 1.4.1). This matters most here: 8 hues covering more than 8 categories (e.g. CanvasNode's ~23 node types) must reuse hues, so the icon carries the distinction the color can't.
- Each hue clears **≥ 3:1** contrast against `--surface`, `--surface-2` and `--bg` in both themes (WCAG 1.4.11, non-text/graphical objects — the bar for a legend swatch or icon, not body text's 4.5:1).
- Each hue sits **≥ ~25°** away from `--ok`/`--warn`/`--bad` on the color wheel, in both themes, so a categorical swatch never reads as a status color by coincidence (fix round 2, item 2 — see the note below).
- Mapping approach for a set larger than 8: assign hues by a stable, deterministic rule (e.g. index into the palette by category, or a fixed lookup table keyed by type), and never rely on hue alone past 8 categories — the icon must already disambiguate.

| Token | Light | Dark | Suggested use |
|---|---|---|---|
| `--cat-1` | `#4F46E5` (indigo) | `#8B85F5` | e.g. component / feature agent |
| `--cat-2` | `#0F766E` (teal) | `#2DD4BF` | e.g. API / service |
| `--cat-3` | `#A21CAF` (fuchsia) | `#E879F9` | e.g. database / schema |
| `--cat-4` | `#184EAA` (blue) | `#689BF3` | e.g. external service |
| `--cat-5` | `#6920B6` (violet) | `#B67EF1` | e.g. security / firewall |
| `--cat-6` | `#155E75` (cyan) | `#38BDF8` | e.g. requirement / doc |
| `--cat-7` | `#4D7C0F` (olive) | `#A3E635` | e.g. tech stack / util |
| `--cat-8` | `#981B62` (magenta) | `#EF6CB6` | e.g. agent / orchestration |

Measured contrast ratios (`src/design/__tests__/contrast.test.ts`, "categorical palette" block): every `--cat-N` clears ≥ 3:1 against `--surface`, `--surface-2` and `--bg` in both themes; worst case is light `--cat-7`/`--bg` at 4.24:1 (all other light pairs ≥ 4.57:1, all dark pairs ≥ 4.77:1) — comfortable margin over the 3:1 floor.

Fix round 2, item 2: `--cat-4` (was `#A16207` gold, hue ~35°) and `--cat-8` (was `#9A3412` brown, hue ~15°) sat inside the warn (~26°/36°)/bad (~357°/2°) orange-red band — only ~9-18° away in both themes, well under the ≥25° floor, so either could misread as a warning or error color. Generalizing the check to every `--cat-N` (`src/design/__tests__/contrast.test.ts`, "categorical palette hue separation" block) found `--cat-5` (was `#BE185D` rose, hue ~335°/351°) had the same problem against `--bad` (~10-22° away). All three were re-hued away from that band — `--cat-4` to blue (~218°), `--cat-5` to violet (~269°), `--cat-8` to magenta (~326°) — keeping ≥ 3:1 contrast (now ≥ 5.3:1 in the worst case, better than before) and landing every `--cat-N` ≥ 25° from `--ok`/`--warn`/`--bad` in both themes (minimum observed: light `--cat-8`/`--bad` at 31.4°, dark `--cat-2`/`--ok` at 25.7°). `AgentFlow.tsx`'s executing-state `ring-4 ring-warn` on a categorical card is unaffected by this — the ring sits outside the card's own `--cat-N` fill/border, so there was never a same-token collision there, only the risk of a *different* cat hue reading as "warning" by coincidence, which the hue-separation floor now rules out.

Tailwind: `bg-cat-1`..`bg-cat-8` (and `text-`/`border-`), via `--cat-N-rgb` in `tailwind-preset.ts`, same `rgb(var(--x-rgb) / <alpha-value>)` pattern as the other color groups.

Applied in WP-F2b fix round 1: `AgentFlow.tsx`'s agent `colorMap`, `DatabaseSchemaSelector.tsx`'s `getTypeIcon` (table/view/function/trigger/index/sequence/type/savedQuery/migration), and `CanvasNode.tsx`'s `legacyNodeColors` (23 node types, hues reused with distinct Lucide icons per type) — previously mapped to `ok`/`warn`/`bad`/`define`/`design`, none of which have status or phase meaning in those contexts.

### 1.3 IDE-surface tokens (`--ide-*`, T031)

Fixed "VS Code Dark+"-style palette for the code/file-browsing widgets — file trees, the code editor and its markdown/diff preview, commit log, SQL editor, search results — so they read like a familiar developer tool rather than the app's own light/dark theme. **Deliberately constant in both app themes**: these aren't semantic app-status/phase colors, so they're defined once on `:root` and not re-pointed under `.dark`/`[data-theme="dark"]`. Allowed **only** inside the IDE-style widgets listed above — not for general app chrome or status/categorical legends, which use the tokens in §1/§1.2.

| Token | Value | Purpose |
|---|---|---|
| `--ide-bg` | `#1e1e1e` | Editor/panel background |
| `--ide-panel` | `#252526` | Secondary panel background (sidebar, tabs) |
| `--ide-panel-2` | `#313335` | Tertiary panel background |
| `--ide-hover` | `#2a2d2e` | Row/item hover background |
| `--ide-border` | `#3e3e42` | Panel/divider borders |
| `--ide-tab-border` | `#37373d` | Tab strip border |
| `--ide-input` | `#3c3c3c` | Input/field background |
| `--ide-input-alt` | `#2d2d2d` | Secondary input background |
| `--ide-ink` | `#cccccc` | Default text |
| `--ide-ink-bright` | `#ffffff` | Emphasized text |
| `--ide-ink-bright-2` | `#e6e6e6` | Secondary emphasized text |
| `--ide-default-text` | `#d4d4d4` | Editor body text |
| `--ide-muted` | `#858585` | Muted/secondary text |
| `--ide-muted-2` | `#808080` | Muted/secondary text (alt) |
| `--ide-scrollbar` | `#4e4e52` | Scrollbar thumb |
| `--ide-selection` | `#264f78` | Text/row selection background |
| `--ide-accent` | `#007acc` | Primary accent (links, active state) |
| `--ide-accent-hover` | `#1177bb` | Accent hover state |
| `--ide-accent-active` | `#0e639c` | Accent active/pressed state |
| `--ide-folder` | `#dcb67a` | Folder icon color |
| `--ide-type` | `#4ec9b0` | Syntax: type names |
| `--ide-string` | `#ce9178` | Syntax: string literals |
| `--ide-variable` | `#9cdcfe` | Syntax: variable names |
| `--ide-diff-add-bg` | `#1e2a3a` | Diff "added" line background |
| `--ide-diff-add-border` | `#3e5a7a` | Diff "added" line border |
| `--ide-link` | `#60a5fa` | Inline link color in editor/preview surfaces |

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
