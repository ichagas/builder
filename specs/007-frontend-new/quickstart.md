# Quickstart: `app/frontend-new` (spec 007)

> This file currently has only the "Cutover" section, written as part of
> T073 (WP-X2). The rest of the quickstart (local dev setup, running the
> app, running tests) is T162's job — do not treat this file as complete
> until T162 lands.

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
