# Progress: spec 007 (frontend redesign)

Orchestrated per `.github/prompts/007-frontend-new.orchestrate.prompt.md`.
Branch: `feature/frontend-new` (from `design/frontend-redesign`). WP branches: `wp/<WP-ID>`.
Worktrees: `../PRONGHORN-BLUE-wt/<WP-ID>`.

**Resume here:** read this file and `tasks.md`, then continue with the current wave.

## Current state

- **Wave:** 2 (resumed 2026-09-26 evening on a local macOS machine). Remote `origin` = ichagas/builder
- **Open blockers:** none in code. Spend limit hit twice (see wave log).
- **Baseline (before fork, 2026-09-25):** legacy FE lint 0 errors / 102 warnings, 307 unit tests pass, build OK. BE build OK, 489 tests pass. Docker available. Terraform CLI **not installed** (terraform fmt/validate cannot run locally).

## Tasks

| Task | Status | Commit | Notes |
|---|---|---|---|
| T000–T002 | done | (pre-existing) | F0, done before this run |
| T010 | done | 111538a | Fork copy only, done by the orchestrator (mechanical copy) |
| T010 rename | done | 6bd0e9d | WP-F1 |
| T003 | done | 6967f28 | WP-F1 (F0 leftover) |
| T011 | done | d556d6c | WP-F1 |
| T012 | done | a42fd6d | WP-F1. docker build + /health verified |
| T013 | done | e64d017, 64606cd | WP-F1. 8 inherited TS errors fixed type-only with `NOTE(spec-007 Phase R)` comments; 3 are real legacy runtime bugs (SourceRequirementsUpload .update, TechStackCard count, BuildBookEditor .not, Audit dead error checks) left unchanged |
| T014 | done | 6f45ab1, 783570c | WP-F1. Rollback snapshot includes frontend-new |
| T015 | BLOCKED-EXTERNAL | 3f84b12 | WP-F1. Validated with docker hashicorp/terraform:1.11. Human: terraform apply, DNS next.<domain>, Entra redirect URI |
| T018 | done | b97040d, 1d7305a | WP-F1. Warn mode (941 warnings) |
| T126 | done | 53b1c04, f012d9b, 5b7f35e | WP-BE8. Secret store fails closed in production (503). Key Vault Secrets Officer role assignment for the API identity is in infra/main.tf: BLOCKED-EXTERNAL (terraform apply) |
| T120 | done | 81cf4be | WP-BE3. mesh_policy.scope adds `repository` (needed by D-17) |
| T100 | done | fe0b9d6 | WP-BE1 |
| T101 | done | 06bef20, 928c984 | WP-BE1. Fix round 1: non-UUID token → 403, atomic WI key (advisory lock), semver ordering. Release endpoints are a 501 stub until BE2 |
| T103 | done | 06bef20 | WP-BE1. Extra events work_item_created/updated |
| T142 | BLOCKED-EXTERNAL | 92578d7, 5880ecb, 7eedbf8 | WP-BE7. Content in external/goa-standards-assurance-mesh/. Human: create repo, move content, tag v3, replace placeholder mesh_scripts_ref SHA, run sample GitHub + Azure Repos PRs |
| T122–T125 | done | 3b9431c, 0e4d61a, 8f1ff15, a171714, 05b6c70, 3abdca1, 3cf26ee, 411f02d, 9f5188d | WP-BE4. Fix round 1: route-scoped raw body (413 before parse), report_url validation, Markdown/HTML/@mention escaping in issues, repo-scoped GitHub App tokens, Azure DevOps via BE8 `getAzureDevOpsClient` |
| T020–T023 | done | 4fdb817, 7b4345d, d93a5b6, 3da919f, 35d4fa9, d8a7ff8, 65ffc24, b0fd31c, c5da929, 7ac7f14 | WP-F2. 9 atoms (RepoRow added per contract). Fix round 1: radius key s→xs (Tailwind `rounded-s` collision), TypeChip font, RepoRow ≤900px collapse, light contrast (ok #13803D→#127B3B, warn #B45309→#B05109, dark ink on mesh green/yellow), D-19 fonts via Google Fonts |
| T102, T104 | done | 910f589, 74aefe9, ad830f7, 968742d, 6779f30, 7533733 | WP-BE2. Fix round 1: release() gated by releaseChecks, advisory lock + FOR UPDATE, carry-over reuses version by name, staging partitioned by branch (migration 018), branch-scoped unstage/discard. Follow-up (low): release and WI-key advisory locks share the hashtext(projectId) key space |
| T016, T017 | done | ef1b586, 98e9221, 83759f7, 4efeb81, 96282a1 | WP-F6. PR-01..PR-21 54/54 green on legacy (1440 + 390), twice on a fresh stack; axe-legacy.json baseline (46 rows; 2 rows ±1 node run to run). Specs are app-agnostic (routes.ts urlPattern helpers). T037 still open (after F3) |
| T121 | done | f0f9c98 | WP-BE3. Portfolio query 3.9–15.8 ms on 15-repo seed. Team membership CRUD not in api.md; not built |
| T140 | done | a9bed2a, 499abc6, 903cb5e, 1a3376f, d60bc7e, 9d74be6 (+ rounds 1–2) | WP-BE5. Opus escalation (round 3). Migrations 015, 019, 020, 021. Org repository scope enforced at selection, before PRs, and at the credential boundary. Reviewer APPROVE, security PASS (no findings) |

## Escalations to Opus 5.5

- **WP-BE5 (T140), fix round 3** — reason: two Sonnet fix rounds, reviewer still CHANGES REQUIRED. Blocking: mesh issueService still parses Azure full_name as 2 segments after round 2 moved it to `<adoOrg>/<project>/<repo>`. Also: PR lease not renewed during long runs, silent ON CONFLICT no-op in the race, missing blocked-path tests, one-github_app-per-org without a DB constraint. Asked for one shared full_name parser used everywhere (incl. BE7 templates) and migration 020.

## Deviations from the spec

- WP-F2: light-theme `--ok` and `--warn` darkened slightly to meet AA on their -soft backgrounds; contracts/design-system.md §1 updated.
- WP-F2: T023 includes RepoRow (listed in the contract, missing from tasks.md).
- WP-BE2: two SQL-text assertions in the legacy `utils/staging.test.ts` updated for the (repo_id, file_path, branch) unique key (migration 018); other legacy staging tests unchanged.

- T010: the package rename is in the commit after the copy (per the orchestrate prompt), not in the copy commit.

## Wave log

- **Wave 1 dispatched** (developers, Sonnet 5, worktrees under `../PRONGHORN-BLUE-wt/`): F1, F6 (T016–T017 only; T037 after F3), BE1, BE3, BE7. T003 (F0 leftover) assigned to F1.
- **Merged WP-BE3** (tester PASS, reviewer APPROVE). BE build OK, 510 tests.
- **Wave 2 backend started early** (BE3 merged): BE4, BE8 developers dispatched.
- **2026-09-25 ~23:30: monthly spend limit hit (HTTP 429)**; all running agents stopped mid-task (F6 dev at PR-03, BE1 fix round 1, BE4 dev, BE8 dev, F1 tester/reviewer, BE7 tester). Uncommitted work stays in each worktree. Resumed 2026-09-26 06:45.
- Pending when interrupted: BE7 security fixes (pin mesh-scripts checkout + actions to SHA, don't swallow npm install errors); F1 fix (8 inherited TS errors make the CI typecheck step fail); BE1 fix round 1 (non-UUID token → 500; WI key race; semver ordering).
- **Merged WP-BE1** (tester FAIL → fix round 1 → verified by orchestrator: BE 579 tests). **Merged WP-BE7** (security PASS w/ findings → fixed; tester PASS; reviewer APPROVE). BE2 dispatched.
- **Merged WP-F1** (tester PASS, reviewer CHANGES REQUIRED → fix round 1 → verified: FE lint 0 errors, tsc OK, 330 tests, build OK). F2 and F2b (T030 only) dispatched.
- **Merged WP-BE8** (tester FAIL + reviewer CHANGES REQUIRED + security PASS/medium → fix round 1 → verified: BE 652 tests). BE5 dispatched (deps BE3, BE8 merged).
- **2026-09-26 ~11:10: spend limit hit again (HTTP 429)**; stopped: F6 dev (PR-04..07 written, rerunning), F2 dev (tokens.css in progress), F2b dev (codemod starting), BE2 dev (1 commit + WIP), BE5 dev (reading), BE4 tester. BE4 reviewer APPROVE, security PASS (medium: parse-before-size-check on /mesh/runs; low: report_url validation, repo-scoped GitHub token, markdown escaping). Resumed 12:08.
- **2026-09-26 ~12:40: PAUSED by the user** ("complete all work until now, update progress, commit, stop"). Agents told to finish their current task, commit and stop. No new WPs dispatched.

## Paused state (resume from here)

Paused 2026-09-26 (second pause) on the user's instruction: in-flight agents finished their current item, committed and stopped. All worktrees are clean; every `wp/*` branch is pushed to origin.

**Merged on `feature/frontend-new`:** F1, F2, F6, BE1, BE2, BE3, BE4, BE7, BE8 (+ T003, T010). Validation at last merge: backend build OK, **806 tests**; frontend-new lint 0 errors, tsc OK, **405 tests**, build OK. Migrations in use: 012–018 on feature; 019 on wp/BE5. Next free migration: **020** (reserved for BE5 item 5).

Environment notes for a fresh container: start `dockerd` and `pg_ctlcluster 16 main start`; recreate worktrees with `git worktree add ../PRONGHORN-BLUE-wt/<WP> wp/<WP>` (they live at `/home/user/PRONGHORN-BLUE-wt/`). Give parallel E2E agents distinct COMPOSE_PROJECT_NAME and ports, and tell them to export `API_PORT` for the Playwright process too (e2e/lib/config.ts reads it) and to kill only their own PIDs.

| WP | Branch head | State | Next step |
|---|---|---|---|
| **F2b** | 59dd4e8 | T030–T031 done: 840 mapped / 0 unmapped, token lint in **error** mode, 410 FE tests. Tester PASS (color-only diff verified on 106 files; PR-01..21 54/54 on frontend-new; axe no worse). Reviewer CHANGES REQUIRED. Fix round 1 **not started** (dev only read files) | Fix round 1: (1) document `--ide-*` in contracts/design-system.md; (2) categorical legends (AgentFlow colorMap, DatabaseSchemaSelector type icons, CanvasNode 23 node types) must not read as status. **Revisit decision:** `--chart-1..6` exist but alias primary/ok/warn/bad/c-define/c-design, so they don't solve it — add a real categorical palette to the contract/tokens (or use -soft/opacity variants + icons); (3) Canvas MiniMap colors from tokens at runtime; (4) Landing gradients need a second stop. Then re-review; merge before F3 |
| **F3** | b70d032 | T024–T029, T032–T034, T036, T038 done, 524 FE tests. Reviewer APPROVE. Tester PASS on the shell gate: 68/68 redirect assertions, remount 0, shell adds no axe violations (`e2e/baselines/axe-new-f3.json`). Regression with APP=new: 34/54 — the 20 failures are PR-01/02/04/05/06/09/12/13/14/15 asserting the page `<h1>` that embedded mode nulls (legacy ProjectPageHeader); fixed by each page's restyle, not a shell bug. Screenshots not taken. Branch also carries a copy of `e2e/` (identical to feature's plus 5 new files) | Small follow-ups before merge: focus `#page` on route change; `usePageRoute()` helper so restyles read title/primary action from the route registry; remove the dead `/assurance/all` link in NotFound; README note on `API_PORT` for Playwright. Take screenshots. Merge after F2b (expect conflicts only where F3 touched legacy files: PrimaryNav/ProjectSidebar/ProjectPageHeader, useShareToken) |
| **BE5** | 499abc6 | T140. Rounds 1–2 (Sonnet) + round 3 (**Opus escalation**) items 1–2 committed: one shared full_name parser (`services/repositories/fullName.ts`; GitHub `owner/repo`, Azure `adoOrg/project/repo`) used by mesh ingest, issueService, updatePrs, githubAppAuth, onboarding; BE7 template now sends the canonical Azure full_name; provider derived from full_name (fixed GitHub+Azure Pipelines misrouting); renewable owner-guarded PR lease (migration 019 incl. `pr_lease_owner`). 1076 BE tests; mesh repo tests 34 | Round 3 items 3–5: RETURNING check on the ON CONFLICT guard (0 rows → blocked); tests for the blocked path; migration 020 partial unique index one github_app per org + 23505→409. **Also fix (security, found by Opus):** `setRunRepositories` accepts any GitHub owner/repo — check against the org's github_app owners at selection and before minting the token. Consider case-insensitive ingest lookup. Then re-review + security re-check, merge |

**Next after these:** merge F2b then F3 → F5 (T035) and T037 (shell E2E; partly covered by F3 tester's e2e/shell specs) → wave 3: 20 restyle WPs (each must restore its page heading via the shell PageHeader so its PR row passes on the new app) + BE6 after BE5 → waves 4–5 → polish → T170–T171.

**Legacy bugs carried into the new app (Phase R, not restyle):** BuildBook create never inserts; Gallery clone param mismatch + missing toaster; Gallery titles blank; ProjectSettings name clobber; Chat sidebar toggle has no aria-label (fix in D4).

## Wave log (continued)

- **2026-09-26 16:35: RESUMED** (fresh container: dockerd + Postgres started, worktrees recreated at `/home/user/PRONGHORN-BLUE-wt/<WP>`, BE baseline re-verified 652 tests). Dispatched: F6 dev (PR-14, PR-16..21, axe baseline), F2 dev (T023), F2b dev (877 vs 412 reconciliation), BE2 tester + reviewer, BE4 fix round 1 (rest), BE5 dev (routes, service, JobDispatcher, tests).

- **Merged WP-BE4** (fix round 1 finished; verified by orchestrator: BE build OK, 733 tests on feature/frontend-new). BE2 reviewer CHANGES REQUIRED (release() skips releaseChecks; no advisory lock; carry-over name collision; staging not keyed by branch) → fix round 1 dispatched; decided to fix staging partitioning now (migration 018). F2 T023 done (9 atoms incl. RepoRow per contract) → tester + reviewer. F2b T030 gap closed (a565881): 628 mapped + 295 unmapped = 923 tokens in 89 files; token lint rule has the same object-literal/interpolation blind spots → fix in T031.
- **Merged WP-F2** (tester FAIL: 4 light contrast pairs; reviewer CHANGES REQUIRED → fix round 1 → verified by orchestrator: FE lint 0 errors, tsc OK, 405 tests, build OK). F2b T031 and F3 dispatched (parallel; F3 keeps legacy file edits minimal).
- BE5: tester PASS (826 tests), reviewer CHANGES REQUIRED (no transition locking, report_secret_ref null, default_branch, duplicated token minting, Azure import missing), security FAIL (high: cross-org repo enumeration on /onboarding/github/repos → decided: require teamId, filter by the org's configured GitHub scope) → fix round 1 dispatched.
- F6: T017 done (4efeb81): PR-01..PR-21 54/54 green twice on legacy, axe-legacy.json baseline. Reviewer APPROVE. Legacy bugs recorded in e2e/README.md (restyles keep them; Phase R): BuildBook create never inserts (QueryBuilder.select after insert), Gallery clone param mismatch + missing toaster, Gallery titles blank (project_name alias), ProjectSettings name clobber.
- BE2 fix round 1 done (968742d, 6779f30, 7533733; 652 BE tests; migration 018) → re-review.
- **Merged WP-BE2** (re-review APPROVE; verified by orchestrator: BE build OK, 806 tests on feature/frontend-new).
- **Merged WP-F6** (tester PASS, reviewer APPROVE; tasks.md conflict resolved: kept feature ticks, ticked T016/T017). **T017 gate for restyles is met.**
- F2b T031 done (23 commits to d71b15d): 840 mapped / 0 unmapped, token lint → error, 410 FE tests; new `--ide-*` token group; categorical legends collapsed to tokens → tester + reviewer. BE5 re-review CHANGES REQUIRED (Azure full_name cross-tenant collision, default_branch reset on re-confirm, secret store/resolver env split; + lease instead of held connection, namespaced advisory locks) → fix round 2; security re-check PASS (2 low). F3 committed through T034 (c7606bf).
- **2026-09-26: spend limit hit a third time (HTTP 429)**; stopped BE5 dev (round 2, uncommitted), F3 dev (T036 in progress), F2b tester, F2b reviewer. Container restarted (dockerd + Postgres restarted; worktrees intact; all wp/* branches pushed to origin as backup). Resumed all four via SendMessage.
- BE5 round 2 (b5b45f6, b865655, 205a524, 83bb5ea; migration 019 PR lease; 1028 tests; migrations 001–019 apply on PG16) → review CHANGES REQUIRED → **escalated to Opus 5.5** (round 3).
- F3 done (T024–T029, T032–T034, T036, T038; 524 FE tests): reviewer APPROVE (follow-ups: focus on route change, usePageRoute() registry helper, NotFound dead /assurance/all link); tester running (APP=new regression + redirects). F2b reviewer CHANGES REQUIRED (document --ide-* in contract; categorical legends must use --chart-* not ok/warn/bad; MiniMap hex; flattened gradients); tester running.
- BE5 round 3 (Opus): items 1–2 committed (a9bed2a, 499abc6). F2b fix round 1 not started. F3 tester PASS on shell gate (b70d032).
- **2026-09-26: PAUSED by the user** ("complete all work stopped on last limit reset, update, commit, push, stop").
- **2026-09-26 (evening): RESUMED on a local macOS machine** (not the container). Docker daemon is up (E2E harness via compose works); no native Postgres (use a Docker postgres:16 for migration checks); no Azure CLI (irrelevant: cloud steps stay BLOCKED-EXTERNAL). Worktrees now at `/Users/igorchagas/ideas/PRONGHORN-BLUE-wt/<WP>` (F2b, F3, BE5); merged WPs' worktrees removed. Goal restated by the user: replace the legacy frontend with the new one (cutover, T070–T074). Dispatched: F2b fix round 1 (Sonnet), F3 pre-merge follow-ups (Sonnet), BE5 round 3 items 3–7 incl. the setRunRepositories owner check (Opus, continuing the escalation).
- **Spend limit hit a fourth time (HTTP 429)** right after dispatch; no work lost (worktrees clean). All three resumed via SendMessage.
- BE5 round 3 (Opus) finished items 3–7: 903cb5e (blocked link via RETURNING + tests), 1a3376f (migration 020, one github_app per org, 23505→409), d60bc7e (security: org repository scope at selection → 403, before PRs, and at the credential boundary in pullRequests.ts; new services/onboarding/repositoryScope.ts; Azure gap closed too), 9d74be6 (migration 021, case-insensitive full_name via lower() unique index). Verified by orchestrator: BE build OK, **1110 tests**. Migrations 001–021 apply on postgres:16-alpine. **Next free migration: 022.** Reviewer + security re-check dispatched.
- **Merged WP-BE5** (reviewer APPROVE round 3, security PASS no findings; merged cleanly; verified on feature: BE build OK, **1110 tests**). BE6 (T141) unblocked (BE5 + BE7 merged) → dispatched early. F2b fix round 1 done (4e4a908, de38b9b, 9778267, 2f11dad: --ide-* documented, categorical palette --cat-1..8 with contrast tests, MiniMap via var(--cat-N), Landing gradient stops; verified: lint 0 errors, tsc OK, 465 FE tests, build OK) → re-review.
- **Defect found by orchestrator (453cea9, on feature):** `src/index.css` imported `tokens.css` after `@tailwind`, so CSS dropped the import and every tokens.css-only variable (`--font`, `--mono`, `--ok/--warn/--bad`, `--*-soft`, `--cat-*`, `--ide-*`, …) was undefined at runtime since F2 (T020); F3 screenshots rendered in a serif fallback. Fixed + guard test (`src/design/__tests__/tokens-import-order.test.ts`). **Consequence:** F2b's tester results (color-only, 54/54 on new, axe no worse) and F3's axe baseline were measured without tokens → re-run regression + axe after merging F2b (with the fix), and retake F3 screenshots, before merging F3.
- F3 follow-ups done (ac1b2fc focus #page, e410d0a usePageRoute() + PageHeader default, 3d96682 NotFound link, 99f6591 e2e README API_PORT, 607aae1 screenshots; verified: lint 0 errors, tsc OK, 531 FE tests, build OK). Note: Playwright 1.56.0 needs chromium rev 1194 (installed locally in e2e/ by the F3 agent); the e2e API's default ALLOWED_ORIGINS covers FE ports 8140–8149 only.
- F2b re-review: CHANGES REQUIRED. The 4 round-1 items are fixed. New blocker: `DatabaseSchemaSelector.tsx:752` `text-define bg-define` is 1:1 in light (codemod collapse; phase tokens lack a -soft group). Non-blocking: --cat-4/--cat-8 hues too close to warn/bad; token lint misses arbitrary `-[hsl()/rgb()]` values (Landing.tsx). → fix round 2 (merge feature for the token import fix; fix all same-token text/bg pairs; shift cat-4/cat-8 with a hue-distance test; extend the lint).
