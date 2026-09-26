# Progress: spec 007 (frontend redesign)

Orchestrated per `.github/prompts/007-frontend-new.orchestrate.prompt.md`.
Branch: `feature/frontend-new` (from `design/frontend-redesign`). WP branches: `wp/<WP-ID>`.
Worktrees: `../PRONGHORN-BLUE-wt/<WP-ID>`.

**Resume here:** read this file and `tasks.md`, then continue with the current wave.

## Current state

- **Wave:** 1–2 (resumed 2026-09-26 16:35 in a fresh cloud container; remote `origin` = ichagas/builder)
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
| T121 | done | f0f9c98 | WP-BE3. Portfolio query 3.9–15.8 ms on 15-repo seed. Team membership CRUD not in api.md; not built |

## Escalations to Opus 5.5

None yet.

## Deviations from the spec

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

Merged on `feature/frontend-new`: F1, BE1, BE3, BE7, BE8 (+ T003, T010). Backend 652 tests, frontend-new lint 0 errors / tsc OK / 330 tests / build OK.

Unmerged WP branches (worktrees in `../PRONGHORN-BLUE-wt/<WP>`, all clean):

| WP | Branch commits | State | Next step |
|---|---|---|---|
| F6 | ef1b586 T016, 98e9221 + 83759f7 T017 | T016 done. T017: PR-01..PR-13 + PR-15 green on legacy at 1440/390 (32/32). T017 not ticked | Write PR-14 (Audit, deleted as flaky), PR-16..PR-21; run `npm run test:legacy` to produce `e2e/baselines/axe-legacy.json`; tick T017; then tester + reviewer; merge. Finding: `VITE_AUTH_MODE=mock` is dead code in the legacy app; harness seeds the MSAL cache instead. Legacy bug noted: ProjectSettings name field clobbered by a re-sync useEffect |
| F2 | 4fdb817 T020, 7b4345d T021, d93a5b6 T022 | T020–T022 done (344 FE tests, contrast test ≥ 4.5:1). Fonts via Google Fonts link (not self-hosted) | T023 (domain atoms) not started; then tester + reviewer; merge |
| F2b | 7ea3204 T030 | T030 done: codemod + 28 tests + dry-run report `specs/007-frontend-new/codemod/colors-dry-run.md` (412 mapped, 161 unmapped, 23 ambiguous purple). Note: plan estimated 877 palette classes; check the gap | Tester + reviewer; T031 after F2 merges |
| BE2 | 910f589 T104, 74aefe9 T102 | Both done, 609 BE tests. Known limitation: commit isn't yet partitioned by staging branch | Tester + reviewer; merge |
| BE4 | 3b9431c, 0e4d61a, 8f1ff15, a171714, 05b6c70 (+ merge of feature) | T122–T125 done. Tester PASS, reviewer APPROVE, security PASS. Fix round 1 partly done: 3abdca1 (route-scoped raw body for HMAC + report_url validation; 721 BE tests). Agent stopped at pause | Finish fix round: confirm markdown escaping in issue bodies; repo-scoped GitHub App tokens; wire Azure DevOps to BE8 `getAzureDevOpsClient`. Then merge |
| BE5 | 242fec5 (migration 015 only) | T140 partial: migration done and verified; routes/service not started | Routes, service module, JobDispatcher interface, tests; then tester + reviewer + security |

- **2026-09-26 16:35: RESUMED** (fresh container: dockerd + Postgres started, worktrees recreated at `/home/user/PRONGHORN-BLUE-wt/<WP>`, BE baseline re-verified 652 tests). Dispatched: F6 dev (PR-14, PR-16..21, axe baseline), F2 dev (T023), F2b dev (877 vs 412 reconciliation), BE2 tester + reviewer, BE4 fix round 1 (rest), BE5 dev (routes, service, JobDispatcher, tests).

Not started: F3, F5, T031, T037, all of waves 3–5, BE6, polish, T170–T171.
