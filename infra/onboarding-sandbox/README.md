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
   (`app/backend/src/services/onboarding/sandbox/credentials.ts`) and handed
   to this container as an environment variable — never baked into the
   image, never a long-lived secret, never logged.
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
   short-lived bearer token (`callbackAuth.ts`) — or, in local single-
   repository mode, prints the result as one line of JSON on stdout.

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
| `PRONGHORN_CALLBACK_TOKEN` | job | Per-run bearer token (Container Apps Job **secret**, never a plain env value) |
| `PRONGHORN_REPOSITORIES` | job | `[{"fullName": "..."}]` |
| `PRONGHORN_REPO_CLONE_URL_<n>` / `PRONGHORN_REPO_AUTH_<n>` | job | Per-repository clone URL / `Authorization` header (the latter always a **secret**) |
| `PRONGHORN_REPO_FULL_NAME` / `PRONGHORN_REPO_CLONE_URL` / `PRONGHORN_REPO_AUTH` | single-repo | Same, unindexed, for one repository |
| `PRONGHORN_PACK_VERSION` | both | Standards pack version, e.g. `2026.3` |
| `MESH_SCRIPTS_REF` | both | The mesh templates' pinned commit SHA (never the mutable `v3` tag — placeholder all-zero SHA until WP-BE7 publishes a real release) |
| `PRONGHORN_API_URL` | both | `pronghorn_api_url`/`pronghornApiUrl` parameter baked into the generated manifest |

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
needs an actual Azure Container Apps Job, ACR push access, and a role
assignment for the API's managed identity — none of which exist in this
sandboxed environment. The steps a human runs once those exist are recorded
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
Azure's `AzureDevOps` service tag), and the API's own address — and denies
everything else outbound. **Documented limitation:** an NSG filters by IP
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
