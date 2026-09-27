# E2E regression harness (WP-F6, spec 007)

Playwright smoke suite shared by `app/frontend` (legacy) and `app/frontend-new`
(spec 007). The same spec files run against either app by pointing at a
different dev server and setting `APP=legacy|new`; `e2e/routes.ts` translates
each logical page into the right URL shape for whichever app is under test.

- `e2e/regression/pr-xx.spec.ts` -- one file per regression row (T017),
  PR-01..PR-21. This is the regression gate (`tasks.md` T017): every row must
  be green **on legacy** before any page-restyle task starts, and green **on
  the new app** before that page's task is considered done.
- `e2e/shell/*.spec.ts` -- foundation E2E for the new app's shell (T037):
  `remount.spec.ts` (no shell remount across tool navigation, tool/tab
  restored on reload), `redirects.spec.ts` (every row of
  contracts/routes.md §1, including `/build-books/:id[/edit]` and every
  `/project/:id/<page>/t/:token`), `mobile-reach.spec.ts` (every
  MobileTabBar item reachable in one tap, the tab bar sits in the bottom
  35% at 390x844 per spec.md SC-005, the ⌘K palette and status center open
  from mobile chrome, no horizontal scroll), and `axe-shell.spec.ts` (axe
  scoped to shell landmarks only -- header/rail/tab bar/dialogs, not routed
  page content -- at 1440 and 390, light and dark; the bar for the shell is
  zero violations, not just zero serious/critical). Run with `npm run
  test:shell` (shell only) or `npm run test:new` (regression + shell).
- `e2e/fixtures.ts` -- shared `test`/`expect`, mock-auth cache seeding, and
  the axe-baseline recorder. Import `test`/`expect` from here, not directly
  from `@playwright/test`.
- `e2e/routes.ts` -- the logical-page -> URL map. Tests must always navigate
  through a `routes.*` helper, never by clicking legacy's own sidebar/nav
  (the new app replaces it).
- `e2e/seed.sql` -- fixed-id baseline data (org, owner user, one project, one
  standards category/standard, one tech stack, one build book, one published
  project, two share tokens). Additive and idempotent (`ON CONFLICT DO
  NOTHING`); `e2e/lib/seedIds.ts` mirrors the ids so specs never hardcode
  UUIDs. Each spec is still responsible for creating whatever *it* is
  testing the creation of.

## Bringing up the stack

Needs Docker (for Postgres) and both `app/backend`'s and `app/frontend*`'s
`node_modules` installed (`npm ci` in each). From the repo root:

```bash
e2e/scripts/stack.sh up      # Postgres x2 (profile "e2e") + the API on :3140
e2e/scripts/serve-app.sh legacy 8140    # app/frontend on :8140, or:
e2e/scripts/serve-app.sh new    8141    # app/frontend-new on :8141
```

`stack.sh up` re-stages `infra/migrations/*.sql` + `seed.sql` into a scratch
dir and mounts it into Postgres's `docker-entrypoint-initdb.d`, so every `up`
is a fresh, reseeded database (Postgres data dir is `tmpfs`). `stack.sh down`
stops the API and tears down the compose project (`-v`, so no data survives
between runs). Everything is namespaced by `COMPOSE_PROJECT_NAME` and the
`*_PORT` env vars (see the script headers) so several agents can run this in
parallel with distinct values.

`serve-app.sh` runs the target app straight off `vite dev` (not
containerized) against the API from `stack.sh`, with the same fake Entra
tenant/client ids the mock-auth cache signs tokens for. In this container,
Vite's default host binds to a socket family the sandbox doesn't support
(`EAFNOSUPPORT` on `::`) -- if you hit that, run vite directly with
`--host 127.0.0.1`, e.g.:

```bash
cd app/frontend
VITE_API_BASE_URL=http://localhost:3140 VITE_AUTH_MODE=mock \
VITE_ENTRA_TENANT_ID=00000000-e2e-4000-8000-tenantid0001 \
VITE_ENTRA_CLIENT_ID=00000000-e2e-4000-8000-clientid0001 \
VITE_AZURE_REDIRECT_URI=http://localhost:8140 \
npx vite --port 8140 --strictPort --host 127.0.0.1
```

**`VITE_AUTH_MODE=mock` is dead code in `app/frontend`**: nothing in the
legacy app reads that env var (grep for it -- only `serve-app.sh` sets it).
Mock auth instead comes entirely from the harness seeding MSAL's
`localStorage` cache before any page script runs
(`fixtures.ts` -> `lib/msalCache.ts`), which the backend's
`authMiddleware` accepts via its local-JWT fallback whenever real Azure
AD/JWKS validation fails (`app/backend/src/middleware/auth.ts`) -- that's the
path the harness's signed mock bearer tokens are designed to take. Setting
`VITE_AUTH_MODE` is harmless but doesn't do anything; it's kept in
`serve-app.sh` only so a future auth-mode branch in the frontend has
somewhere to read it from.

## Playwright browser version

`e2e/package.json` pins `@playwright/test` to an exact version (currently
`1.56.0`, with a matching `overrides.playwright-core`) instead of a caret
range. This container's Chromium is preinstalled at a fixed revision under
`PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers` (`playwright install` is never
run here), so `@playwright/test` must resolve to whichever `playwright-core`
version's `browsers.json` names that same revision -- a caret range can
silently resolve to a newer `playwright-core` (transitively, e.g. via
`@axe-core/playwright`'s loose `playwright-core: >=1.0.0`) that expects a
newer Chromium the container doesn't have, failing every test with
`Executable doesn't exist`. If the preinstalled Chromium revision ever
changes, find the matching `@playwright/test` version by downloading
candidate `playwright-core` tarballs and checking `browsers.json`'s chromium
`revision`/`browserVersion`, e.g.:

```bash
npm pack playwright-core@1.56.0 --silent && tar xzf playwright-core-1.56.0.tgz package/browsers.json && cat package/browsers.json
```

## Running the suites

```bash
cd e2e
npm ci

# Legacy smoke suite (T017), both viewports, then aggregates the axe baseline:
BASE_URL=http://localhost:8140 npm run test:legacy

# New app (once app/frontend-new has routes):
BASE_URL=http://localhost:8141 npm run test:new

# One file, one viewport, while iterating:
APP=legacy BASE_URL=http://localhost:8140 npx playwright test regression/pr-14.spec.ts --project=desktop --reporter=list
```

`test:legacy` runs `playwright test regression` (both the `desktop`
(1440x900) and `mobile` (390x844) projects, from `playwright.config.ts`) and
then `scripts/build-axe-baseline.mjs`, which aggregates every
`recordAxeBaseline()` call's NDJSON line (`baselines/axe-legacy.raw.jsonl`)
into `baselines/axe-legacy.json` -- one row per `(pageId, viewport)`, the max
serious+critical violation count seen. This only **records** a baseline
(T016/T017, per spec.md D-13); legacy axe violations are expected and don't
fail the suite. The "no NEW violations vs. this baseline" comparison happens
later, once the new app exists, by diffing a `test:new` axe run against
`axe-legacy.json`.

Tear down when done:

```bash
e2e/scripts/stack.sh down
```

## Running several stacks in parallel (e.g. two agents/WPs at once)

`stack.sh` and `serve-app.sh` each read their own port env vars independently
and don't pass them to each other or to the Playwright process — so running
two stacks side by side (different worktrees, different agents) needs the
*same* set of env vars **exported** (not just prefixed on one command) in
each shell before running any of `stack.sh`, `serve-app.sh` and `npx
playwright test`/`npm run test:*`:

- `COMPOSE_PROJECT_NAME` — distinct per stack, or `stack.sh down` in one
  worktree tears down the other's Postgres containers too.
- `DB_PORT` and `GENAPPS_DB_PORT` — distinct Postgres ports (`stack.sh`
  binds these on the host).
- `API_PORT` — distinct API port. `stack.sh` only uses this to start the API
  process; it does **not** export it back out, and `serve-app.sh` (which
  sets `VITE_API_BASE_URL` from it) and **`e2e/lib/config.ts`** (which the
  Playwright test process reads `process.env.API_PORT` from directly, via
  `config.apiBaseUrl`) each need it in their own env too. If you only export
  it for `stack.sh`, the test run silently falls back to the default
  `3140` and hits the wrong (or no) API.
- The port you pass to `serve-app.sh` — distinct per app under test, and
  matching `BASE_URL`/`FE_PORT` for whichever suite you run against it.

Example, running a second stack alongside a default one:

```bash
export COMPOSE_PROJECT_NAME=e2e-f3
export DB_PORT=55441
export GENAPPS_DB_PORT=55442
export API_PORT=3241
e2e/scripts/stack.sh up
e2e/scripts/serve-app.sh new 8241   # reads API_PORT from the same shell
BASE_URL=http://localhost:8241 API_PORT=3241 npm run test:new   # or test:legacy
```

If `serve-app.sh`'s `vite` fails to bind (`EAFNOSUPPORT` on `::`, seen in
some sandboxes), run it directly with `--host 127.0.0.1` instead — see the
`app/frontend` example earlier in this file for the equivalent explicit
`vite` invocation; the same flag applies when serving `app/frontend-new`.

## Coverage notes (things PR-xx specs intentionally don't exercise)

Each spec's own header comment says what it covers and skips; the recurring
reasons are:

- **Needs a real external service** the harness can't stand up offline:
  GitHub App installation (PR-11 repository: actually linking/creating a
  repo, file tree, Monaco, commit/push, PAT management), Azure Container
  Apps (PR-13 deploy: start/stop/restart, logs, env vars), Azure Blob
  Storage (PR-06/PR-18 cover image and file uploads -- `stack.sh` starts the
  API with a fake storage account name so it boots offline, but blob writes
  themselves aren't exercised).
- **Needs an LLM call**: AI decompose/expand (PR-04), AI summarize/enhance
  image/visual recognition (PR-06), AI create standards (PR-16), agent
  architect/critic/flow (PR-08), specification/presentation generation
  (PR-09, PR-15), and the audit pipeline itself (PR-14) -- these are
  deliberately only exercised up to their deterministic pre-run UI (the
  entry-point dialog opens, the empty state renders). A previous PR-14 spec
  tried to drive an actual pipeline run and was deleted as flaky, since an
  LLM-driven pipeline has no deterministic UI state to wait on without fixed
  sleeps.
- **Needs a second account/session**: PR-01's shared-project/anonymous-save
  flows, PR-03's clipboard-copy token recovery (clipboard access is also
  unreliable under the artifact/CI sandbox).
- **No such route in `app/frontend`**: PR-20's superadmin cloud/GitHub/render
  managers and signup-code validation are new-only capabilities (see
  `contracts/routes.md`); legacy's `/settings/*` only ever renders the admin
  user-management page, and sign-in is SSO-only (no signup flow to
  validate). PWA install/update prompts (PR-21) depend on the real
  `beforeinstallprompt`/service-worker-update browser events, which aren't
  available under `vite dev` and can't be fired deterministically in a test.

## Legacy bugs found while writing this suite

These are pre-existing bugs in `app/frontend`/`app/backend`, found and
documented (not fixed -- `app/frontend` is immutable pre-cutover per the UI/UX
Layout Contract, and fixing backend behavior is out of scope for a frontend
regression harness). Each is also called out in its spec's header comment.

- **`ProjectSettings.tsx`**: the name field is clobbered by a re-sync
  `useEffect` (noted by an earlier WP-F6 pass; see PR-02).
- **`pronghornApiAdapter.ts`'s `QueryBuilder.select()`** always sets
  `queryType = "select"`, so chaining `.insert(data).select("id").single()`
  (e.g. `BuildBookEditor.tsx`'s create path) silently turns the insert into a
  no-filter single-row `SELECT`: nothing is written, and the id returned (and
  navigated to) is just some existing row, while the UI still shows a
  success toast. Any other create flow following this same chain shape has
  the same bug. See PR-18.
- **Gallery clone is completely broken, two bugs deep**:
  1. `GalleryCloneDialog.tsx` calls `clone_published_project` with
     `p_published_id`, but the backend route (`routes/rpc.ts`) destructures
     `p_published_project_id` -- the id is always `undefined` server-side and
     every clone fails with `"Published project not found"`.
  2. That failure (and Gallery's other `useToast()` calls) never reaches the
     screen at all: `main.tsx` only mounts the sonner `<Toaster
     position="top-right" />`; there is no `<Toaster />` from
     `@/components/ui/toaster` anywhere in the tree, so the shadcn
     `useToast()` hook's toasts are rendered nowhere. Cloning fails
     completely silently. See PR-19.
- **`get_published_projects` RPC** (`routes/rpc.ts`) aliases the project's
  name/description as `project_name`/`project_description`, but
  `Gallery.tsx`'s `PublishedProject` type (and `GalleryCard`/
  `GalleryPreviewDialog`) read `.name`/`.description` -- so the gallery
  card's title and the preview dialog's title are always blank. See PR-19.
- **`get_tech_stacks_root` RPC** filters `parent_id IS NULL AND type IS
  NULL` to find root-level tech stack categories (`type` is set only on leaf
  items nested under a stack). `e2e/seed.sql`'s seeded tech stack originally
  set `type = 'backend'` on its root row, which is itself a seed-data bug
  (not an app bug) -- it made the seeded stack invisible on the Tech Stacks
  library page (PR-17) while still working for PR-05's unfiltered selector.
  Fixed in `seed.sql` by seeding `type = NULL`.
