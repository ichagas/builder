# Work Packages for Agents: Pronghorn Frontend Redesign

This file turns [tasks.md](./tasks.md) into **work packages (WPs) sized for one agent each**: one branch, one PR, one reviewable outcome. Agents use the repo's agents in `.github/agents/`:

| Role | Agent | Used for |
|---|---|---|
| Implement | `speckit.implement` | Code for the WP's tasks |
| Test | `testing` | Regression smoke, E2E, axe |
| Review | `code-review` | Checks against `frontend-new.instructions.md`, contracts and the constitution |
| Security | `security` | WP-BE4, WP-BE5, WP-BE6, WP-BE7 |
| Deploy | `deployment` | WP-F1 (host) and WP-X2 (cutover) |

## Rules every agent follows

1. **Read first:** `spec.md`, `plan.md` (especially **the move and restyle recipe**), `research.md`, `contracts/*`, and the prototype for your area.
2. **Restyle WPs must not change behavior.** Keep the page's logic, data calls, dialogs and toasts. Change only layout, navigation, tabs-in-URL, tokens and phone layout. Anything more is Phase R.
3. **Own your files.** A restyle WP edits only its page file(s), the components used by that page alone, its route metadata file in `src/app/routes/`, and its smoke spec. **Shared code** (`components/shell`, `components/ui`, `design`, `lib/state`, `app/router.tsx`, `index.css`) belongs to the foundation WPs. Request changes with a `shell-change` issue.
4. **Tokens only.** The token lint must pass. If the codemod left something unmapped in your page, fix it with the nearest token.
5. **Every PR includes:** the page's regression rows green on the new app, axe (no new violations compared with legacy), screenshots at 1440 and 390, and updated `tasks.md` checkboxes.
6. **Legacy is reference only:** don't change `app/frontend/`. It isn't live (a pre-go-live pivot). Fix bugs in `app/frontend-new/`.

## Waves

| Wave | Work packages (parallel within a wave) | Needs |
|---|---|---|
| 0 | **F0** governance | — |
| 1 | **F1** fork, CI, host · **F6** test harness + **legacy smoke suite** · **BE1** · **BE3** · **BE7** | F0 |
| 2 | **F2** tokens and UI · **F2b** color codemod · **F3** shell, router, embedded mode · **F5** long-task bridge · **BE2** · **BE4** | F1, F6 / BE1, BE3 |
| 3 | **20 restyle WPs in parallel:** P1 P2 P3 · D1 D2 D3 D4 · G1 G2 · B1 B2 B3 · S1 S2 S3 · L1 L2 L3 L4 L5 · **BE5** | F2, F2b, F3 / BE4 |
| 4 | **X0** clean-up + full regression · **V1–V4** · **A1–A5** · **BE6** | wave 3 / BE2, BE4, BE5 |
| 5 | **X1** redirects · **X2** host switch · **O1 O2** | X0 / A1, BE6 |

With 5–6 agents, waves 0–2 take ≈ 1.5 weeks, wave 3 (20 small packages) ≈ 1–1.5 weeks, and clean-up and cutover ≈ 1 week, for **≈ 3–4 weeks to cutover**. New capabilities continue in parallel and can ship after cutover.

## Work package catalogue

Size: **S** ≈ 1 agent-day, **M** ≈ 2–3, **L** ≈ 4–5.

### Foundation (owners of shared code)

| WP | Title | Tasks | Size | Depends | Acceptance |
|---|---|---|---|---|---|
| F0 | Governance and instructions | T000–T003 | S | — | Amendment merged with client approval. Clarifications recorded (done 2026-09-25) |
| F1 | Fork, CI, container, host | T010–T015, T018 | M | F0 | `next.<dev>` serves the fork. CI job green. Token lint in warn mode |
| F6 | Test harness + **legacy smoke suite** | T016, T017, T037 | M | F1 | PR-01…PR-21 smoke green **on legacy**. Shell E2E ready |
| F2 | Tokens, preset, UI tweaks, atoms | T020–T023 | M | F1 | Variables re-pointed. The whole fork already looks like Blueprint. Contrast OK in light and dark |
| F2b | Color codemod and sweep | T030–T031 | M | F2 | Codemod report attached. Token lint in error mode. Unit tests green |
| F3 | Shell, state hooks, router, redirects, embedded mode, ⌘K, translation-ready setup | T024–T029, T032–T034, T036, T038 | L | F2 | Every legacy page opens in the shell at its new URL. Remount test 0. Redirects green |
| F5 | Long-task bridge | T035 | S | F3 | Agent, audit and deploy runs appear in the status pill with no page edits |

### Restyle (one page or area each; apply the recipe)

| WP | Page(s) | Tasks | Size | Prototype reference | Closes |
|---|---|---|---|---|---|
| P1 | Landing, legal, PWA, theme | T065 | S | Blueprint tokens only | PR-21 |
| P2 | Projects home | T040 | S | — | PR-01 |
| P3 | Project layout loader, settings, access | T041 | M | `approach-3-versions.html` (building state) | PR-02, PR-03 |
| D1 | Requirements | T042 | S | Define phase | PR-04 |
| D2 | Project standards | T043 | S | Define phase | PR-05 |
| D3 | Artifacts (+ collaboration) | T044 | M | Define phase | PR-06 |
| D4 | Chat | T045 | S | Define phase | PR-07 |
| G1 | Canvas (full-bleed, inspector on phones) | T046 | M | Design phase canvas | PR-08 |
| G2 | Specifications | T047 | S | Design phase | PR-09 |
| B1 | Build agent (full-bleed) | T048 | M | Build phase | PR-10 |
| B2 | Repository | T049 | M | Build phase | PR-11 |
| B3 | Database | T050 | M | Build phase | PR-12 |
| S1 | Environments (Deploy) | T051 | S | Ship phase | PR-13 |
| S2 | Audit | T052 | M | Ship phase | PR-14 |
| S3 | Present | T053 | S | Ship phase | PR-15 |
| L1 | Standards Library | T060 | S | Library layout | PR-16 |
| L2 | Tech Stacks | T061 | S | Library layout | PR-17 |
| L3 | Build Books | T062 | S | Library layout | PR-18 |
| L4 | Gallery | T063 | S | Library layout | PR-19 |
| L5 | Settings, admin, auth pages | T064 | M | Root layout | PR-20 |

### Clean-up and cutover

| WP | Title | Tasks | Size | Depends | Acceptance |
|---|---|---|---|---|---|
| X0 | Remove embedded mode, full regression | T070–T071 | S | all restyle WPs | `checklists/regression.md` 100% ✅ |
| X1 | Redirects for internal links | T072 | S | X0 | Every legacy URL redirects |
| X2 | Host switch, legacy removal | T073–T074 | M | X1 | Primary host serves the new app. Legacy removed right after |

### New capabilities (built new; don't block cutover)

| WP | Title | Tasks | Size | Depends | Closes |
|---|---|---|---|---|---|
| V1 | Timeline + All versions + triage | T110 | M | BE1, P3 | NV-01, NV-02 |
| V2 | Change page | T111 | M | V1 | NV-03, NV-04 |
| V3 | Release and first release | T112 | M | BE2, V1 | NV-05 |
| V4 | Version scoping of phase tools | T113–T114 | M | V1 + restyled phase pages | NV-06 |
| A1 | Assurance layout, team switcher, portfolio | T130 | M | BE3, F3 | NA-01, NA-02 |
| A2 | Application page | T131 | M | A1 | NA-03, NA-04 |
| A3 | Mesh runs by day and evidence | T132 | S | A2, BE4 | NA-05 |
| A4 | Packs, policy, exceptions | T133 | S | A1, BE4 | NA-06 |
| A5 | All teams | T134–T135 | S | A1 | NA-07 |
| A6 | Admin → Integrations and mesh policy | T136 | M | A1, BE8 | NA-08 |
| O1 | Onboarding steps 1–2 | T150 | M | A1, BE5 | NO-01, NO-02 |
| O2 | Onboarding steps 3–5 | T151–T152 | M | O1, BE6 | NO-03…NO-05 |
| BE1 | B1 schema and API | T100–T101, T103 | M | F0 (T002) | Migration and route tests with token roles |
| BE2 | Release service, real Git branches per change, staging branches | T102, T104 | L | BE1 | In-order, carry-over and branch-creation tests. Legacy staging tests unchanged |
| BE3 | B2 schema, teams, apps, packs | T120–T121 | M | F0 | Portfolio aggregate < 150 ms on seed |
| BE4 | Mesh ingest (PR runs), evidence, policy, issues, update PRs | T122–T125 | L | BE3 | HMAC rejection, ratchet and issue-creation tests. **Security review** |
| BE5 | Onboarding API + GitHub import and PRs | T140 | M | BE3 | PRs only after confirm. **Security review** |
| BE6 | Sandbox job + dispatcher + infra | T141 | L | BE5, BE7 | Two-repo sample onboarded in dev ≤ 10 min |
| BE8 | Integrations config (GitHub App, Azure DevOps service connection or PAT) | T126 | M | BE3 | Secrets only in Key Vault. Test-connection endpoint. **Security review** |
| BE7 | Mesh CI templates (GitHub Actions + Azure Pipelines, optional Cyber Risk sandbox) and packs (external repo) | T142 | L | F0 | A PR in a sample GitHub repo and a sample Azure Repos repo each posts a signed report that shows in the portfolio |

## Effort

| Part | Packages | ≈ agent-days |
|---|---|---|
| **Redesign to cutover** (foundation 7 + restyle 20 + cutover 3) | 30 | **≈ 50** (no freeze or classic-host work) |
| New capabilities (frontend 12 + backend 8) | 20 | ≈ 54 |
| Phase R rewrites (optional) | per page | 3–5 each |

Compared with the full-rewrite plan (≈ 125 agent-days for parity and new capabilities), the redesign reaches cutover with about half the work and much lower risk, because page behavior never changes.

## Prompt template for a restyle agent

```
You are doing restyle work package <WP-ID> for specs/007-frontend-new (redesign route).

Read: specs/007-frontend-new/{spec.md, plan.md → "move and restyle recipe", research.md},
contracts/{design-system.md, routes.md}, .github/instructions/frontend-new.instructions.md.
Prototype for look and placement: docs/design/frontend-redesign/option-a-styles/approach-3-versions.html
Page: app/frontend-new/src/pages/<Page>.tsx (a fork of the legacy page; behavior must not change).

Apply the recipe: remove page nav · add route metadata + usePrimaryAction · tabs in the URL ·
finish token fixes · 390px layout · register long runs · smoke + axe + screenshots.
Only edit: the page file, components used only by this page, src/app/routes/<area>.tsx, e2e for PR-<xx>.
Done when regression rows PR-<xx> pass on the new app at 1440 and 390, axe shows no new violations,
token lint passes, and tasks.md is updated. Then run the testing and code-review agents.
```

## Definition of done (every WP)

- [ ] Tasks checked in `tasks.md`, with the regression or capability IDs listed in the PR
- [ ] Lint (including token lint), typecheck, unit and the WP's E2E green in CI
- [ ] Restyle WPs: behavior identical to legacy (the same smoke passes on both)
- [ ] axe: no new violations (restyle) and none at all (shell and new screens)
- [ ] Screenshots at 1440 and 390. Primary action in the fixed place
- [ ] `code-review` passed. `security` passed where listed
