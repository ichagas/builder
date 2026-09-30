# Quickstart: `app/frontend-new` (spec 007)

How to run the redesigned frontend, run the E2E suites against it, sign in with
mock auth, and seed data. Everything below was written from the scripts and
config in the repo (`e2e/`, `app/frontend-new/`); when one changes, change this
file. The Cutover section (T073, done in code by T074) and the onboarding sandbox check (T152) follow.

Contents: [Run the app](#run-the-app-locally) | [Backend](#backend) | [E2E stack](#e2e-stack) | [Running suites](#running-the-e2e-suites) | [Mock auth](#mock-auth) | [Seed data](#seed-data) | [Axe baselines](#axe-baselines) | [Low-memory machines](#low-memory-machines) | [Cutover](#cutover-t073t074-frontend-new-is-the-only-frontend) | [Onboarding sandbox](#onboarding-real-sandbox-run-t152)

## Run locally without Entra

No Microsoft Entra ID app registration needed. Development only.

```bash
cp .env.example .env                                  # root: uncomment AUTH_MODE=local and replace JWT_SECRET (openssl rand -hex 32); NODE_ENV=development is already set
cp app/frontend-new/.env.example app/frontend-new/.env   # VITE_AUTH_MODE=local, VITE_API_BASE_URL=http://localhost:3001
npm run dev:db          # Postgres on 5432/5433; migrations run on the first `docker compose up`
npm run dev:api         # API on http://localhost:3001 (logs "Auth mode: local")
npm run dev:frontend    # http://localhost:8080
```

Open http://localhost:8080/auth and sign in (defaults `dev@local.test` /
`Local Developer`). The API creates the user (marked `provider: local-dev`), an
app admin role and a "Local Dev" organization on first use. It never signs in
as, or promotes, an existing user it did not create (409). If the database
volume predates newer migrations, run `npm run dev:reset` (this wipes the local
DB volumes).

Guard rails: `AUTH_MODE=local` makes the API refuse to start unless `NODE_ENV`
is exactly `development` or `test`, on Azure-hosted runtimes, or with a
`JWT_SECRET` that is short or a placeholder (the example value is one on purpose:
generate yours with `openssl rand -hex 32`). `POST /api/v1/auth/dev-login` only
accepts direct requests from the local machine: loopback socket, a `localhost`
`Host` header, an `Origin` listed in `ALLOWED_ORIGINS` (if sent), and no
`X-Forwarded-For`/`Forwarded` (override with `AUTH_LOCAL_ALLOW_REMOTE=true` when
the API runs in a container). Blob storage stays off unless you set
`AZURE_STORAGE_ACCOUNT_NAME`. In the browser the sign-in form is only active in
the Vite dev server with `VITE_AUTH_MODE=local`; production builds always use MSAL.

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
| `VITE_AUTH_MODE` | `local` or `msal` (default). `local` (Vite dev server only) shows the local sign-in form and never constructs MSAL; see [Run locally without Entra](#run-locally-without-entra). Any other value, including the `mock` the E2E harness exports, keeps MSAL (the harness fakes sign-in through MSAL's cache). |
| `VITE_APP_CHANNEL` | `next` marks the redesigned app build; nothing branches on it today. |
| `VITE_GITHUB_ORG`, `VITE_COLLABORATION_SNAPSHOT_PREFETCH_LIMIT` | Optional. |

Real sign-in needs a real Entra app registration whose redirect URI matches
`VITE_AZURE_REDIRECT_URI`. Without one, use [local sign-in](#run-locally-without-entra)
above, or the E2E stack below, which signs in with a fake tenant.

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
specs against `app/frontend-new`. Needs Docker (Postgres) plus `npm ci` in
`app/backend`, the app under test, and `e2e/`.

```bash
e2e/scripts/stack.sh up                   # Postgres x2 (compose profile "e2e") + API on :3140
e2e/scripts/serve-app.sh new 8141         # app/frontend-new via vite dev on :8141
# ... run tests ...
e2e/scripts/stack.sh down                 # stops the API, `compose down -v` (data is gone)
```

Defaults (all overridable by env): `COMPOSE_PROJECT_NAME=pronghorn-e2e`,
`DB_PORT=55432`, `GENAPPS_DB_PORT=55433`, `API_PORT=3140`. Conventional app
ports: 8141 (the API's CORS allowlist covers 8140-8149 by
default; use `ALLOWED_ORIGINS` for anything else). `stack.sh up` starts the API
with `NODE_ENV=test`, fake Entra ids, `RATE_LIMIT_MAX=100000`, a fake storage
account and a scratch `STORAGE_BASE_PATH`; the API log is
`e2e/.run/<project>/api.log`. `serve-app.sh` exports the `VITE_*` values the
mock auth needs (`VITE_API_BASE_URL`, `VITE_AUTH_MODE=mock` (fake MSAL cache, not local mode), the fake tenant and
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
(default `http://localhost:${FE_PORT:-8140}`) picks the served app.
The legacy app and the `APP` switch were removed (T074); `e2e/routes.ts` maps pages to `app/frontend-new` URLs and tests
navigate only through `routes.*` helpers. `API_PORT` must be exported for the
test process too when you changed it.

```bash
cd e2e && npm ci
npm run test:new               # :8141, regression/ + shell/ (PR-01..PR-22)
npm run test:shell             # :8141, shell/ only (remount, redirects, mobile reach, shell axe)
npm run test:new-capabilities  # :8141, new/ (us4.versions, us5.assurance, us6.onboarding)
```

Each npm script honors `BASE_URL` or `FE_PORT`. Iterate on one file and one
viewport:

```bash
BASE_URL=http://localhost:8141 npx playwright test new/us5.assurance.spec.ts --project=desktop --workers=1 --reporter=list
npx playwright test --list      # parses every spec without starting a browser or stack
npx tsc --noEmit -p e2e         # type-check the specs
```

Specs import `test`/`expect` from `e2e/fixtures.ts`, never from
`@playwright/test`. Reports:
`npm run report` (HTML in `e2e/playwright-report`). Playwright is pinned to an
exact version (see `e2e/README.md`, "Playwright browser version").

Not covered by CI (needs external services or an LLM): a real GitHub App
install, Container Apps deploys, blob uploads, LLM-driven flows, and the real
onboarding sandbox job (see the manual T152 check below).

## Mock auth

The app only enters its local sign-in mode with `VITE_AUTH_MODE=local` in the Vite dev server (see [Run locally without Entra](#run-locally-without-entra)); the E2E harness exports `VITE_AUTH_MODE=mock`, which is not `local`, so it stays in MSAL mode. Sign-in in the E2E harness
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
`e2e/baselines/axe-legacy.raw.jsonl` (`test:new` deletes it first). It only records; it never fails a
test.

- `baselines/axe-legacy.json` is **frozen**: it was recorded once from the legacy
  app (max serious+critical per page and viewport) before that app was removed
  (T074) and is never regenerated. It is the reference for "no new violations"
  (spec D-13).
- Run `test:new` (or a subset) and then
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

## Cutover (T073/T074: `frontend-new` is the only frontend)

**Done in code; applying it is for whoever deploys later.** This repository is a
dev environment with no Azure behind it (user decision, 2026-09-30), so no
`terraform apply`, DNS change or Entra change has been run. T074 deleted
the legacy frontend app, its CI job and image build, and `module "frontend"`, and
removed the `primary_frontend` switch. Terraform now points production at
`module.frontend_new` unconditionally (the module name is kept to avoid churn;
it reuses `infra/modules/frontend`).

What the deployer does, per environment:

1. **Set the production domain.** In `infra/params/<branch>.tfvars` (or
   `vars.FRONTEND_NEW_APP_URL_OVERRIDE` in CI) set
   `frontend_new_app_url_override` to the production URL (for example
   `https://app.<domain>`). It becomes the MSAL redirect URI baked into the
   build (`VITE_AZURE_REDIRECT_URI`), the Entra App Registration redirect URI and
   an API CORS / APIM origin. Leave it unset to use the Container App's own
   FQDN (`terraform output frontend_new_url`). Any extra domains go in
   `entra_app_redirect_uris` / `allowed_origins`.
2. **Apply.** `terraform apply` creates (or, where a legacy app existed,
   replaces) the frontend Container App `ca-<project>-frontend-new`, its UAMI
   and AcrPull role assignment. The deploy workflow builds and pushes
   `pronghorn-frontend-new` and updates `ca-pronghorn-frontend-new`. If an
   environment still holds the old legacy Container App (`ca-<project>-frontend`),
   Terraform will destroy it on this apply; its ACR image and identity go with it.
3. **Repoint DNS.** Point the production domain's CNAME/A record at
   `terraform output frontend_new_fqdn`.
4. **Verify.** In Entra ID, App registrations, Authentication, confirm the
   production redirect URI is present; confirm the APIM CORS origins include the
   production domain (`terraform output`); smoke test sign-in and API calls.
5. **Rollback** is a code revert of the T074 commits plus a re-apply; there is
   no runtime switch any more.

Legacy URLs (for example `/build-books/:id`, `/project/:id/<page>`) keep working
through the nginx 301 redirects and the router's legacy redirect table (T072).

Not done here: `terraform apply`, DNS, Entra registration (all out of scope for
this dev environment). `infra/modules/frontdoor/` and `infra/modules/agw/` are not
instantiated in `infra/main.tf`, so there is no Front Door route or App Gateway
backend to repoint from this repository.

## Onboarding: real sandbox run (T152)

CI never starts a real sandbox job: `e2e/new/us6.onboarding.spec.ts` reads seeded runs in fixed states (`e2e/seed.sql`, ids `…990`–`…99f`) and mocks the start and pull-request calls with `page.route`. The sandbox job apply is BLOCKED-EXTERNAL, so the real path is checked by hand once it exists:

1. Backend env: `ONBOARDING_JOB_DISPATCHER=azure` with `ONBOARDING_JOB_SUBSCRIPTION_ID`, `ONBOARDING_JOB_RESOURCE_GROUP` and `ONBOARDING_JOB_NAME` (the Container Apps Job), the dedicated onboarding sandbox Key Vault, and a GitHub App installation (or Azure DevOps connection) configured on Admin, then Integrations, with the target owner in its scope. For a local-only smoke test, `ONBOARDING_JOB_DISPATCHER=local` (or `memory`) runs a placeholder job.
2. Open `/assurance/t/<teamId>/onboard`, name the app, pick one or two repositories you can safely open pull requests against, and save the selection.
3. Continue to "Run in sandbox" and press "Start sandbox run". Check: log lines stream in without a reload; the status pill shows the run; closing the tab and reopening `?run=<id>` still shows the outcome.
4. On "Review output" check detected profile, stack, build and CI per repository, the baseline counts, and the generated files. A repository the job could not process shows its reason and is left out.
5. On "Open pull requests" press the button twice (confirm). Check one PR per repository on GitHub or Azure Repos with the generated CI, PR chips with numbers in the wizard, and the application in the team portfolio. Press it again: nothing duplicates (the call is idempotent).
6. Cancel path: start a run and use "Cancel onboarding" while it runs; the run ends `cancelled` and the job execution is stopped.
