# Quickstart: `app/frontend-new` (spec 007)

> This file currently has only the "Cutover" section, written as part of
> T073 (WP-X2). The rest of the quickstart (local dev setup, running the
> app, running tests) is T162's job — do not treat this file as complete
> until T162 lands.

## Cutover (T073: switching the primary host to `frontend-new`)

T073 made the switch **as code**, controlled by the Terraform variable
`primary_frontend` (`infra/variables.tf`): `"legacy"` (points production at
`module.frontend`, the pre-redesign app) or `"new"` (points production at
`module.frontend_new`, the spec-007 redesign). **Default is `"new"`**, so
applying this commit's default performs the cutover — see `infra/variables.tf`
for the full rationale (short version: `app/frontend` has no live users yet,
and T074 removes it right after cutover, so there is no transition period to
protect).

`primary_frontend` only decides which app's URL is exposed as the
`primary_frontend_url` / `primary_frontend` Terraform outputs and which one is
listed first among Entra redirect URIs. It does **not** move DNS by itself —
Terraform has no Front Door, Application Gateway, or public DNS record wired
up for either frontend in this repo (`infra/modules/frontdoor/` and
`infra/modules/agw/` exist but are not instantiated by `main.tf`; the only
"host switch" this codebase manages is which `*_app_url_override` variable
holds the production custom domain, which both the Entra redirect URIs and
the APIM CORS origins already read unconditionally for **both** frontends).
The actual cutover is finished by a human, in this order:

### 1. Point the production custom domain at `frontend_new`

In the target environment's `infra/params/<branch>.tfvars`:

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
- Update the DNS record for the production custom domain (CNAME / A record,
  managed outside this repo — see the environment's DNS provider) so it
  resolves to `frontend_new`'s Container App FQDN
  (`terraform output frontend_new_fqdn`) instead of legacy's
  (`terraform output frontend_fqdn`).
- Confirm `primary_frontend = "new"` (the default — only set it explicitly if
  a prior rollback had pinned it to `"legacy"`).

### 2. `next.<domain>` — what happens to it

`next.<domain>` was `frontend_new`'s pre-cutover-only host (via
`frontend_new_app_url_override`, before this switch). Once
`frontend_new_app_url_override` is repointed to the production domain (step
1), `next.<domain>` is **no longer** the value Terraform bakes into
`VITE_AZURE_REDIRECT_URI` / the Entra redirect URI / the CORS origin for
`frontend_new` — so if the DNS record for `next.<domain>` is left in place
pointing at `frontend_new`'s Container App FQDN, the app will still *load*
there, but MSAL sign-in will fail (its redirect URI is no longer registered)
and, if `api_base_url_override` differs, direct API calls may be CORS-blocked.

Two supported outcomes — pick one per environment:

- **Retire it** (default assumption): once cutover is verified, delete the
  `next.<domain>` DNS record. It served its purpose (WP-F1/T015's parallel
  preview host) and has no further role after T074 removes `module.frontend`.
- **Keep it working** (e.g. as a permanent "next channel" preview alias): add
  `https://next.<domain>/` to `entra_app_redirect_uris` and
  `https://next.<domain>` to `allowed_origins` in the environment's
  `infra/params/<branch>.tfvars` — both are generic "additional URIs/origins"
  lists read unconditionally, independent of `primary_frontend`. The DNS
  record then keeps resolving to `frontend_new` (same Container App as the
  production domain — Container Apps serve multiple bound hostnames from the
  same revision) and both sign-in and CORS keep working.

### 3. Apply order

1. `terraform plan` and review: expect the Entra app registration's
   `redirect_uris` list to reorder (new frontend's URI first) and, if
   `frontend_new_app_url_override` changed, the `frontend_new` build's
   `VITE_AZURE_REDIRECT_URI` / `VITE_APP_CHANNEL=next` env vars to change
   (redeploys the `frontend_new` revision) plus the APIM CORS origin list.
2. `terraform apply`.
3. Update the production DNS record (step 1) — do this **after** apply, once
   the Entra redirect URI and CORS origin are live, to avoid a window where
   the domain resolves to `frontend_new` but auth/CORS still expect legacy.
4. Verify in the Azure Portal (Entra ID → App registrations → this app →
   Authentication) that the new redirect URI is present, and in APIM (or
   `terraform output`) that the CORS origin list includes the production
   domain.
5. Smoke test: load the production domain, sign in (MSAL), confirm API calls
   succeed (no CORS errors in the browser console).

### 4. Rollback

Set `primary_frontend = "legacy"` and revert `frontend_app_url_override` /
`frontend_new_app_url_override` back to their pre-cutover values in
`infra/params/<branch>.tfvars`, `terraform apply`, then repoint the DNS
record back at legacy's Container App FQDN. Both apps stay deployed side by
side until T074, so this is a config-only rollback — no redeploy of
`module.frontend` is needed.

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
