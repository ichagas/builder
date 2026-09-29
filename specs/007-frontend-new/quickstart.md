# Quickstart: `app/frontend-new` (spec 007)

How to run the redesigned frontend, run the E2E suites against it, sign in with
mock auth, and seed data. Everything below was written from the scripts and
config in the repo (`e2e/`, `app/frontend-new/`); when one changes, change this
file. The Cutover section (T073) and the onboarding sandbox check (T152) follow.

Contents: [Run the app](#run-the-app-locally) | [Backend](#backend) | [E2E stack](#e2e-stack) | [Running suites](#running-the-e2e-suites) | [Mock auth](#mock-auth) | [Seed data](#seed-data) | [Axe baselines](#axe-baselines) | [Low-memory machines](#low-memory-machines) | [Cutover](#cutover-t073-switching-the-primary-host-to-frontend-new) | [Onboarding sandbox](#onboarding-real-sandbox-run-t152)

## Run the app locally

```bash
cd app/frontend-new
npm ci
cp .env.example .env      # then edit
npm run dev               # vite, http://localhost:8080 (vite.config.ts server.port)
```

Checks used before every commit (all in `app/frontend-new/`): `npm run lint`
(0 errors; token lint is in error mode), `npx tsc -p tsconfig.app.json
--noEmit`, `npm test` (vitest), `npm run build`.

Environment variables (`.env.example` documents each):

| Variable | Meaning |
| --- | --- |
| `VITE_API_BASE_URL` | Backend / APIM base URL. Default `http://localhost:8080` in the example; point it at your local backend port (for example `http://localhost:3001`, the root `.env.example` `PORT`). Vite itself uses 8080, so the two must differ. |
| `VITE_APIM_SUBSCRIPTION_KEY` | Only when the gateway enforces subscription keys; blank locally. |
| `VITE_WS_URL` | Realtime WebSocket URL; blank derives `ws(s)://` from `VITE_API_BASE_URL`. |
| `VITE_ENTRA_CLIENT_ID`, `VITE_ENTRA_TENANT_ID` | Entra app registration ids (MSAL). `VITE_AZURE_*` is accepted as a fallback. |
| `VITE_AZURE_REDIRECT_URI` | OAuth redirect URI; must match the registration and the origin you serve from. |
| `VITE_AUTH_MODE` | `mock` or `msal`. See [Mock auth](#mock-auth): the app does not branch on it; the E2E harness fakes sign-in through MSAL's cache. |
| `VITE_APP_CHANNEL` | `next` marks this build as the redesigned app on `next.<domain>`. |
| `VITE_GITHUB_ORG`, `VITE_COLLABORATION_SNAPSHOT_PREFETCH_LIMIT` | Optional. |

Real sign-in needs a real Entra app registration whose redirect URI matches
`VITE_AZURE_REDIRECT_URI`. Without one, use the E2E stack below, which signs in
with a fake tenant.

## Backend

For day-to-day work you normally use the E2E stack (next section), which starts
Postgres and the API for you with safe defaults. To run the API by hand:

```bash
docker compose up -d db db-generated-apps   # root docker-compose.yml; ports POSTGRES_PORT/POSTGRES_GENAPPS_PORT (5432/5433)
cd app/backend
npm ci
npm run start:dev                           # ts-node src/index.ts; or `npm run dev` (nodemon, loads ../../.env and ./.env)
npm test                                    # jest
```

Configuration comes from the root `.env` (copy `.env.example`) and
`app/backend/.env.example` (`ENTRA_*`, not `AZURE_*`). Apply `infra/migrations/*.sql`
to a fresh database yourself in that case; the E2E stack does it automatically.

## E2E stack

The harness in `e2e/` (see also `e2e/README.md`) runs the same Playwright
specs against either app. Needs Docker (Postgres) plus `npm ci` in
`app/backend`, the app under test, and `e2e/`.

```bash
e2e/scripts/stack.sh up                   # Postgres x2 (compose profile "e2e") + API on :3140
e2e/scripts/serve-app.sh new 8141         # app/frontend-new via vite dev on :8141 (or: legacy 8140)
# ... run tests ...
e2e/scripts/stack.sh down                 # stops the API, `compose down -v` (data is gone)
```

Defaults (all overridable by env): `COMPOSE_PROJECT_NAME=pronghorn-e2e`,
`DB_PORT=55432`, `GENAPPS_DB_PORT=55433`, `API_PORT=3140`. Conventional app
ports: 8140 legacy, 8141 new (the API's CORS allowlist covers 8140-8149 by
default; use `ALLOWED_ORIGINS` for anything else). `stack.sh up` starts the API
with `NODE_ENV=test`, fake Entra ids, `RATE_LIMIT_MAX=100000`, a fake storage
account and a scratch `STORAGE_BASE_PATH`; the API log is
`e2e/.run/<project>/api.log`. `serve-app.sh` exports the `VITE_*` values the
mock auth needs (`VITE_API_BASE_URL`, `VITE_AUTH_MODE=mock`, the fake tenant and
client ids, `VITE_AZURE_REDIRECT_URI`) and execs `npx vite --port <port>
--strictPort`. If vite fails with `EAFNOSUPPORT` on `::` (some sandboxes), run
vite yourself with `--host 127.0.0.1` and the same env vars.

A second stack in parallel (only on machines with the memory for it, see
[Low-memory machines](#low-memory-machines)) needs the same `COMPOSE_PROJECT_NAME`,
`DB_PORT`, `GENAPPS_DB_PORT`, `API_PORT` exported in every shell; see
`e2e/README.md`.

## Running the E2E suites

`e2e/playwright.config.ts`: two projects, `desktop` (1440x900) and `mobile`
(390x844), both Desktop Chrome; `fullyParallel: false`; 45 s test timeout;
`testMatch` covers `regression/**`, `shell/**` and `new/**`. `BASE_URL`
(default `http://localhost:${FE_PORT:-8140}`) picks the served app and `APP`
(`legacy` default, or `new`) picks the URL shape in `e2e/routes.ts`; tests
navigate only through `routes.*` helpers. `API_PORT` must be exported for the
test process too when you changed it.

```bash
cd e2e && npm ci
npm run test:legacy            # APP=legacy, :8140, regression/ only, then builds axe-legacy.json
npm run test:new               # APP=new, :8141, regression/ + shell/ (PR-01..PR-22)
npm run test:shell             # APP=new, :8141, shell/ only (remount, redirects, mobile reach, shell axe)
npm run test:new-capabilities  # APP=new, :8141, new/ (us4.versions, us5.assurance, us6.onboarding)
```

Each npm script honors `BASE_URL` or `FE_PORT`. Iterate on one file and one
viewport:

```bash
APP=new BASE_URL=http://localhost:8141 npx playwright test new/us5.assurance.spec.ts --project=desktop --workers=1 --reporter=list
npx playwright test --list      # parses every spec without starting a browser or stack
npx tsc --noEmit -p e2e         # type-check the specs
```

Specs import `test`/`expect` from `e2e/fixtures.ts`, never from
`@playwright/test`. The `new/` specs are `APP=new` only. Reports:
`npm run report` (HTML in `e2e/playwright-report`). Playwright is pinned to an
exact version (see `e2e/README.md`, "Playwright browser version").

Not covered by CI (needs external services or an LLM): a real GitHub App
install, Container Apps deploys, blob uploads, LLM-driven flows, and the real
onboarding sandbox job (see the manual T152 check below).

## Mock auth

Nothing in either app branches on `VITE_AUTH_MODE`. Sign-in in the E2E harness
works in two halves, and the values must agree (`e2e/lib/config.ts`,
`stack.sh`, `serve-app.sh` all use the same defaults):

- **Browser side:** the `page` fixture in `e2e/fixtures.ts` calls
  `buildMsalCacheEntries()` (`e2e/lib/msalCache.ts`) and writes MSAL's
  localStorage cache with an init script before any page script runs, so
  `@azure/msal-browser` finds an already signed-in account and an id token, with
  no network calls. The token is HS256-signed with the JWT secret.
- **API side:** the backend `authMiddleware` first tries Azure AD/JWKS
  validation; it fails with the fake tenant, and it then accepts the token as a
  local JWT signed with `JWT_SECRET`.

| Setting | Default | Override env var |
| --- | --- | --- |
| Tenant id | `00000000-e2e-4000-8000-tenantid0001` | `E2E_ENTRA_TENANT_ID` |
| Client id | `00000000-e2e-4000-8000-clientid0001` | `E2E_ENTRA_CLIENT_ID` |
| JWT secret | `e2e-local-jwt-secret-do-not-use-in-prod` | `E2E_JWT_SECRET` |
| API base URL | `http://localhost:${API_PORT:-3140}` | `API_BASE_URL` |

Users (ids in `e2e/lib/seedIds.ts`): the default signed-in user is the
**owner**, `e2e-owner@pronghorn.test` (`seed.ownerUserId`), an organization
admin (`user_roles.role = 'admin'`) and owner of the seeded team. The **member**,
`e2e-member@pronghorn.test` (`seed.memberUserId`), is a plain organization
member with no admin role; use it for access-control checks. Sign in as another
user in a spec with `test.use({ mockUser: { id, email, name } })`, or as nobody
(share-token specs) with `test.use({ mockUser: null })`. For direct API calls
inside a spec use `api.get/post/put/delete(...)` and `tokenFor(user)` from
`e2e/lib/api.ts`.

To run the new app in your own browser against the E2E stack, serve it with
`serve-app.sh new <port>` and seed the same MSAL cache entries by hand (copy the
keys `buildMsalCacheEntries` produces into localStorage). There is no login
button flow for the fake tenant.

## Seed data

`e2e/seed.sql` is staged into Postgres' `docker-entrypoint-initdb.d` after all
`infra/migrations/*.sql` (as `zz-seed.sql`) by `stack.sh up`. The Postgres data
directory is tmpfs, so **every `stack.sh up` is a fresh, reseeded database**.
To reseed, recreate the stack: `stack.sh down && stack.sh up` (there is no
partial reseed; the old `npm run seed` script pointed at a file that never
existed and was removed).

Rules for editing the seed:

- **Additive and idempotent.** Every insert is `ON CONFLICT (...) DO NOTHING`
  with a fixed id. Never reorder or rewrite another WP's rows (several WPs merge
  into this file); append a new commented block.
- **Fixed ids, mirrored in `e2e/lib/seedIds.ts`.** Specs use `seed.*`, never
  hardcoded UUIDs. Ids look like `00000000-0000-4000-8000-000000000NNN`.
- **One id block per WP** (the last three hex digits are the block): baseline
  `001`-`7xx`; assurance team and apps `80x`-`84x`; versions/change pages
  `90x`-`92x`; release tool `930`-`93f`; mesh runs `960`-`96f`; packs and policy
  `970`-`97f`; onboarding steps 3-5 `990`-`99f`; all-teams `9b0`-`9be`. Check
  `seed.sql` and `seedIds.ts` for the next free block before adding one, and put
  the block range in the comment above your rows. Do not reuse an id another
  block already holds.
- Keep seed data for a new capability on its own project/team where possible, so
  it cannot shift the PR-xx regression specs that navigate the baseline project.
- No secrets in the seed (a security check rejects them); connections seed
  metadata only.
- Each spec still creates whatever it tests the creation of through the UI.

## Axe baselines

Every regression spec calls `recordAxeBaseline(page, pageId, testInfo)`, which
appends one line per (page, viewport) to
`e2e/baselines/axe-legacy.raw.jsonl` (the raw file is shared by `APP=legacy` and
`APP=new`; both npm scripts delete it first). It only records; it never fails a
test.

- `npm run test:legacy` then runs `scripts/build-axe-baseline.mjs`, which writes
  `baselines/axe-legacy.json` (max serious+critical per page and viewport). This
  is the reference for "no new violations" (spec D-13).
- For the new app, run `test:new` (or a subset) and then
  `node scripts/build-axe-baseline-new.mjs`. It aggregates the same raw file,
  diffs each row against `axe-legacy.json`, and writes `baselines/axe-new-f3.json`
  (the output name is hard-coded, `outPath` in the script). The other
  `axe-new-*.json` files are per-WP copies that testers renamed after a run;
  copy or rename the output the same way to keep a batch's result.
- The shell (`shell/axe-shell.spec.ts`) and the new-capability specs assert axe
  directly with `@axe-core/playwright` and target **zero violations**, not just
  zero serious/critical; they don't need a baseline file.

## Low-memory machines

The local Mac has 8 GB of RAM: one Docker/E2E stack at a time, and code work
(lint, tsc, unit tests) can stay parallel. To keep it stable:

- Run **one stack** (`stack.sh up`) and one served app at a time; run
  `stack.sh down` before starting another WP's or branch's stack. Prefer the
  default ports and project name.
- Pass `--workers=1` to Playwright (`playwright.config.ts` leaves workers
  unset locally, which means half the cores), and run **one spec file per call**
  and, when iterating, one `--project` (desktop or mobile).
- Unit tests: `npm test -- --maxWorkers=2` in `app/frontend-new` (and
  `npx jest --maxWorkers=2` in `app/backend`).
- Do not run `npm run build` or a full vitest run while the E2E stack and a
  Playwright run are active; run them before or after.
- Skip the e2e run entirely when you only need a fast check: `npx playwright test
  --list` and `npx tsc --noEmit -p e2e` catch most spec breakage without Docker.

## Cutover (T073: switching the primary host to `frontend-new`)

T073 made the switch **as code**, controlled by the Terraform variable
`primary_frontend` (`infra/variables.tf`): `"legacy"` (points production at
`module.frontend`, the pre-redesign app) or `"new"` (points production at
`module.frontend_new`, the spec-007 redesign). **Default is `"legacy"`.**
The cutover to `"new"` is a deliberate, later step — it is **not** performed
by T015's apply (which creates `module.frontend_new` at `next.<domain>` so
testers can verify it) and must not happen with no chance to verify first.
See `infra/variables.tf` for the full rationale.

`primary_frontend` only decides which app's URL is exposed as the
`primary_frontend_url` / `primary_frontend` Terraform outputs and which one is
listed first among Entra redirect URIs. It does **not** move DNS by itself —
Terraform has no Front Door, Application Gateway, or public DNS record wired
up for either frontend in this repo (`infra/modules/frontdoor/` and
`infra/modules/agw/` exist but are not instantiated by `main.tf`; the only
"host switch" this codebase manages is which `*_app_url_override` variable
holds the production custom domain, which both the Entra redirect URIs and
the APIM CORS origins already read unconditionally for **both** frontends).

The full sequence, run by a human, in order:

### 1. Apply T015 with `primary_frontend` at its default (`"legacy"`)

Creates `module.frontend_new` at `next.<domain>` (via
`frontend_new_app_url_override`) alongside the still-primary legacy app.
Production traffic is untouched — `primary_frontend` stays `"legacy"` (leave
`PRIMARY_FRONTEND` / the tfvars `primary_frontend` line unset/commented so
the Terraform default applies).

### 2. Verify `next.<domain>`

Testers exercise `app/frontend-new` at `next.<domain>` independently of
production. Do not proceed to step 3 until this, and the final regression
run (T071, PR-01…PR-22 at 1440 and 390), are both green.

### 3. Set `primary_frontend = "new"` and apply

Once next.<domain> is verified and the regression run is green, in the
target environment's `infra/params/<branch>.tfvars` (or `vars.PRIMARY_FRONTEND`
in the GitHub Environment, for the CI-driven `platform-deploy.yml` path):

- Set `frontend_new_app_url_override` to the production custom domain (the
  value that used to live in `frontend_app_url_override`), e.g.
  `frontend_new_app_url_override = "https://app.<domain>"`.
- Decide the fate of `frontend_app_url_override` (legacy's URL): either leave
  it pointing at the legacy custom domain (e.g. rename it to
  `https://legacy.<domain>` — a working, deliberately-secondary alias until
  T074 deletes `module.frontend`) or clear it so legacy falls back to its
  auto-generated Container App FQDN. Either is safe: `entra_app_redirect_uris`
  is a fixed list, and CORS/redirect URIs are populated for both frontends
  regardless of which is primary.
- Set `primary_frontend = "new"` explicitly (tfvars line, or
  `vars.PRIMARY_FRONTEND = "new"`).
- `terraform plan` and review: expect the Entra app registration's
  `redirect_uris` list to reorder (new frontend's URI first) and, since
  `frontend_new_app_url_override` changed, the `frontend_new` build's
  `VITE_AZURE_REDIRECT_URI` env var to change (redeploys the `frontend_new`
  revision) plus the APIM CORS origin list.
- `terraform apply`.

`next.<domain>` itself — what happens to it once `frontend_new_app_url_override`
points at the production domain instead — is covered separately below.

### 4. Repoint the production DNS record

Update the DNS record for the production custom domain (CNAME / A record,
managed outside this repo — see the environment's DNS provider) so it
resolves to `frontend_new`'s Container App FQDN
(`terraform output frontend_new_fqdn`) instead of legacy's
(`terraform output frontend_fqdn`). Do this **after** step 3's apply, once
the Entra redirect URI and CORS origin are live, to avoid a window where the
domain resolves to `frontend_new` but auth/CORS still expect legacy.

### 5. Verify Entra / APIM, then smoke test

- Verify in the Azure Portal (Entra ID → App registrations → this app →
  Authentication) that the new redirect URI is present, and in APIM (or
  `terraform output`) that the CORS origin list includes the production
  domain.
- Smoke test: load the production domain, sign in (MSAL), confirm API calls
  succeed (no CORS errors in the browser console).

### 6. Rollback

Set `primary_frontend = "legacy"` and revert `frontend_app_url_override` /
`frontend_new_app_url_override` back to their pre-cutover values in
`infra/params/<branch>.tfvars` (or `vars.PRIMARY_FRONTEND = "legacy"`),
`terraform apply`, then repoint the DNS record back at legacy's Container
App FQDN. Both apps stay deployed side by side until T074, so this is a
config-only rollback — no redeploy of `module.frontend` is needed.

### `next.<domain>` — what happens to it

`next.<domain>` was `frontend_new`'s tester-verification host from step 1/2
(via `frontend_new_app_url_override`, before the cutover in step 3). Once
`frontend_new_app_url_override` is repointed to the production domain (step
3), `next.<domain>` is **no longer** the value Terraform bakes into
`VITE_AZURE_REDIRECT_URI` / the Entra redirect URI / the CORS origin for
`frontend_new` — so if the DNS record for `next.<domain>` is left in place
pointing at `frontend_new`'s Container App FQDN, the app will still *load*
there, but MSAL sign-in will fail (its redirect URI is no longer registered)
and, if `api_base_url_override` differs, direct API calls may be CORS-blocked.

Two supported outcomes — pick one per environment:

- **Retire it** (default assumption): once cutover is verified, delete the
  `next.<domain>` DNS record. It served its purpose (step 1/2's tester
  verification host) and has no further role after T074 removes
  `module.frontend`.
- **Keep it working** (e.g. as a permanent "next channel" preview alias): add
  `https://next.<domain>/` to `entra_app_redirect_uris` and
  `https://next.<domain>` to `allowed_origins` in the environment's
  `infra/params/<branch>.tfvars` — both are generic "additional URIs/origins"
  lists read unconditionally, independent of `primary_frontend`. The DNS
  record then keeps resolving to `frontend_new` (same Container App as the
  production domain — Container Apps serve multiple bound hostnames from the
  same revision) and both sign-in and CORS keep working.

### What T073 did *not* do

- Did not remove `app/frontend/`, its CI job, or `module "frontend"` — that's
  T074, done right after this cutover is verified (no transition period,
  per T074's task text).
- Did not touch `infra/modules/frontdoor/` or `infra/modules/agw/` — neither
  is instantiated anywhere in `infra/main.tf` in this repo, so there is no
  Front Door route / App Gateway backend to repoint.
- Did not run `terraform apply` or touch any real environment's state,
  DNS, or Entra app registration — validated with `terraform fmt -check`,
  `init -backend=false`, and `validate` only (see T073 in
  `specs/007-frontend-new/tasks.md`).
- Did not flip `primary_frontend` to `"new"` anywhere by default — the
  cutover (step 3 above) is always an explicit, later action taken once
  `next.<domain>` is verified and the final regression run is green.

## Onboarding: real sandbox run (T152)

CI never starts a real sandbox job: `e2e/new/us6.onboarding.spec.ts` reads seeded runs in fixed states (`e2e/seed.sql`, ids `…990`–`…99f`) and mocks the start and pull-request calls with `page.route`. The sandbox job apply is BLOCKED-EXTERNAL, so the real path is checked by hand once it exists:

1. Backend env: `ONBOARDING_JOB_DISPATCHER=azure` with `ONBOARDING_JOB_SUBSCRIPTION_ID`, `ONBOARDING_JOB_RESOURCE_GROUP` and `ONBOARDING_JOB_NAME` (the Container Apps Job), the dedicated onboarding sandbox Key Vault, and a GitHub App installation (or Azure DevOps connection) configured on Admin, then Integrations, with the target owner in its scope. For a local-only smoke test, `ONBOARDING_JOB_DISPATCHER=local` (or `memory`) runs a placeholder job.
2. Open `/assurance/t/<teamId>/onboard`, name the app, pick one or two repositories you can safely open pull requests against, and save the selection.
3. Continue to "Run in sandbox" and press "Start sandbox run". Check: log lines stream in without a reload; the status pill shows the run; closing the tab and reopening `?run=<id>` still shows the outcome.
4. On "Review output" check detected profile, stack, build and CI per repository, the baseline counts, and the generated files. A repository the job could not process shows its reason and is left out.
5. On "Open pull requests" press the button twice (confirm). Check one PR per repository on GitHub or Azure Repos with the generated CI, PR chips with numbers in the wizard, and the application in the team portfolio. Press it again: nothing duplicates (the call is idempotent).
6. Cancel path: start a run and use "Cancel onboarding" while it runs; the run ends `cancelled` and the job execution is stopped.
