# Onboarding sandbox job

Spec 007 (`specs/007-frontend-new/`), epic B3, WP-BE6, task T141. Research
D-12: onboarding detects each repository's CI provider and generates the
mesh CI as GitHub Actions or Azure Pipelines, calling the shared templates
in `external/goa-standards-assurance-mesh` (`goa-standards/assurance-mesh@v3`
once WP-BE7's repository is published — see that work package's
BLOCKED-EXTERNAL note).

## What it does

For each selected repository:

1. A **short-lived, repo-scoped, read-only credential** is minted by the API
   (`app/backend/src/services/onboarding/sandbox/credentials.ts`) and written
   to the dedicated **onboarding sandbox Key Vault** — never a job-level
   Container Apps secret (the Jobs "start" REST call can't carry one — see
   "Secrets: the sandbox Key Vault" below), never baked into the image,
   never a long-lived secret, never logged. This container fetches the
   value itself at startup (`src/keyvault.ts`), given only the secret's
   *name*.
2. **Shallow, single-branch clone** (`src/clone.ts`) — read-only; this
   container never pushes or writes back to the repository.
3. **Detect** the CI provider (`.github/workflows/` -> GitHub Actions;
   `azure-pipelines.yml`/`.azure-pipelines/` -> Azure Pipelines; else falls
   back to the repository's own host) and stack profile (dotnet/node/java/
   python), in `src/detect.ts`.
4. **Generate** `.github/workflows/assurance-mesh.yml` or
   `azure-pipelines/assurance-mesh.yml`, calling the pinned mesh templates
   (`src/generateManifest.ts`).
5. **Report** progress and the final result back to the API
   (`POST /onboarding/runs/:id/callback`), authenticated by a per-run,
   short-lived bearer token this container reconstructs itself from a
   vault-fetched HMAC key plus a plaintext payload (never sent the
   assembled token — see "Secrets: the sandbox Key Vault") — or, in local
   single-repository mode, prints the result as one line of JSON on stdout.

`src/detect.ts` and `src/generateManifest.ts` are **copied** (by the
`Dockerfile`, at build time) from
`app/backend/src/services/onboarding/sandbox/` — the same files the
backend's `LocalJobDispatcher` fixture tests exercise. One file, one
behavior, both sides of the boundary; their tests live in
`app/backend/src/__tests__/services/onboarding/sandbox/` (this directory
has no test runner of its own for that logic — see "Testing" below).

## Two run modes

- **Job mode** (`PRONGHORN_CALLBACK_URL` set): the real path, one Container
  Apps Job execution processes every selected repository and reports back
  over HTTP. Started by
  `app/backend/src/services/onboarding/jobDispatcher.ts`'s
  `AzureContainerAppsJobDispatcher`.
- **Single-repository mode** (`PRONGHORN_REPO_FULL_NAME` set instead): one
  container, one repository, prints its `JobRepoResult` as JSON on stdout,
  no callback. Used by `DockerSandboxRunner` (the same file) for local
  development via `docker run`, and by hand for debugging.

## Environment variables

| Variable | Mode | Purpose |
|---|---|---|
| `PRONGHORN_RUN_ID` | job | The onboarding run id (report shape) |
| `PRONGHORN_CALLBACK_URL` | job | `POST` target for progress/result |
| `PRONGHORN_VAULT_URI` | job | The onboarding sandbox Key Vault's URI — every secret below is fetched from here |
| `PRONGHORN_IDENTITY_CLIENT_ID` | job | This job's user-assigned identity's client id (static per job, set by Terraform), for the IMDS token request in `src/keyvault.ts` |
| `PRONGHORN_CALLBACK_PAYLOAD` / `PRONGHORN_CALLBACK_KEY_SECRET_NAME` | job | The callback token's plaintext payload, and the vault secret name of its HMAC key — this container fetches the key and recomputes the token itself (never sent the assembled token) |
| `PRONGHORN_REPOSITORIES` | job | `[{"fullName": "..."}]` (no credentials — non-secret) |
| `PRONGHORN_REPO_CLONE_URL_<n>` / `PRONGHORN_REPO_AUTH_SECRET_NAME_<n>` | job | Per-repository clone URL (plain) / the vault secret **name** holding its `Authorization` header (never the value) |
| `PRONGHORN_REPO_FULL_NAME` / `PRONGHORN_REPO_CLONE_URL` / `PRONGHORN_REPO_AUTH` | single-repo | Same, unindexed, for one repository — passed **directly**, no vault (local dev only, see "Secrets" below) |
| `PRONGHORN_PACK_VERSION` | both | Standards pack version, e.g. `2026.3` |
| `MESH_SCRIPTS_REF` | both | The mesh templates' pinned commit SHA (never the mutable `v3` tag — placeholder all-zero SHA until WP-BE7 publishes a real release) |
| `PRONGHORN_API_URL` | both | `pronghorn_api_url`/`pronghornApiUrl` parameter baked into the generated manifest |

## Secrets: the sandbox Key Vault (fix round 1, item 1)

The Container Apps Jobs "start" REST call (`POST .../jobs/{name}/start`)
accepts a `JobExecutionTemplate` — containers/initContainers only. A
`configuration.secrets` block on that body is silently dropped, so a
`secretRef` env entry pointing at one never resolves; and job-level secrets
are shared by every execution, so writing them per run would let two
concurrent onboarding runs race and overwrite each other's callback token
and clone credentials.

Instead, every per-run secret is written to a **dedicated onboarding sandbox
Key Vault** (`infra/main.tf`'s `onboarding_sandbox_keyvault` — separate from
the platform's main vault) by the API, with an expiry a little past the
job's own timeout:

- The API's identity is **Key Vault Secrets Officer** on this vault (write
  at dispatch, delete at every terminal state —
  `app/backend/src/services/onboarding/sandbox/sandboxSecretStore.ts#cleanupSandboxSecrets`).
- This job's own identity gets a **custom role with exactly one dataAction**,
  `Microsoft.KeyVault/vaults/secrets/getSecret/action` (fix round 2, item A
  — `infra/main.tf`'s `onboarding_sandbox_kv_secret_getter`) — deliberately
  **not** the built-in "Key Vault Secrets User" role, which also grants
  `secrets/readMetadata/action` (list/enumerate every secret name in the
  vault). This is ONE shared vault for the whole platform's onboarding
  runs, across every organization, so the ability to list would let a
  compromised execution discover other runs' secret names — and, since its
  `getSecret` right is real, fetch them too. Get-only means it can only
  ever read the exact name(s) it was itself handed via its own env.
  `src/keyvault.ts` exposes only a by-name GET, never a list call, and the
  vault itself would reject one even if it did.

### Residual risk (fix round 2, item A)

Even with get-only access, a fully compromised execution can still read
**its own run's** secrets — the ones named in its own environment. That
residual exposure is bounded by:

- **Unguessable names.** Every secret name is
  `onboarding-<prefix>-<uuid>` (`sandboxSecretStore.ts#generateSecretName`),
  where `<uuid>` is `crypto.randomUUID()` — a UUIDv4 from Node's CSPRNG,
  122 bits of randomness. Guessing another run's name (get-only access has
  no other way to find one) is not a practical attack.
- **Short TTL.** Each secret expires a little past the job's own timeout
  even if cleanup never runs (a crash); the normal path deletes every
  secret immediately at the run's terminal state.
- **Read-only clone scope.** Every clone credential this role could ever
  fetch is itself read-only at the provider (GitHub: an installation token
  scoped to `contents: read` only; Azure Repos: whatever the organization's
  own configured PAT allows) — even a fully exfiltrated credential grants
  no write access to the repository it names.

The "start" call then carries only non-secret env: the run id, callback URL,
the vault's URI, and secret **names**. This container fetches each value
itself (`src/keyvault.ts`, raw REST + the Azure Instance Metadata Service —
no `@azure/identity`/`@azure/keyvault-secrets` SDK, to keep this image
small).

The callback token itself is never written to the vault as its own secret:
its HMAC signing key is (the same secret `onboarding_runs.callback_secret_ref`
already names), and this container is given only the token's plaintext
payload (`PRONGHORN_CALLBACK_PAYLOAD`) alongside that key's name — it fetches
the key and recomputes the exact same token
(`base64url(payload) + "." + base64url(hmacSha256(payload, key))`) that
`callbackAuth.ts#mintCallbackToken` produced, and that
`verifyCallbackToken` checks on the API side.

**Local dev is unaffected**: `LocalJobDispatcher`/`DockerSandboxRunner` never
touch the vault — single-repository mode gets its clone credential directly
via `PRONGHORN_REPO_AUTH` (research decision: "no vault in dev, behind the
same interface").

## Build and run locally

```sh
# From the repo root (the build context — see the Dockerfile header):
docker build -f infra/onboarding-sandbox/Dockerfile -t pronghorn-onboarding-sandbox:local .

# Single-repository mode (what DockerSandboxRunner does):
docker run --rm \
  -e PRONGHORN_REPO_FULL_NAME=goa/permits-api \
  -e PRONGHORN_REPO_CLONE_URL=https://github.com/goa/permits-api.git \
  -e PRONGHORN_REPO_AUTH="Basic <base64 x-access-token:TOKEN>" \
  pronghorn-onboarding-sandbox:local
```

### Real dev run (BLOCKED-EXTERNAL)

The acceptance target "a two-repo sample onboarded in dev in <= 10 minutes"
needs an actual Azure Container Apps Job, ACR push access, the dedicated
sandbox Key Vault (`terraform apply` of `module.onboarding_sandbox_keyvault`
and its RBAC role assignments), and a role assignment for the API's managed
identity — none of which exist in this sandboxed environment. The steps a
human runs once those exist are recorded
in `specs/007-frontend-new/quickstart.md`. This repository instead proves
the same *logic* end-to-end without any cloud dependency:
`app/backend/src/__tests__/services/onboarding/sandbox/localDispatcher.e2e.test.ts`
runs two fixture repositories (one GitHub Actions/Node.js, one Azure
Pipelines/.NET) through `LocalJobDispatcher`.

## Security notes

- **No long-lived secret in the image.** Every credential arrives as an
  environment variable of one job execution/container run and is scoped to
  exactly the repositories that run needs.
- **Never logged.** `src/clone.ts` injects the credential via
  `GIT_CONFIG_KEY_*`/`GIT_CONFIG_VALUE_*` environment variables rather than
  a CLI flag or a URL with the token embedded, so it never appears in the
  child process's argv (`ps`) or a captured URL.
- **Read-only.** No push, ever; the container's own scratch clone directory
  is deleted after each repository.
- **Non-root, minimal base image**: `node:20-alpine` plus `git` only.
- **Known gap (D-18):** an Azure DevOps `service_connection`-type
  integration holds its credential inside Azure DevOps/Pipelines itself —
  Pronghorn has no credential to clone with for such a repository at all.
  `credentials.ts#resolveCloneCredential` throws a clear error for this
  case rather than attempting to clone; such a repository surfaces a review
  note instead of failing the whole run. Only `pat`-type Azure DevOps
  connections support sandbox cloning today.

## Egress restriction (Terraform, `infra/main.tf`'s `onboarding_sandbox` job)

The job's Container Apps Environment is on a **dedicated delegated subnet**
with a **Network Security Group** allow-listing outbound HTTPS (443) to:
GitHub (`140.82.112.0/20`, `143.55.64.0/20`, `github.com`/`api.github.com`'s
published ranges), Azure DevOps (`dev.azure.com`/`*.visualstudio.com`,
Azure's `AzureDevOps` service tag), the **`AzureKeyVault` service tag**
(fix round 1, item 1 — the sandbox vault fetch above), and the API's own
address — and denies everything else outbound. **Documented limitation:** an NSG filters by IP
range, not by FQDN/SNI. GitHub's and Azure DevOps' IP ranges are published
and stable enough for an allow-list, but a fully FQDN-aware egress filter
(rejecting a request to an unexpected host that happens to share an allowed
IP range, e.g. a multi-tenant CDN) needs an **Azure Firewall** (or an
egress-filtering proxy) with FQDN filtering rules — not present in this
Terraform. See `infra/main.tf`'s `onboarding_sandbox` section and
`infra/variables.tf` for the exact rules and the gap note; wiring an Azure
Firewall in front of this subnet is a follow-up (BLOCKED-EXTERNAL: the
firewall's own SKU/cost approval, and DNS/egress design review).

## Testing

- Detection, manifest generation, and the local end-to-end fixture test all
  live in `app/backend/src/__tests__/services/onboarding/sandbox/` (see
  above) — they exercise the exact files this image copies in.
- `src/clone.ts` and `src/entrypoint.ts` are thin, OS-process-level
  wrappers (spawn `git`, read env vars, `fetch` the callback URL) with no
  independent logic worth unit-testing beyond what's already covered by
  `clone.ts`'s design (env-var credential injection, `--depth 1
  --single-branch`) and the shared modules' tests; they're exercised for
  real by the local `docker run` above.
