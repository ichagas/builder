# Feature Specification: Pronghorn Frontend Redesign (`app/frontend-new`)

**Feature Branch**: `feature/frontend-new`
**Created**: 2026-09-25 · **Revised**: 2026-09-25 (redesign route)
**Status**: Draft (planning only; no implementation yet)
**Input**: Redesign the Pronghorn frontend using the **simplest route**: a UI redesign, not a full rewrite. `app/frontend-new/` starts as a copy of `app/frontend/`, so every feature keeps working on the live API from day one. It then gets the new design system, a persistent shell, task-oriented navigation and restyled pages. Full page rewrites are an optional later phase for a few large pages. New capabilities (versions and changes, Assurance console, onboarding) are built new. When done, `app/frontend-new/` replaces `app/frontend/`.

Design source (approved prototypes in `docs/design/frontend-redesign/`):
- **Visual style:** Blueprint (`option-a-styles/shared/blueprint.css`).
- **Builder projects:** Approach 3, Version timeline (`approach-3-versions.html`, `LIFECYCLE.md`).
- **Existing applications:** Option B, Assurance console, organized as Teams → Applications → Repositories, with Onboard an app (`onboard-b-console.html`, `ONBOARDING.md`).
- **UX principles:** task-oriented hierarchy, contextual progressive disclosure, fixed and predictable state, thumb reach, immediate feedback (`PROPOSAL.md`).

## Clarifications

### Session 2026-09-25

- Q: Full rewrite or UI redesign? → A: **UI redesign.** Reuse the existing page components, hooks, contexts and API adapter. Rewrite pages only later, and only where the UX goals can't be met by restyling.
- Q: Where does it live? → A: `app/frontend-new/`, created by copying `app/frontend/`. It replaces `app/frontend/` at cutover.
- Q: Pronghorn's scope after an app is released? → A: Building and changing apps. Pronghorn does not operate or monitor production.
- Q: How are existing (non-Builder) apps organized? → A: Teams → Applications → Repositories. The team switcher lives only in the global header.
- Q: Change branches: real or virtual? → A: Real Git branches from the first commit.
- Q: Team role model? → A: Like GitHub: team owners and members. Organization admins see All teams.
- Q: When does the Assurance Mesh run? → A: On pull requests to the default branch (main, master, develop…).
- Q: Azure Pipelines? → A: Onboarding generates the CI for the repository's platform: GitHub Actions or Azure Pipelines.
- Q: What do new findings trigger? → A: TBD. Ideally notify and open an issue to resolve later. Blocking is possible for some checks, TBD.
- Q: French at cutover? → A: No, later. New screens are translation-ready (research D-16).
- Q: Legacy freeze? → A: Not needed. The app isn't live yet; this is a pivot before go-live. `app/frontend/` stops receiving feature work.
- Q: Which mesh checks block a PR? → A: Left configurable. PR validation runs and opens an issue when it finds something. Blocking may be allowed from the start and changed later (D-15). The CI may also run a Cyber Risk sandbox stage (D-17).
- Q: Which identity opens Azure Repos PRs? → A: TBD. Configured by admins on an Admin → Integrations page (service connection or PAT) (D-18).

## Scope

**In scope (redesign)**
- Fork `app/frontend/` into `app/frontend-new/`, with its own container, CI job and host.
- A new **design system**: Blueprint tokens mapped onto the existing shadcn CSS variables, plus new tokens (phases, mesh, modes), and a sweep that replaces hard-coded colors with tokens.
- A new **persistent shell** through layout routes: global bar, rail with four phases, timeline strip, status pill, undo slot, primary-action slot and mobile tab bar. It replaces `PrimaryNav`, `ProjectSidebar` and `ProjectPageHeader` in every page.
- A new **URL structure**, grouped by task (Define, Design, Build, Ship), with redirects from every legacy route and share-token link.
- **Restyling every page** inside the shell, with the same behavior: page header with one primary action, tools as tabs, tab and selection held in the URL, and layout adjusted for 390px.
- **New capabilities**, built new: versions and changes (Approach 3, backend B1), the Assurance console (Option B, backend B2), onboarding (backend B3).
- Cutover: regression gate, redirects, retiring `app/frontend/`.

**Deferred (optional Phase R, after cutover)**
- Full rewrites of the largest pages where restyling can't meet the UX goals. Candidates: Canvas, Build, Artifacts, Repository, Chat. Each is decided separately.
- Replacing most toasts and non-destructive dialogs inside restyled pages with inline feedback and inspectors.

**Out of scope**
- The French UI (a later project; see FR-011 for the preparation included here).
- Production operations (health, errors, incidents, rollback monitoring).
- Changes to existing API contracts. New endpoints are additive.

## User Scenarios & Testing *(mandatory)*

### User Story 1: A new shell and navigation around every existing page (Priority: P1) 🎯 MVP

A user signs in, opens a project and moves through Define → Design → Build → Ship. Every existing tool is there, looks like Blueprint, and sits inside one shell that doesn't reload between pages. Legacy links and share links still work.

**Why this priority**: It delivers most of the visible improvement (look, navigation, stability, phone reach) with the least risk, because every page's logic is unchanged.

**Independent Test**: Run the legacy E2E smoke (created in T017) against the new app: every page loads and its main action works. The Profiler shows no shell remounts. Legacy URLs redirect.

**Acceptance Scenarios**:
1. **Given** any legacy URL (including `/project/:id/<page>/t/:token`), **When** opened in the new app, **Then** it redirects to the new route and shows the same data.
2. **Given** a project, **When** the user switches tools, **Then** the global bar, rail and timeline don't remount, and the URL reflects tool and tab.
3. **Given** a 390px-wide phone, **When** any project screen is open, **Then** navigation and the primary action are in the bottom 35% of the viewport.
4. **Given** a viewer share token, **When** a page loads, **Then** it behaves exactly as in the legacy app (same role limits).

---

### User Story 2: Every page restyled to the design system (Priority: P1)

Every page uses Blueprint tokens (no hard-coded colors), a page header with one primary action in the fixed place, tools as tabs held in the URL, and a layout that works at 390px. Behavior is unchanged.

**Independent Test**: Visual review against the prototypes at 1440 and 390. The token lint reports zero raw colors. axe shows no serious or critical issues.

---

### User Story 3: Organization library and admin in their own area (Priority: P2)

The Standards Library, Tech Stacks, Build Books, Gallery, settings and admin move under `/library` and `/settings`, in a layout that looks clearly different from projects. They're restyled, with the same behavior.

---

### User Story 4: Versions and changes after the first release (Priority: P2)

Approach 3 in full: version timeline, First release, changes scheduled into versions, a change page, a locked released baseline, and in-order release with carry-over. Built new. **Needs backend B1.**

---

### User Story 5: Team portfolio for existing applications (Priority: P2)

Option B: a team switcher in the header, the team portfolio, the application page for 15+ repos, mesh runs by day (PRs to the default branch) with evidence, packs, policy, and All teams for organization admins. Roles like GitHub (team owners and members). Built new. **Needs backend B2.**

---

### User Story 6: Onboard an existing application (Priority: P3)

Five steps: Team & app → Connect repos → Run in sandbox → Review output → Open pull requests. The generated mesh CI matches each repository's platform (GitHub Actions or Azure Pipelines) and runs on PRs to the default branch. Built new. **Needs backend B3.**

---

### User Story 7: Cut over and retire the legacy frontend (Priority: P3)

When the regression gate passes, the new app takes the primary host and `app/frontend/` is removed. Because the app isn't live yet, there's no transition period and no "Classic" host. Legacy URL redirects are kept for internal testers' links.

### Edge Cases

- **Someone changes the legacy app during the redesign:** not expected, because the app isn't live and feature work moves to `app/frontend-new/`. Any fix still needed is made in the new app.
- **A legacy page renders its own full-screen layout** (for example Canvas or Build with resizable panels): the shell gives it a "full-bleed" content area, and the page keeps its internal layout.
- **A legacy dialog is the only way to do something:** it stays (redesign route). It is listed for Phase R if it breaks the UX principles.
- **A project with no versions** (before B1): the timeline shows one "Building" version.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001** One persistent shell through layout routes. Restyled pages MUST NOT render `PrimaryNav`, `ProjectSidebar` or `ProjectPageHeader`.
- **FR-002** Tool and tab MUST live in the URL for every page. Selection and panel state go in the URL where the page already has them in state (cheap wins only; deeper state is Phase R).
- **FR-003** Every page MUST expose at most one primary action through `PageHeader` (top right on desktop, mirrored above the tab bar at ≤768px).
- **FR-004** All colors MUST come from design tokens. Hard-coded Tailwind palette classes and hex values are replaced by semantic tokens (T031).
- **FR-005** Long-running work already surfaced by existing hooks (agent sessions, audits, deployments) MUST also appear in the shell's status pill and status center.
- **FR-006** Every legacy route MUST redirect to its new route (`contracts/routes.md`).
- **FR-007** Page behavior MUST NOT change during restyling, except layout and navigation. Logic changes belong in Phase R or new-capability work.
- **FR-008** New capabilities (US4–US6) MUST follow the full UX principles: inline feedback, undo, URL state, and TanStack Query for their data.
- **FR-009** It MUST meet WCAG 2.2 AA on the shell and new screens. Restyled pages MUST have no new axe violations compared with legacy.
- **FR-010** Light and dark themes come from the same tokens.
- **FR-012** Mesh policy MUST be configurable per check (`issue` default, `notify`, `block`, `off`) by organization admins, with team owners allowed only to tighten. An optional Cyber Risk sandbox stage is configurable per repository (D-15, D-17).
- **FR-013** Organization admins MUST be able to configure integration identities on **Admin → Integrations**: the GitHub App and an Azure DevOps connection (service connection or PAT, secrets in Key Vault) (D-18).
- **FR-011** The shell and new-capability screens MUST use translation keys (English only for now) so French can be added later without rework (D-16). Existing pages are extracted when French is scheduled.

### Compatibility & Operational Requirements

- **CR-001** `app/frontend/` keeps running unchanged as the reference for the regression suite until US7. It receives no feature work (pre-go-live pivot).
- **CR-002** No existing `/api/v1` contract changes. New endpoints are additive.
- **CR-003** All legacy routes and share-token links resolve in the new app.
- **CR-004** **Constitution Principle VI** must be amended (with written client approval) before implementation: scope it to `app/frontend/src/**` until cutover, and name `contracts/design-system.md` as the layout contract for `app/frontend-new/`.
- **CR-005** Own container, CI job and host (`next.<domain>`) for independent deploy and rollback.
- **CR-006** New tables in numbered migrations from `012_`.

### Key Entities

Reused unchanged: everything the legacy app uses. New for US4–US6: see `data-model.md` (B1 versions and changes, B2 teams, applications and mesh, B3 onboarding).

## Success Criteria *(mandatory)*

- **SC-001** 100% of the regression checklist (`contracts/routes.md` §2) passes on the new app before cutover.
- **SC-002** Zero shell remounts on navigation (Profiler-based test).
- **SC-003** Zero raw colors outside `src/design/` (token lint).
- **SC-004** No new serious or critical axe violations compared with legacy. The shell and new screens have none at all.
- **SC-005** At 390×844, the primary action and navigation are in the bottom 35% on every project route.
- **SC-006** Redesign milestone (US1–US3) delivered in ≈ 3–4 calendar weeks with 5–6 agents in parallel.

## Assumptions

- The app isn't live yet, so no users need a transition period or a classic version.
- APIM, CORS and the Entra app registration can add the `next.<domain>` host.
- The GitHub App (`githubAppAuth.ts`) can get `pull_requests: write` for onboarded repos (US6).
- Standards packs and the reusable mesh workflow live in `goa-standards/assurance-mesh` (US5, US6).
