# Tasks: Pronghorn Frontend Redesign (`app/frontend-new`)

**Input**: `/specs/007-frontend-new/` ([plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/))
**Route**: **Redesign** (fork, restyle, new shell). See research D-1. Work packages are in [agents.md](./agents.md).

**Tests**: REQUIRED (Constitution III). The regression gate is a Playwright smoke suite written **first against the legacy app** (T017) and then run against the new app. Each page task ends with its smoke rows (`PR-xx`) green on the new app at 1440 and 390, plus axe. New capabilities have their own E2E (`NV/NA/NO-xx`).

## Format

`- [ ] T### [P?] [US#?] (WP-xx) Description — path`
`FE` = `app/frontend-new/`, `BE` = `app/backend/src/`. **[P]** = can run in parallel.

---

## Phase 0: Governance (blocks everything)

- [X] T000 (WP-F0) Amend `.specify/memory/constitution.md` Principle VI to **UI/UX Layout Contract** (v1.1.0 → **2.0.0**, MAJOR, because a principle is redefined): `contracts/design-system.md` + prototypes are the contract for `app/frontend-new/`, and the legacy `app/frontend/` stays immutable until switch-over. Updated `.specify/templates/plan-template.md`, `.github/copilot-instructions.md`, `.github/instructions/frontend.instructions.md`, `.github/agents/code-review.agent.md`. No client sign-off is required while pre-go-live. A sign-off step can be added once the UI is stable.
- [X] T001 [P] (WP-F0) `.github/instructions/frontend-new.instructions.md` (applyTo `app/frontend-new/**`): the restyle recipe (plan.md), shell ownership, tokens only, "behavior must not change" rule, tests expected.
- [X] T002 [P] (WP-F0) Resolve the open questions in `research.md` with `/speckit.clarify` and record them in `spec.md` → Clarifications.
- [X] T003 [P] (WP-F0) README note: `app/frontend/` receives no more feature work (pre-go-live pivot) and remains only as the regression reference until cutover.

## Phase 1: Fork and setup

- [X] T010 (WP-F1) **Fork:** copy `app/frontend/` → `app/frontend-new/` in one commit ("Fork app/frontend as app/frontend-new"), excluding `node_modules`/`dist`. Rename `package.json` name to `pronghorn-frontend-new`. No other change in this commit.
- [X] T011 (WP-F1) `FE/.env.example`: add `VITE_APP_CHANNEL=next`. Confirm the Entra redirect URI variable for the new host.
- [X] T012 [P] (WP-F1) `FE/Dockerfile` and `FE/nginx.conf` (from the fork) with `/health`, SPA fallback and legacy-path rewrites placeholder.
- [X] T013 (WP-F1) CI: `frontend-new` job in `.github/workflows/ci.yml` (path filter `app/frontend-new/**`: lint, typecheck, unit, build) added to `ci-gate`. UPDATE (fix round 1): the 8 inherited type errors that initially failed the typecheck step have been fixed with minimal, type-only casts (no runtime behavior change) — see the "T013 (WP-F1): fix inherited type errors so the typecheck gate passes" commit for the file-by-file list and the `NOTE(spec-007 Phase R)` comments left at each call site (several reveal pre-existing runtime bugs — dead code, always-undefined values — that were deliberately left as-is per orchestrator decision). `npx tsc -p tsconfig.app.json --noEmit` now exits 0.
- [X] T014 (WP-F1) Build and push the `frontend-new` image in `.github/workflows/platform-deploy.yml`. UPDATE (fix round 1, non-blocking follow-up): `ca-pronghorn-frontend-new` / `module.frontend_new` now also included in `infra/config/rollback-component-sets.json` (application-runtime set) and the rollback snapshot path (`capture-runtime-revisions` + `get-deployment-snapshot.ps1` in `platform-deploy.yml`), mirroring the legacy frontend and no-op'ing (empty revision/image strings) on an environment where the app doesn't exist yet.
- [~] T015 (WP-F1) Terraform `module "frontend_new"` (reuse `infra/modules/frontend`) at `next.<domain>`. API CORS and APIM origins. Entra redirect URI. (BLOCKED-EXTERNAL: terraform apply in each environment, DNS for next.<domain>, Entra redirect URI registration) — code is complete: `module "frontend_new"` (infra/main.tf) reuses `./modules/frontend` with its own UAMI/AcrPull role assignment; `cors_allowed_origins` (API Management module call) and the Entra `redirect_uris` list both include `module.frontend_new.app_url` / `var.frontend_new_app_url_override`; new vars `frontend_new_app_url_override`, `frontend_new_build_vars`, `frontend_new_container_*` (infra/variables.tf); new outputs `frontend_new_uami_id`, `frontend_new_url`, `frontend_new_fqdn`, `frontend_new_build_env_vars` (infra/outputs.tf). Validated with `terraform fmt -check -recursive`, `init -backend=false`, and `validate` via `hashicorp/terraform:1.11` in Docker (all pass; 1.9/1.10 fail on unrelated AVM submodule `required_version` floors, unrelated to this change).
- [X] T016 [P] (WP-F6) Playwright harness shared by both apps: `e2e/` at repo root or `FE/e2e/` with `BASE_URL` switch, `fixtures.ts` (mock auth, share tokens), `seed.sql`, and a docker compose profile `e2e`.
- [X] T017 (WP-F6) **Legacy smoke suite**, written and passing **against `app/frontend`**: one spec per regression row PR-01…PR-21 (page loads, main read, main write, reload). Files `e2e/regression/pr-xx.spec.ts`. This is the regression gate.
- [X] T018 [P] (WP-F1) Token lint (`FE/eslint.config.js` custom rule): report raw Tailwind palette classes and hex outside `src/design/**`. Warn mode now, error mode after T031.

## Phase 2: Foundation, design system and shell (blocks page work)

**Checkpoint to exit:** every legacy page opens inside the new shell at its new URL, even if not restyled yet (embedded mode, T034). Redirects work. The shell remount test passes.

- [X] T020 (WP-F2) `FE/src/design/tokens.css` (Blueprint light and dark), and **re-point** the variables in `FE/src/index.css` per `contracts/design-system.md` §1.1.
- [X] T021 (WP-F2) `FE/src/design/tailwind-preset.ts` wired into `FE/tailwind.config.ts`: new color groups (`ok`, `warn`, `bad`, `define`, `design`, `build`, `ship`, `mesh-*`, `rail-*`, `*-soft`), IBM Plex fonts, radius 4px, density.
- [X] T022 [P] (WP-F2) Adjust the shadcn primitives in `FE/src/components/ui/` only where variables aren't enough (button heights 40/44px, tabs with an underline indicator, dialog radius, focus ring).
- [X] T023 [P] (WP-F2) Domain atoms `FE/src/components/shell/atoms/` (TypeChip, DeltaChip, MeshDots, StackBadge, PrChip, VersionTag, RepoRow, AdoptionBar, EmptyState) with tests.
- [ ] T024 (WP-F3) `AppShell`, `GlobalBar`, `ModeBadge`, `StatusPill` — `FE/src/components/shell/`.
- [ ] T025 [P] (WP-F3) `Rail`, `PhaseNode` (collapse pref).
- [ ] T026 [P] (WP-F3) `TimelineStrip` (one "Building" version until B1).
- [ ] T027 [P] (WP-F3) `PageHeader`, `PrimaryActionSlot`, `MobileTabBar`.
- [ ] T028 [P] (WP-F3) `ActionButton`, `NextStepBanner`, `Disclosure`, `Stepper`, `Inspector`, `FilterChips`.
- [ ] T029 [P] (WP-F3) `UndoBar` + `useUndo`, `StatusCenter` + `useLongTask` — `FE/src/lib/state/`.
- [X] T030 (WP-F2b) Codemod `scripts/codemods/colors-to-tokens.ts` with the mapping table from `contracts/design-system.md` §1.1, a dry-run report and a list of unmapped cases.
- [X] T031 (WP-F2b) Run the codemod on `FE/src/components/**` and `FE/src/pages/**` in area batches (one commit per area). Fix unmapped cases. Switch the token lint (T018) to error mode. Unit tests stay green. Applied: see `specs/007-frontend-new/codemod/colors-dry-run.md` "Applied (T031)" section for final counts and the manual fixes. Along the way: extended the codemod's mapping tables to close all 295 originally-unmapped tokens (broadened shade ranges + 5 new hue groups, unit-tested); found and fixed a real codemod bug (a `cn(...)` call nested inside `className={cn(...)}` was edited twice, corrupting the file — verified the 3 areas already committed before the fix were unaffected); extended the token lint rule to also see object-literal property values and template-literal expressions (its own T030-documented blind spots), with a per-file dedupe and new rule tests; added a `--ide-*` token group to `tokens.css` for a recurring fixed VS-Code-style palette across the code/file-browsing widgets; hand-fixed or `eslint-disable`d (with a reason each) the remainder — Canvas 2D/D3 graph-node colors, PNG/PDF export backgrounds, PowerPoint's own OOXML theme colors, and one Recharts attribute-selector false positive. `token-lint/no-raw-tailwind-colors` is now `"error"` in `eslint.config.js`, and `npm run lint` reports 0 token-lint problems.
- [ ] T032 (WP-F3) `FE/src/lib/state/useUrlState.ts`, `useUiPrefs.ts` with tests.
- [ ] T033 (WP-F3) Router: convert `FE/src/App.tsx` to `createBrowserRouter` in `FE/src/app/router.tsx`, with layouts in `FE/src/app/layouts/`, a **route metadata registry** `FE/src/app/routes/*.tsx` (`phase`, `tool`, `title`, `usePrimaryAction`), all legacy redirects per `contracts/routes.md` §1 (including `/t/:token`), and NotFound.
- [ ] T034 (WP-F3) **Embedded mode (transitional):** `ShellContext` with `embedded=true` inside the new layouts. `components/layout/PrimaryNav`, `ProjectSidebar` and `ProjectPageHeader` render `null` when embedded, so every legacy page works in the shell from day one. Removed in T070.
- [ ] T035 (WP-F5) Long-task bridge: register existing runs with `useLongTask`, using `useProjectAgent`, `useAuditPipeline`, `useRealtimeDeployments` and the agent session hooks, so they appear in the status pill and center. No page changes.
- [ ] T036 [P] (WP-F3) ⌘K palette (projects, tools, library).
- [ ] T038 [P] (WP-F3) Translation-ready setup (D-16): `react-i18next` with `FE/src/i18n/en.json`, used by the shell and all new-capability screens. English only. No extraction of existing pages.
- [ ] T037 (WP-F6) Foundation E2E: `e2e/shell/remount.spec.ts`, `redirects.spec.ts` (every row of routes §1), `mobile-reach.spec.ts`, axe on the shell.

## Phase 3: US1 + US2, restyle the Builder pages (P1) 🎯 MVP

Each task applies the **move and restyle recipe** (plan.md) to one page: remove the page's own nav, add route metadata + primary action, put tabs in the URL, finish the token fixes, adjust for 390px, register long runs, and pass its regression rows at 1440 and 390 + axe (no new violations).

- [ ] T040 [P] [US1] (WP-P2) Projects home — `FE/src/pages/Dashboard.tsx` → route `/projects`. PR-01.
- [ ] T041 [US1] (WP-P3) `ProjectLayout` loader (project, role, current version) + Project settings `FE/src/pages/project/ProjectSettings.tsx` + access banner in the shell. PR-02, PR-03.
- [ ] T042 [P] [US2] (WP-D1) Requirements `pages/project/Requirements.tsx`. PR-04.
- [ ] T043 [P] [US2] (WP-D2) Project standards `pages/project/Standards.tsx`. PR-05.
- [ ] T044 [P] [US2] (WP-D3) Artifacts `pages/project/Artifacts.tsx` (+ collaboration views). PR-06.
- [ ] T045 [P] [US2] (WP-D4) Chat `pages/project/Chat.tsx`. PR-07.
- [ ] T046 [P] [US2] (WP-G1) Canvas `pages/project/Canvas.tsx` in a full-bleed content area. Palettes and properties panels become an `Inspector`/`Sheet` on phones. PR-08.
- [ ] T047 [P] [US2] (WP-G2) Specifications `pages/project/Specifications.tsx`. PR-09.
- [ ] T048 [P] [US2] (WP-B1) Build agent `pages/project/Build.tsx` (full-bleed, resizable panels kept, tabs in the URL). PR-10.
- [ ] T049 [P] [US2] (WP-B2) Repository `pages/project/Repository.tsx`. PR-11.
- [ ] T050 [P] [US2] (WP-B3) Database `pages/project/Database.tsx` (import wizard unchanged). PR-12.
- [ ] T051 [P] [US2] (WP-S1) Deploy → Environments `pages/project/Deploy.tsx`. PR-13.
- [ ] T052 [P] [US2] (WP-S2) Audit `pages/project/Audit.tsx`. PR-14.
- [ ] T053 [P] [US2] (WP-S3) Present `pages/project/Present.tsx`. PR-15.

## Phase 4: US3, restyle library, settings, public (P2)

- [ ] T060 [P] [US3] (WP-L1) Standards Library `pages/Standards.tsx` → `/library/standards`. PR-16.
- [ ] T061 [P] [US3] (WP-L2) Tech Stacks `pages/TechStacks.tsx`. PR-17.
- [ ] T062 [P] [US3] (WP-L3) Build Books `pages/BuildBooks.tsx`, `BuildBookDetail.tsx`, `BuildBookEditor.tsx`. PR-18.
- [ ] T063 [P] [US3] (WP-L4) Gallery `pages/Gallery.tsx`. PR-19.
- [ ] T064 [P] [US3] (WP-L5) Settings, admin, superadmin, auth pages (`pages/Settings.tsx`, `pages/Auth*.tsx`, `GitHubCallback.tsx`). PR-20.
- [ ] T065 [P] [US3] (WP-P1) Landing, Terms, Privacy, License, PWA prompt, theme toggle. PR-21.

## Phase 5: Clean-up and cutover (US7)

- [ ] T070 (WP-X0) Remove embedded mode (T034) and delete `FE/src/components/layout/{PrimaryNav,ProjectSidebar,ProjectPageHeader}.tsx` once no page imports them.
- [ ] T071 (WP-X0) Full regression run (PR-01…PR-22) on staging at 1440 and 390, recorded in `specs/007-frontend-new/checklists/regression.md`.
- [ ] T072 (WP-X1) nginx rewrites for legacy paths (for internal testers' links).
- [ ] T073 (WP-X2) Switch the primary host to `frontend-new` (Terraform, Front Door or App Gateway, Entra redirect URIs).
- [ ] T074 (WP-X2) Remove `app/frontend/`, its CI job and its Terraform instance right after the switch (not live yet, so no transition period). Update the constitution, README and instructions.

## Phase 6: Backend B1, versions and changes (parallel from M0)

- [X] T100 (WP-BE1) Migration `infra/migrations/012_versions_work_items.sql` per `data-model.md` §1.
- [X] T101 (WP-BE1) `BE/routes/versions.ts`, `BE/routes/workItems.ts`, mounted in `BE/routes/v1/index.ts`, with token auth. Tests.
- [X] T102 (WP-BE2) `BE/services/versions/releaseService.ts` (in order, carry-over, merge reviewed branches into the default branch, notes, tag, deploy, first release) + staging `branch` dimension in `BE/utils/staging.ts` with legacy tests unchanged.
- [X] T104 (WP-BE2) `BE/services/versions/branchService.ts`: create the **real Git branch** for a change when it is scheduled or accepted, and route its commits there (D-9). Tests with a mocked GitHub API.
- [X] T103 [P] (WP-BE1) Realtime `versions-{projectId}`, `work-item-{id}`.

## Phase 7: US4, versions and changes UI (P2, built new)

- [ ] T110 [US4] (WP-V1) Timeline from `/versions` + All versions route with triage (hotfix and next suggestion). NV-01, NV-02.
- [ ] T111 [US4] (WP-V2) Change page with step bar, bug report, deltas, scoped canvas, branch and agent, checks, version picker. NV-03, NV-04.
- [ ] T112 [US4] (WP-V3) Release tool: first-release checks, release in order with carry-over, two-step confirm. NV-05.
- [ ] T113 [US4] (WP-V4) Version scoping for phase tools: released = read-only banner; an open version shows its changes' deltas above the existing tool. NV-06.
- [ ] T114 [US4] E2E `e2e/new/us4.versions.spec.ts`.

## Phase 8: Backend B2, teams, applications, mesh

- [X] T120 (WP-BE3) Migrations `013_teams_applications.sql`, `014_assurance_mesh.sql`. Team roles `owner`/`member`. All teams for organization admins (D-8).
- [X] T121 (WP-BE3) `BE/routes/teams.ts`, `applications.ts`, `packs.ts` (portfolio aggregate in one query). Tests.
- [X] T122 (WP-BE4) `BE/routes/mesh.ts`: HMAC-verified ingest of PR runs to the default branch, baseline ratchet, evidence, exceptions, policy per check (`issue` default, `notify`, `block`, `off`; org admins set it, team owners only tighten) and the optional Cyber Risk sandbox flag per repository (D-15, D-17). Tests. **Security review.**
- [X] T126 (WP-BE8) Integrations config (D-18): migration `016_integrations.sql` (`integration_connections`: provider `github_app`|`azure_devops`, auth type `service_connection`|`pat`, Key Vault secret ref, org scope), `BE/routes/admin/integrations.ts` (org admins only; test connection), used by the onboarding import, PR and issue services. Tests. **Security review.**
- [X] T125 (WP-BE4) `BE/services/mesh/issueService.ts`: open a GitHub issue or Azure DevOps work item for new findings when the policy is `issue` (D-15). Tests with mocked providers.
- [X] T123 (WP-BE4) `BE/services/github/updatePrs.ts` (GitHub App, bump the manifest, keep local edits). Tests.
- [X] T124 [P] (WP-BE4) Realtime `team-{teamId}`. "Not reporting" after 7 days.

## Phase 9: US5, Assurance console (P2, built new)

- [ ] T130 [US5] (WP-A1) `AssuranceLayout`, TeamSwitcher (header only), team portfolio. NA-01, NA-02.
- [ ] T131 [US5] (WP-A2) Application page (adoption bar, grouped grid, group actions, exceptions). NA-03, NA-04.
- [ ] T132 [US5] (WP-A3) Mesh runs by day (PRs to the default branch, open and merged) and evidence. NA-05.
- [ ] T133 [P] [US5] (WP-A4) Packs, policy, exceptions. NA-06.
- [ ] T134 [P] [US5] (WP-A5) All teams. NA-07.
- [ ] T136 [P] [US5] (WP-A6) **Admin → Integrations** page: GitHub App status, Azure DevOps connection (service connection or PAT), test connection, and the mesh policy per check (issue, notify, block, off) with the Cyber Risk sandbox toggle. NA-08.
- [ ] T135 [US5] E2E `e2e/new/us5.assurance.spec.ts` (15-repo seed).

## Phase 10: Backend B3, onboarding and the mesh workflow

- [x] T140 (WP-BE5) Migration `015_onboarding.sql`. `BE/routes/onboarding.ts` (runs, repository import from GitHub and Azure Repos, selection, output, PRs, cancel). Tests. **Security review.**
- [ ] T141 (WP-BE6) Sandbox job image `infra/onboarding-sandbox/` + `BE/services/onboarding/jobDispatcher.ts` + Terraform Container Apps Job with restricted egress. Detects each repo's CI provider and generates the mesh CI for **GitHub Actions or Azure Pipelines** (D-12).
- [~] T142 (WP-BE7, external repo) `goa-standards/assurance-mesh`: reusable **GitHub Actions** workflow `mesh.yml@v3` **and Azure Pipelines template** `templates/mesh.yml`, both triggered on PRs to the default branch (Green, Yellow, Red, Blue), with the optional **Cyber Risk sandbox stage** (D-17), policy-driven issue/block outcome, signed reports, packs, stack profiles. (BLOCKED-EXTERNAL: create the goa-standards/assurance-mesh repo, move external/goa-standards-assurance-mesh/ into it, tag v3, and run the sample GitHub and Azure Repos PRs to verify a signed report shows in the portfolio) — all code done, see external/goa-standards-assurance-mesh/README.md.

## Phase 11: US6, onboard an app (P3, built new)

- [ ] T150 [US6] (WP-O1) Wizard steps 1–2. NO-01, NO-02.
- [ ] T151 [US6] (WP-O2) Steps 3–5 with the live sandbox log, output review and PRs. NO-03…NO-05.
- [ ] T152 [US6] E2E `e2e/new/us6.onboarding.spec.ts` (sandbox mocked in CI; real run documented in `quickstart.md`).

## Phase 12: Polish

- [ ] T160 [P] Accessibility pass on the shell and new screens (keyboard, screen reader labels for MeshDots and TimelineStrip).
- [ ] T161 [P] Copy pass per `contracts/design-system.md` §4 on shell and new screens.
- [ ] T162 [P] `specs/007-frontend-new/quickstart.md`: run, E2E, mock auth, seed.

## Phase R: Optional page rewrites (after cutover, one spec each)

- [ ] T170 Apply the research D-14 criteria and pick the pages. Current candidates: Canvas, Artifacts, Repository, Build, Chat.
- [ ] T171 For each selected page, create `specs/0xx-rewrite-<page>/` with `/speckit.specify` (goals: inline feedback instead of toasts, inspector instead of dialogs, URL-held state, TanStack Query).

## Dependencies

```
Phase 0 ─► Phase 1 ─► Phase 2 ─► Phase 3 (14 pages in parallel) ─┐
                                 Phase 4 (6 pages in parallel)   ├─► Phase 5 cutover
                                                                 ┘
Phase 0 (T002) ─► Phase 6 (B1) ─► Phase 7 (US4)
               ─► Phase 8 (B2) ─► Phase 9 (US5) ─┐
               ─► Phase 10 (B3, needs B2) ───────┴─► Phase 11 (US6)
```

- **T017 (legacy smoke) must be green on the legacy app before any page task starts**, because it's the regression gate.
- **T034 (embedded mode) lets every page run in the shell before it's restyled**, so Phase 3 and 4 tasks are independent and fully parallel.
- The cutover (Phase 5) doesn't wait for US4–US6. They can ship after it.
