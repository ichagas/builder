# Regression checklist: spec 007 (frontend redesign)

Regression rows are defined in [contracts/routes.md](../contracts/routes.md) §2. The same Playwright spec (`e2e/regression/pr-xx.spec.ts`) runs against the legacy app (`APP=legacy`, gate T017) and the new app (`APP=new`). Every row must pass on the new app at **1440** (desktop) and **390** (mobile), with axe showing **no new violations** compared with `e2e/baselines/axe-legacy.json`. PR-22 is the new shell, covered by `e2e/shell/*` (`npm run test:shell`).

**Final run for cutover (T071, WP-X0):** pending. X0 fills in the last column after removing embedded mode (T070), on staging when available, otherwise on the local stack (recorded as such).

## Status by row

| Row | Area | Restyle WP | Legacy (T017) | New app, latest run | axe vs legacy | Final (T071) |
|---|---|---|---|---|---|---|
| PR-01 | Projects home | P2 | ✅ | ✅ 1440 / ✅ 390 (batch 2 run) | ✅ better | ☐ |
| PR-02 | Project settings | P3 | ✅ | ✅ / ✅ | ✅ better | ☐ |
| PR-03 | Access | P3 | ✅ | ✅ / ✅ | ✅ better | ☐ |
| PR-04 | Requirements | D1 | ✅ | ✅ / ✅ | ✅ 0 violations | ☐ |
| PR-05 | Project standards | D2 | ✅ | ✅ / ✅ | ✅ better | ☐ |
| PR-06 | Artifacts | D3 | ✅ | ✅ / ✅ | ✅ 0 violations | ☐ |
| PR-07 | Chat | D4 | ✅ | ✅ / ✅ | ✅ better | ☐ |
| PR-08 | Canvas | G1 | ✅ | ✅ / ✅ (G1 restyle) | ✅ better | ☐ |
| PR-09 | Specifications | G2 | ✅ | ✅ / ✅ | ✅ subset | ☐ |
| PR-10 | Build agent | B1 | ✅ | ✅ / ✅ (B1 restyle) | ✅ no new | ☐ |
| PR-11 | Repository | B2 | ✅ | ✅ / ✅ (B2 restyle) | ✅ no new | ☐ |
| PR-12 | Database | B3 | ✅ | ✅ / ✅ (B3 restyle) | ✅ better | ☐ |
| PR-13 | Environments | S1 | ✅ | ✅ / ✅ | ✅ better | ☐ |
| PR-14 | Audit | S2 | ✅ | ✅ / ✅ (S2 restyle) | ✅ no new | ☐ |
| PR-15 | Present | S3 | ✅ | ✅ / ✅ | ✅ better | ☐ |
| PR-16 | Standards Library | L1 | ✅ | ✅ / ✅ | ✅ better | ☐ |
| PR-17 | Tech Stacks | L2 | ✅ | ✅ / ✅ | ✅ better | ☐ |
| PR-18 | Build Books | L3 | ✅ | ✅ / ✅ (L3 restyle) | ✅ 0 violations | ☐ |
| PR-19 | Gallery | L4 | ✅ | ✅ / ✅ (L4 restyle) | ✅ no new | ☐ |
| PR-20 | Settings and admin | L5 | ✅ | ✅ / ✅ (L5 restyle) | ✅ better (auth 0) | ☐ |
| PR-21 | Public | P1 | ✅ | ✅ / ✅ (embedded, not restyled) | — | ☐ |
| PR-22 | Shell (new) | F3, F3b, F6 | n/a | ✅ shell suite 105 passed / 0 failed | ✅ shell axe 0 violations | ☐ |

## Runs

| Date | Branch @ commit | Scope | Result | Axe file |
|---|---|---|---|---|
| 2026-09-26 | feature (F6) | Legacy, PR-01..21 | 54/54 twice | `axe-legacy.json` |
| 2026-09-28 | feature @ 8d11701 (after wave 3 batch 2) | New app: shell suite + all 21 rows, 1440/390, local stack | Shell 105/0; restyled rows 24/24 (run twice, identical); PR-12 and PR-14 fail only on the embedded-mode heading | `axe-new-merged-batch2.json` |
