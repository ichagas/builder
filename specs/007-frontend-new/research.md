# Research & Decisions: Pronghorn Frontend Redesign

Each decision records the choice, why, and what was rejected. Agents MUST follow these unless a decision is reopened here.

## D-1: Redesign route, fork the legacy app
**Decision:** Create `app/frontend-new/` by copying `app/frontend/` (a plain copy in one commit, "Fork app/frontend as app/frontend-new"). Redesign the fork. The app isn't live yet (a pre-go-live pivot), so `app/frontend/` simply stops receiving feature work and is removed once the new app passes the regression gate.
**Why:** It's the simplest path to the new UI with every feature intact on the live API. There's no parity rebuild (the previous plan estimated ≈ 125 agent-days for a rewrite, against ≈ 50 for the redesign to cutover).
**Rejected:** a full rewrite (cost and risk). An in-place restyle of `app/frontend/` (breaks Principle VI immediately, and there's no side-by-side comparison or rollback).

## D-2: Keep the data layer as is
**Decision:** Existing pages keep `pronghornApiAdapter`, `useRealtime*` hooks, `AuthContext`, `AdminContext` and `useShareToken`, with no changes. Only **new capabilities** use TanStack Query hooks + zod (`features/*/api.ts`).
**Why:** Behavior stays identical. Data-layer rewrites are Phase R.

## D-3: Restyle through tokens, in three layers
**Decision:**
1. **Re-point** the existing shadcn HSL variables in `src/index.css` (`--background`, `--foreground`, `--card`, `--primary`, `--secondary`, `--muted`, `--accent`, `--destructive`, `--border`, `--input`, `--ring`, `--radius`, `--success`, `--warning`, `--info`, `--status-*`, `--sidebar-*`) to Blueprint values. That restyles every shadcn component at once.
2. **Add** Blueprint-only tokens (phases, mesh agents, mode band, rail, change types) in `src/design/tokens.css` and the Tailwind preset.
3. **Codemod** hard-coded colors to semantic tokens with a script (`scripts/codemods/colors-to-tokens.ts`) using a mapping table (e.g. `text-green-600` → `text-ok`, `bg-red-50` → `bg-bad-soft`, `text-gray-500` → `text-muted-foreground`). Anything unmapped is listed for manual fixing.

**Why:** Most of the look changes with no page edits. The codemod makes the rest mechanical.

## D-4: The shell replaces per-page navigation, driven by route metadata
**Decision:** Pages stop rendering `PrimaryNav`, `ProjectSidebar` and `ProjectPageHeader`. Each route declares `{phase, tool, title, primaryAction}` in `src/app/routes/*.tsx`. `ProjectLayout` renders the header and the mobile primary slot from it. The primary action handler comes from a small hook the page exports (`usePrimaryAction`), so page logic doesn't move.
**Why:** It gives a consistent shell and a fixed primary action with minimal page edits.

## D-5: URL state only where it's cheap
**Decision:** Tabs and tools always go in the URL (`useUrlState`). Selection and panels go in the URL only when the page already keeps them in a single state variable. Deeper state changes are Phase R.

## D-6: Dialogs and toasts stay (for now)
**Decision:** Restyled pages keep their dialogs and `toast.*` calls. The shell adds the status pill, status center and undo slot for new work and long runs. Phase R candidates are recorded when a page clearly breaks the UX principles.
**Why:** Replacing 25 dialogs in Artifacts or 38 toast calls in Canvas is rewrite work.

## D-7: Timeline before versions exist
**Decision:** Until B1, a project shows one version, "Building" (or "vX current" if it has a published deployment). Phase pages call the existing RPCs unchanged.

## D-8 to D-12: New capabilities (updated with the 2026-09-25 answers)
- **D-8 Roles like GitHub.** Teams are a new table under organizations, and `team_members.role` is `owner` or `member`. **Team owners** manage members and applications and can tighten their team's mesh policy. **Members** see and act on their team's apps. The **All teams** view and the organization-level policy belong to organization admins (the existing admin role in `user_roles`). There is no separate "assurance lead" role.
- **D-9 Real Git branches.** Every change (work item) gets a **real Git branch from its first commit**, created when the change is scheduled or accepted (`fix/wi-42-…`, `feat/wi-38-…`). Staging gains a `branch` dimension, so commits go to the change's branch. Releasing a version merges the reviewed branches into the default branch, then tags it.
- **D-10 Mesh runs on pull requests to the default branch.** The generated CI runs the mesh **when a pull request targets the repository's default branch** (`main`, `master`, `develop`… as configured per repository). Every run posts a signed report to `POST /api/v1/mesh/runs` (HMAC per repository). A merged PR's evidence is its last run before merge. Reporting is required. No report for 7 days means "not reporting".
- **D-11** Baseline ratchet by finding fingerprints. The policy acts on new findings only.
- **D-12 Onboarding generates CI for the repository's own platform.** The sandbox (an Azure Container Apps Job: read-only clones, egress restricted, progress on `onboarding-{runId}`) detects each repository's CI provider and generates the mesh CI as **GitHub Actions** (`.github/workflows/assurance-mesh.yml`) or **Azure Pipelines** (`azure-pipelines/assurance-mesh.yml` or a template reference), both calling the shared mesh templates from `goa-standards/assurance-mesh`. PRs (GitHub) or pull requests (Azure Repos) are opened only after the user confirms.

## D-13: Regression testing against the local stack
**Decision:** Playwright runs against `docker compose` (Postgres + API) with `VITE_AUTH_MODE=mock` and seed data mirroring the prototypes. **First**, write a per-page smoke suite against the **legacy** app (T017), then run the same suite against the new app. That's the regression gate.
**Why:** The legacy app has only unit tests. The smoke suite proves the redesign didn't break behavior.

## D-14: Phase R selection criteria (after cutover)
A page moves to a full rewrite only if at least two apply: > 800 lines; > 10 dialogs; > 20 toast calls; state lost on reload that users complain about; unusable at 390px after restyling. Current candidates by those numbers: Canvas (1,791 lines, 38 toasts), Artifacts (1,330 lines, 25 dialog refs), Repository (1,299 lines, 32 toasts), Build (1,187 lines, 22 toasts), Chat (1,183 lines, 23 toasts).

## D-15: New findings → open an issue; blocking is configurable
**Decision:** The mesh CI runs a series of checks on every PR to the default branch. When it finds new findings, the default action is **open an issue** in the repository's tracker (a GitHub issue, or an Azure DevOps work item) and notify the team. **Blocking is configurable, not fixed:** `mesh_policy.mode` per check is `issue` (default), `notify`, `block` or `off`. Organization admins may turn `block` on for any check from the start, and relax or tighten it later (e.g. when management enforces it). Team owners can only tighten.

## D-17: Optional Cyber Risk sandbox stage in the CI
**Decision:** The mesh CI can include an optional stage that deploys the PR build to an **ephemeral sandbox** and runs Cyber Risk validation against it: Red recon and attack paths, and Blue verification against ASVS L2 and the Alberta rules. It's enabled per repository in the mesh policy, uses the same issue/block modes (D-15), and never targets production.

## D-18: Integration identities live in Admin → Integrations
**Decision:** The identities Pronghorn uses to reach repositories are configured by organization admins on a new **Admin → Integrations** page, not hard-coded: the **GitHub App** installation (existing `githubAppAuth.ts`) and an **Azure DevOps connection**. The choice of a **service connection** or a **PAT** is left open and supported by the page. Secrets are stored in Key Vault, and the database keeps only references. The Azure Repos flow (import, PRs, work items) uses the configured connection.

## D-16: French later; new screens are translation-ready
**Decision:** The bilingual UI (English and French) is **not** part of this redesign. It will be its own project. To avoid rework, the **shell and the new-capability screens** (US4–US6) use translation keys from the start (`react-i18next`, English only). The existing pages (≈ 1,000 JSX text nodes, ≈ 370 labels and props, ≈ 560 toast messages) are extracted when French is scheduled.

## Answered questions (2026-09-25)

| Question | Answer | Recorded in |
|---|---|---|
| Change branches: real or virtual? | Real Git branches from the first commit | D-9 |
| Team role model | Like GitHub: team owners and members. Org admins see All teams | D-8 |
| When does the mesh run? | On pull requests to the default branch (main, master, develop…) | D-10 |
| Azure Pipelines support? | Yes: onboarding generates CI for GitHub Actions or Azure Pipelines | D-12 |
| What do new findings trigger? | Open an issue. Blocking is configurable and may be enabled from the start, then changed later | D-15 |
| Cyber Risk validation | Optional sandbox stage in the CI | D-17 |
| French at cutover? | No, later | D-16 |
| Legacy freeze | Not needed: the app isn't live yet. This is a pre-go-live pivot | D-1 |
| Azure Repos identity | TBD. Configured by admins on Admin → Integrations (service connection or PAT) | D-18 |

No open questions remain. D-15, D-17 and D-18 are deliberately configurable so later decisions don't need code changes.
