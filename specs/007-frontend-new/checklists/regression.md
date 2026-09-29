# Regression checklist: spec 007 (frontend redesign)

Regression rows are defined in [contracts/routes.md](../contracts/routes.md) §2. The same Playwright spec (`e2e/regression/pr-xx.spec.ts`) runs against the legacy app (`APP=legacy`, gate T017) and the new app (`APP=new`). Every row must pass on the new app at **1440** (desktop) and **390** (mobile), with axe showing **no new violations** compared with `e2e/baselines/axe-legacy.json`. PR-22 is the new shell, covered by `e2e/shell/*` (`npm run test:shell`).

**Final run for cutover (T071, WP-X0):** run 2026-09-29 on the **local stack, not staging** (staging BLOCKED-EXTERNAL until T015 apply), branch `wp/final-test`, APP=new, one file chunk (max 3 specs) per Playwright call, fresh reseeded stack per chunk and per project. PR-01..21 passed on both viewports; PR-22 and new capabilities had 3 mobile app defects. **Targeted re-run after the N3 review fixes and the mobile shell fixes (2026-09-29, local stack, branch `wp/rerun`, APP=new):** the remount MobileTabBar failure and NO-01 are fixed; NO-03 still fails at 390 (new cause, below); PR-14 mobile is flaky (pre-existing). T071 stays open.

## Status by row

| Row | Area | Restyle WP | Legacy (T017) | New app, latest run | axe vs legacy | Final (T071) |
|---|---|---|---|---|---|---|
| PR-01 | Projects home | P2 | ✅ | ✅ 1440 / ✅ 390 (batch 2 run) | ✅ better | ✅ 1440 / ✅ 390 (re-run 2026-09-29: ✅ / ✅) |
| PR-02 | Project settings | P3 | ✅ | ✅ / ✅ | ✅ better | ✅ 1440 / ✅ 390 |
| PR-03 | Access | P3 | ✅ | ✅ / ✅ | ✅ better | ✅ 1440 / ✅ 390 |
| PR-04 | Requirements | D1 | ✅ | ✅ / ✅ | ✅ 0 violations | ✅ 1440 / ✅ 390 |
| PR-05 | Project standards | D2 | ✅ | ✅ / ✅ | ✅ better | ✅ 1440 / ✅ 390 |
| PR-06 | Artifacts | D3 | ✅ | ✅ / ✅ | ✅ 0 violations | ✅ 1440 / ✅ 390 |
| PR-07 | Chat | D4 | ✅ | ✅ / ✅ | ✅ better | ✅ 1440 / ✅ 390 |
| PR-08 | Canvas | G1 | ✅ | ✅ / ✅ (G1 restyle) | ✅ better | ✅ 1440 / ✅ 390 (re-run 2026-09-29: ✅ / ✅) |
| PR-09 | Specifications | G2 | ✅ | ✅ / ✅ | ✅ subset | ✅ 1440 / ✅ 390 |
| PR-10 | Build agent | B1 | ✅ | ✅ / ✅ (B1 restyle) | ✅ no new | ✅ 1440 / ✅ 390 |
| PR-11 | Repository | B2 | ✅ | ✅ / ✅ (B2 restyle) | ✅ no new | ✅ 1440 / ✅ 390 (re-run 2026-09-29: ✅ / ✅) |
| PR-12 | Database | B3 | ✅ | ✅ / ✅ (B3 restyle) | ✅ better | ✅ 1440 / ✅ 390 (re-run 2026-09-29: ✅ / ✅) |
| PR-13 | Environments | S1 | ✅ | ✅ / ✅ | ✅ better | ✅ 1440 / ✅ 390 |
| PR-14 | Audit | S2 | ✅ | ✅ / ✅ (S2 restyle) | ✅ no new | ✅ 1440 / ⚠️ 390 (re-run: 1440 ✅; 390 flaky, see below) |
| PR-15 | Present | S3 | ✅ | ✅ / ✅ | ✅ better | ✅ 1440 / ✅ 390 (re-run 2026-09-29: ✅ / ✅) |
| PR-16 | Standards Library | L1 | ✅ | ✅ / ✅ | ✅ better | ✅ 1440 / ✅ 390 |
| PR-17 | Tech Stacks | L2 | ✅ | ✅ / ✅ | ✅ better | ✅ 1440 / ✅ 390 |
| PR-18 | Build Books | L3 | ✅ | ✅ / ✅ (L3 restyle) | ✅ 0 violations | ✅ 1440 / ✅ 390 |
| PR-19 | Gallery | L4 | ✅ | ✅ / ✅ (L4 restyle) | ✅ no new | ✅ 1440 / ✅ 390 |
| PR-20 | Settings and admin | L5 | ✅ | ✅ / ✅ (L5 restyle) | ✅ better (auth 0) | ✅ 1440 / ✅ 390 |
| PR-21 | Public | P1 | ✅ | ✅ / ✅ (P1 restyle) | ✅ legal 0, landing no new | ✅ 1440 / ✅ 390 |
| PR-22 | Shell (new) | F3, F3b, F6 | n/a | ✅ shell suite 105 passed / 0 failed | ✅ shell axe 0 violations | ✅ 1440 / ✅ 390 (re-run: shell 47+33 desktop, 54+33 mobile, incl. remount MobileTabBar) |

## Runs

| Date | Branch @ commit | Scope | Result | Axe file |
|---|---|---|---|---|
| 2026-09-26 | feature (F6) | Legacy, PR-01..21 | 54/54 twice | `axe-legacy.json` |
| 2026-09-28 | feature @ 8d11701 (after wave 3 batch 2) | New app: shell suite + all 21 rows, 1440/390, local stack | Shell 105/0; restyled rows 24/24 (run twice, identical); PR-12 and PR-14 fail only on the embedded-mode heading | `axe-new-merged-batch2.json` |

## Final run (T071) details, 2026-09-29, local stack

Axe: regression specs record against `axe-legacy.json` as before; no axe-related failures in any row. Shell axe (`axe-shell.spec.ts`) passes with 0 violations.

### PR-22 shell suite (`e2e/shell/*`)

| File | 1440 | 390 |
|---|---|---|
| axe-shell + mobile-reach | 10 passed, 9 skipped (mobile-only) | 17 passed, 2 skipped |
| redirects + remount | 39 passed, 1 skipped (mobile-only) | 38 passed, 1 skipped, **1 failed** |

`redirects.spec.ts` ran against Vite (no nginx container needed) and passed; nothing env-blocked.

Failure (390): `shell/remount.spec.ts` "navigating between two phase tools via the MobileTabBar does not remount the shell". After going to Design/Canvas, clicking the "Define" tab is intercepted by Canvas page content (`div.p-4` / the draggable "Resizable markdown notes" palette item) that sits over the fixed tab bar. Expected: the tab bar is clickable. Suspected cause: the Canvas page (legacy toolbox layout inside `flex min-h-0 flex-1`) does not reserve bottom space or stack below the fixed MobileTabBar (P4 readOnly gating or P2 change of Canvas/AppShell). Deterministic (re-ran).

### New capabilities (`e2e/new/*`)

| File | 1440 | 390 |
|---|---|---|
| us4.versions | 44 passed (after 2 test-locator fixes, see below) | 44 passed |
| us5.assurance | 47 passed | 47 passed |
| us6.onboarding | 31 passed | 29 passed, **2 failed** |

Open items from last batch confirmed: NA-08 mobile sandbox picker, NA-05 axe (PrChip) and NV-06 released Canvas/Repository read-only all pass on both viewports.

Failures (390, us6.onboarding):
- NO-01 "cancels a draft run and returns to the team portfolio": `Cancel onboarding` button is covered by the fixed Assurance tab bar and the fixed `#mobile-primary-action` bar, so the click never lands. Expected: the button is reachable (scroll clearance above both fixed bars). Suspected cause: the onboarding wizard page lacks bottom padding for tab bar plus primary-action bar (`OnboardingWizard.tsx`).
- NO-03 "a running run shows the log region waiting for progress": `document.documentElement.scrollWidth - clientWidth` is 19 (max 1). Screenshot shows the bottom Assurance tab bar labels ("Organization") running past the right edge. Suspected cause: five tab labels in the Assurance mobile nav no longer fit at 390 (P2 copy pass label lengths) with no truncation.

### Test fixes (e2e/new/us4.versions.spec.ts, both were strict-mode locator ambiguities, assertions unchanged in intent)
- NV-01: `strip.getByText("First release")` matched the sr-only "Milestone: First release" plus the visible label (added by P1 a11y); now `{ exact: true }`.
- NV-05: `getByText("Release v1.0.1 first")` matched two elements (summary and check row); now `.first()`.


## Targeted re-run after fixes (T071), 2026-09-29, local stack, `wp/rerun`

Scope: N3 review fixes plus mobile shell fixes (isolate, `--shell-bottom-inset`, tab bar label truncation). One fresh stack per chunk, `--workers=1`, APP=new.

| File(s) | 1440 | 390 |
|---|---|---|
| shell: axe-shell, mobile-reach, redirects | 47 passed, 9 skipped | 54 passed, 2 skipped |
| shell/remount (MobileTabBar test now passes) + us6.onboarding | 33 passed, 1 skipped | 32 passed, 1 skipped, **1 failed (NO-03)**; NO-01 now passes |
| us4.versions + us5.assurance (NV-05 passed, not flaky in this run) | 91 passed | 91 passed |
| pr-08, pr-11, pr-12 | 3 passed | 3 passed |
| pr-14, pr-15, pr-01 | 3 passed | 2 passed, **1 flaky (pr-14)** |

Fixed: (1) remount MobileTabBar (Canvas content over the tab bar), (2) NO-01 Cancel button covered by the fixed bars. The Assurance tab bar no longer overflows. PR-15 fullscreen preview and pr-01 mobile primary action pass at 390 with `<main>` isolating.

Open:
- **NO-03 (390), CLOSED 2026-09-29:** Stepper overflow fixed in the shared `Stepper` (`min-w-0` items, truncating labels, compact form below `sm`: only the current step shows its label, others keep it as the accessible name). NO-01..NO-05 pass at 390 (17/17).
- **PR-14 (390), CLOSED 2026-09-29:** root cause was a test race, not an app defect: the Select list text ("No sessions yet") is visible a beat before Radix's dismissable layer (Escape listener, `pointer-events: none` on body) is live, so an early Escape was dropped and the combobox stayed expanded. The spec now waits for the layer, presses Escape, and asserts `aria-expanded=false` (assertion strengthened, not weakened). Mobile 12/12 + 6/6, desktop 3/3.
- NV-05 (us4.versions): passed on both viewports in the re-run (no failure to characterize).
