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
| T120 | done | 81cf4be | WP-BE3. mesh_policy.scope adds `repository` (needed by D-17) |
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
