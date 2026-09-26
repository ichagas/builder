# Progress: spec 007 (frontend redesign)

Orchestrated per `.github/prompts/007-frontend-new.orchestrate.prompt.md`.
Branch: `feature/frontend-new` (from `design/frontend-redesign`). WP branches: `wp/<WP-ID>`.
Worktrees: `../PRONGHORN-BLUE-wt/<WP-ID>`.

**Resume here:** read this file and `tasks.md`, then continue with the current wave.

## Current state

- **Wave:** 1
- **Open blockers:** none
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
