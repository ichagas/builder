# Implementation Plan: Pronghorn Frontend Redesign (`app/frontend-new`)

**Branch**: `feature/frontend-new` | **Date**: 2026-09-25 (revised: redesign route) | **Spec**: [spec.md](./spec.md)
**Design source**: `docs/design/frontend-redesign/` (commits `8f5d139`, `507cb91`, `b4c0a92` on `design/frontend-redesign`)

## Summary

**Redesign, don't rewrite.**
1. Copy `app/frontend/` into `app/frontend-new/`. Every feature works on the live API from the first commit.
2. Replace the look through design tokens, most of it by re-pointing the existing shadcn CSS variables to Blueprint.
3. Replace the navigation with one persistent shell and task-grouped URLs.
4. Restyle each page inside the shell, keeping its behavior.
5. Build the three new capabilities new, with their backend: versions and changes (B1), Assurance console (B2), onboarding (B3).
6. Cut over.

Full rewrites of large pages are an optional **Phase R** after cutover.

| Route | Effort | Calendar |
|---|---|---|
| **Redesign (US1–US3 + cutover)** | **≈ 50 agent-days** | **≈ 3–4 weeks with 5–6 agents** |
| New capabilities (US4–US6, incl. backend B1–B3 and Admin → Integrations) | ≈ 54 agent-days | runs in parallel, ≈ 5–6 weeks |
| Phase R rewrites (optional, per page) | 3–5 agent-days each | after cutover |

## Technical Context

| Area | Decision |
|---|---|
| Codebase | **Fork of `app/frontend/`**: same React 18.3, TypeScript 5.8, Vite 7, Tailwind 3.4, shadcn/ui, React Router 6.30, TanStack Query 5, MSAL, Monaco, React Flow… No stack change |
| Data | **Unchanged** for existing pages: `pronghornApiAdapter`, `useRealtime*` hooks, contexts. New capabilities use TanStack Query hooks + zod |
| Routing | Switch `<Routes>` to `createBrowserRouter` with **layout routes** (`RootLayout`, `ProjectLayout`, `AssuranceLayout`, `LibraryLayout`, `PublicLayout`). Lazy page modules as today |
| Styling | 1) Re-point the shadcn HSL variables in `src/index.css` to Blueprint values. 2) Add new tokens (phases, mesh, modes, rail). 3) Codemod hard-coded colors (877 Tailwind palette classes in 91 files, 388 hex values) to semantic tokens. 4) Blueprint type and shape (IBM Plex, 3–4px radius) |
| Shell | New `src/components/shell/*` per `contracts/design-system.md`. Replaces `components/layout/PrimaryNav`, `ProjectSidebar`, `ProjectPageHeader` |
| Tests | Existing Vitest suite kept. **New:** Playwright smoke per page (regression checklist), remount test, mobile-reach test, axe on shell and new screens, token lint |
| Container / infra | `app/frontend-new/Dockerfile` (same as legacy). Second instance of `infra/modules/frontend` at `next.<domain>`. CORS, APIM and Entra redirect updated |

## Constitution Check

| Principle | Status | Compliance |
|---|---|---|
| I. Contract Preservation | ✅ | No API change. Legacy routes redirect. Legacy app runs until cutover |
| II. Spec-Driven Traceability | ✅ | This spec set. Tasks name paths, stories and checklist rows |
| III. Verification Before Merge | ✅ | Per-page Playwright smoke, remount, mobile reach, axe, token lint, existing unit tests |
| IV. Security by Default | ✅ | No new client secrets. B2 webhook signed (HMAC). B3 sandbox read-only with egress restricted. Security reviews on those WPs |
| V. Operability | ✅ | Own container and host. Independent rollback. Regression gate before cutover |
| **VI. UI/UX Layout Immutability** | ⚠️ **Blocked until amended (T000)** | Needs written client approval. Scope VI to the legacy app until cutover and name the design-system contract for `app/frontend-new/` |

## Affected Layers

| Layer | Change |
|---|---|
| `app/frontend-new/` | **New (fork).** Design tokens, shell, router, restyled pages, new capability features |
| `app/frontend/` | No feature work (pre-go-live pivot). Kept only as the regression reference. Removed at cutover |
| `app/backend/src/` | Additive routers and services for B1–B3 only (unchanged from the previous plan; see `contracts/api.md`) |
| `infra/migrations/` | `012`–`015` for B1–B3 |
| `infra/` | `module.frontend_new`. Container Apps Job for the B3 sandbox |
| `.github/workflows/` | `frontend-new` CI job, image build and push |
| External | `goa-standards/assurance-mesh` (B2, B3) |

## How a page gets redesigned (the "move and restyle" recipe)

Every page work package applies the same recipe. It's mechanical, so agents can run many pages in parallel.

1. **Remove the page's shell:** delete the `<PrimaryNav/>`, `<ProjectSidebar/>` and `<ProjectPageHeader/>` rendering and the sidebar state (`isProjectSidebarOpen` …). The page renders only its content.
2. **Declare the page's route metadata** in `src/app/routes/project.tsx`: phase, tool id, title, and the primary action (label, handler hook, disabled state). The shell renders `PageHeader` and the mobile primary slot from it.
3. **Move tabs into the URL:** replace the page's `useState` tab value with `useUrlState('tab', default)`. Existing `<Tabs>` stay.
4. **Swap colors to tokens**, using the codemod output for the page's components, and fix what the codemod couldn't map.
5. **Adjust layout for 390px:** stack side panels, turn secondary side panels into `Sheet`, and keep 44px targets.
6. **Surface long runs:** if the page starts agent, audit or deploy work, register it with `useLongTask` so it appears in the status pill.
7. **Verify:** add the page's Playwright smoke (loads, main action works, reload restores tool and tab) and axe, plus screenshots at 1440 and 390.

**Not in the recipe (Phase R):** replacing internal dialogs, reworking internal state, rewriting data fetching.

## Architecture

### Folder changes in the fork

```
app/frontend-new/src/
├── app/
│   ├── router.tsx            # NEW: createBrowserRouter, layouts, legacy redirects
│   ├── routes/               # NEW: route metadata (phase, tool, title, primary action)
│   └── layouts/              # NEW: RootLayout, ProjectLayout, AssuranceLayout, LibraryLayout, PublicLayout
├── design/                   # NEW: tokens.css, tailwind-preset.ts, motion.css
├── components/
│   ├── shell/                # NEW: see contracts/design-system.md §2
│   ├── layout/               # REMOVED after all pages migrate (PrimaryNav, ProjectSidebar, ProjectPageHeader)
│   ├── ui/                   # KEPT, restyled through tokens
│   └── <areas>/              # KEPT, colors swept to tokens
├── lib/state/                # NEW: useUrlState, useUiPrefs, useUndo, useLongTask
├── features/                 # NEW: versions/, changes/, teams/, portfolio/, applications/, packs/, mesh/, onboarding/
├── pages/                    # KEPT: shell removed per page, tabs in URL
├── hooks/, contexts/, lib/, integrations/   # KEPT unchanged
└── index.css                 # variables re-pointed to Blueprint
```

### Information architecture and URLs

Same as the prototypes. The full table is in `contracts/routes.md`.

```
/projects                           Projects home (was /dashboard)
/p/:id/v/current/define/:tool       requirements | standards | artifacts | chat
/p/:id/v/current/design/:tool       canvas | specifications
/p/:id/v/current/build/:tool        agent | repository | database
/p/:id/v/current/ship/:tool         environments | audit | present | release*
/p/:id/versions, /p/:id/changes/:id*   (US4)
/p/:id/settings
/assurance/t/:teamId[/apps/:appId | /onboard/:step]*, /assurance/all*, /assurance/packs*, /assurance/policy*   (US5, US6)
/library/standards | tech-stacks | build-books | gallery,  /settings/profile | organization,  /admin
```
`*` = new capability. `v/current` shows one "Building" version until B1.

### Milestones

| Milestone | Content | Exit criteria |
|---|---|---|
| **M0 Governance** | T000–T002: amendment and approval, instructions, clarifications (done 2026-09-25) | Amendment merged |
| **M1 Fork and foundation** | Fork, CI, host, tokens, color codemod, shell, router with redirects, smoke harness | Every legacy page opens in the new shell (not yet restyled). Redirects work. Smoke green |
| **M2 Pages restyled** | Recipe applied to all pages (Builder, library, settings, public) | Regression checklist 100%. Token lint 0. Mobile-reach green |
| **M3 Cutover** | Host switch, redirects for internal links, legacy removal (no transition period: not live yet) | SC-001…SC-005 |
| **M4 Versions and changes** | B1 + US4 | Change lifecycle E2E |
| **M5 Assurance console** | B2 + US5 | Portfolio with live mesh ingest from a test repo |
| **M6 Onboarding** | B3 + US6 | Two-repo sample onboarded in dev |
| **Phase R (optional)** | Per-page rewrites decided after cutover | Per-page spec |

M4–M6 run **in parallel** with M1–M3 from M0 on (backend first). Cutover (M3) doesn't wait for M4–M6. New capabilities can ship after cutover.

### Cutover (unchanged)

`next.<domain>` for review → regression sign-off → primary host switch → remove `app/frontend/` right away (the app isn't live, so there's no classic period) → restore Principle VI to the single app.

## Project Structure (docs)

```
specs/007-frontend-new/
├── spec.md, plan.md, research.md, data-model.md
├── contracts/{routes.md, api.md, design-system.md}
├── tasks.md
└── agents.md
```

## Complexity Tracking

| Complexity | Why | Simpler alternative rejected because |
|---|---|---|
| Two apps for a few weeks | Principle VI scope, safe rollback, no big-bang | Restyling in place changes the protected layout immediately, and there's no side-by-side comparison |
| Legacy kept until cutover | Reference for the regression suite | Deleting it first would remove the baseline the smoke tests are written against |
| Color codemod | 877 palette classes and 388 hex values would otherwise be restyled by hand | Leaving them breaks the design system and dark mode |
