# Contract: API Usage and New Endpoints

## 1. Reused API (no changes)

Existing pages keep calling the API exactly as they do today, through the forked `src/lib/pronghornApiAdapter.ts` and `useRealtime*` hooks (research D-2). Nothing here changes in the redesign. Base: `VITE_API_BASE_URL` + `/api/v1`. Auth: MSAL bearer through APIM. Share token: `p_token` on `*_with_token` RPCs.

| Transport | Endpoint | Used by work packages |
|---|---|---|
| RPC | `POST /rpc/:fn`, 166 Postgres functions (listed in `app/backend/src/routes/rpc.ts`) | all project and library WPs |
| Functions | `POST /functions/:name` (AI, agents, repos, deploy: `decompose-requirements`, `expand-requirement`, `chat-stream-foundry`, `ai-architect`, `ai-architect-critic`, `generate-specification`, `coding-agent-orchestrator`, `orchestrate-agents`, `database-agent-orchestrator`, `database-agent-import`, `audit-orchestrator`, `presentation-agent`, `ingest-artifacts`, `summarize-artifact`, `summarize-chat`, `visual-recognition`, `enhance-image`, `generate-image`, `create-project`, `clone-project`, `delete-project`, `create-repo-from-template`, `create-empty-repo`, `link-existing-repo`, `clone-public-repo`, `sync-repo-pull`, `sync-repo-push`, `stage`, `unstage`, `commit`, `staging-operations`, `cloud-deployment`, `deployment-secrets`, `deployment-preview-token`, `manage-database`, `cloud-database`, `render-database`, `admin-management`, `superadmin-*`, `validate-signup-code`, `update-signup-validated`…) | D, G, B, S, L, P WPs |
| Table | `/db/:table` through the query builder (`select`/`insert`/`update`/`upsert`/filters) | only where legacy uses it (same tables) |
| Storage | `/storage/:bucket/...` | artifacts, build-book covers, images |
| Auth | `/auth/*` | unchanged (forked `AuthContext`); pages restyled in WP-L5 |
| Realtime | WebSocket `VITE_WS_URL` (or derived): `project-{id}` and existing per-domain channels used by the `useRealtime*` hooks | unchanged (forked `useRealtime*` hooks); WP-F5 bridges long runs to the status pill |

**Rules:**
- **Restyle WPs** don't change data calls.
- **New-capability WPs** (US4–US6) call the new endpoints below through typed TanStack Query hooks in `features/<domain>/api.ts`, validated with zod, and never with `fetch` in components.

## 2. New endpoints (additive, `/api/v1`)

All JSON. Errors follow `middleware/errorHandler.ts`. Every mutating endpoint returns the updated entity. Each group emits a realtime event on the channels listed in `data-model.md`.

### B1: Versions and changes
| Method | Path | Purpose |
|---|---|---|
| GET | `/projects/:projectId/versions` | Timeline: versions with counts |
| POST | `/projects/:projectId/versions` | Create a hotfix or planned version |
| POST | `/projects/:projectId/versions/:versionId/release` | Release (in-order rule, carry-over, tag, deploy through existing settings) |
| POST | `/projects/:projectId/first-release` | First release: checks, tag v1.0.0, lock the baseline, `projects.stage = released` |
| GET | `/projects/:projectId/release-checks` | Checks for the first or next release |
| GET | `/projects/:projectId/work-items?status=&versionId=` | Changes list and triage |
| POST | `/projects/:projectId/work-items` | New change (type, title, optional version) |
| GET | `/work-items/:id` | Change page |
| PATCH | `/work-items/:id` | Schedule or move version, edit, decline |
| POST | `/work-items/:id/steps/:step/complete` | Mark ready, approve, send for review |
| POST | `/work-items/:id/steps/design/unskip` | Add a design step |
| GET/POST | `/work-items/:id/requirement-changes` | Requirement deltas |

Token access: every route accepts `?token=` and authorizes through `authorize_project_access`, like the RPCs.

### B2: Teams, applications, mesh
| Method | Path | Purpose |
|---|---|---|
| GET | `/teams/mine` | Teams for the switcher |
| GET | `/teams` | All teams (organization admins) |
| GET | `/teams/:teamId/portfolio` | Apps + repos + totals (one call for the portfolio) |
| GET | `/applications/:appId` | Application page (repos, adoption, exceptions) |
| GET | `/applications/:appId/runs?days=7` | Mesh runs on PRs to the default branch, grouped by day (open and merged) |
| GET | `/mesh/runs/:runId` | Evidence (verdicts per agent + report URL) |
| POST | `/applications/:appId/update-prs` | Send update PRs (body: repo ids or group) |
| GET/POST | `/mesh/exceptions` | List and request exceptions |
| GET/PUT | `/mesh/policy?scope=&scopeId=` | Policy (a narrower scope may only tighten) |
| GET | `/packs` | Standards packs |
| **POST** | **`/mesh/runs`** | **Ingest from the generated CI (GitHub Actions or Azure Pipelines) on PRs to the default branch. HMAC header `X-Pronghorn-Signature`. No user auth.** |
| POST | `/mesh/runs/:runId/issue` | Open an issue (GitHub) or work item (Azure DevOps) for new findings (policy `issue`, D-15) |

`POST /mesh/runs`'s `repository` is the repository's canonical
`application_repositories.full_name` (data-model.md §2): `"<owner>/<repo>"`
for GitHub, `"<adoOrg>/<project>/<repo>"` for Azure Repos. The API matches it
**exactly** and does no normalization (it can't: a bare Azure repo name
doesn't identify the organization or project); the mesh CI templates are
responsible for sending the canonical form (`templates/mesh.yml` builds the
Azure one from `System.CollectionUri`/`System.TeamProject`/
`Build.Repository.Name` via `scripts/lib/repository.js`). A value that is
neither shape gets the same generic 401 as an unknown repository.

### Admin: Integrations (D-18), organization admins only
| Method | Path | Purpose |
|---|---|---|
| GET | `/admin/integrations` | Platform GitHub App status (`githubApp`) + this organization's `github_app` connections (`githubAppConnections`) + Azure DevOps connections (`azureDevOps`) with status |
| POST | `/admin/integrations` | `{ provider: "github_app", displayName, owners: string[] }` to configure the organization's GitHub import scope (see below; 409 if the organization already has one — use PATCH), or (default/omitted `provider`) add an Azure DevOps connection (service connection or PAT — the secret goes to Key Vault) |
| PATCH | `/admin/integrations/:id` | Update `displayName` and/or (a `github_app` connection only) `owners` |
| POST | `/admin/integrations/:id/test` | Test the connection: for `github_app`, confirms the installation can see at least one repository under every configured owner; for Azure DevOps, the existing org-URL/credential check |
| DELETE | `/admin/integrations/:id` | Remove it (blocked while repositories use it) |

A `github_app` connection holds no secret — the platform's single GitHub App
installation's credentials are env/Key Vault configuration, not something an
org admin provides here. Its `scope.owners` (1-50 GitHub user/organization
logins, validated against GitHub's login syntax and lowercased) is what
`GET /onboarding/github/repos` (B3 section, below) is scoped to: an
organization with no `github_app` connection configured sees an empty
onboarding import list, never every repository the shared installation can
see.

### B3: Onboarding
| Method | Path | Purpose |
|---|---|---|
| POST | `/onboarding/runs` | Create a draft (team, app name) |
| GET | `/onboarding/runs/:id` | Wizard state |
| GET | `/onboarding/github/repos?teamId=&q=` | Import list (GitHub App installation, scoped to `teamId`'s organization — see below) |
| GET | `/onboarding/azure/repos?teamId=&connectionId=&q=` | Import list (Azure Repos, via the organization's configured connection) |
| PUT | `/onboarding/runs/:id/repositories` | Selected repos: `{ repositories: [{ fullName, selected? }] }`, each `fullName` a canonical full_name (`owner/repo` or `adoOrg/project/repo`, as returned by the import lists) — anything else is 422 |
| POST | `/onboarding/runs/:id/start` | Start the sandbox job (Container Apps Job) |
| GET | `/onboarding/runs/:id/output` | Review, generated files, baselines per repo |
| POST | `/onboarding/runs/:id/pull-requests` | Open one PR per repo: GitHub (GitHub App) or Azure Repos, with the generated CI for that platform |
| POST | `/onboarding/runs/:id/cancel` | Cancel |

`GET /onboarding/github/repos` takes `teamId`, not a client-supplied `org`
(fix round 1, item 6): the organization is derived from the team
server-side, and only repositories owned by a GitHub login in that
organization's configured `github_app` integration connection scope
(`integration_connections.scope.owner`/`.owners`) are returned — an
organization with no such connection configured gets an empty list, never
every repository the platform's single, shared GitHub App installation can
see. `GET /onboarding/azure/repos` is scoped the same way through
`connectionId` (defaulting to the organization's sole Azure DevOps
connection), which is itself always resolved within the caller's own
organization (WP-BE8).

The run object returned by every B3 endpoint above carries a `warnings:
string[]` field (fix round 1, item 10): one generic message per repository
whose most recent `pull-requests` confirm could not open a PR for it (no
generated files, a disallowed generated path, or an upstream GitHub/Azure
DevOps failure — never the raw upstream error text, which is logged
server-side only). Empty once every selected repository has an open PR.

Realtime: `onboarding-{runId}` streams `{type:"log"|"step"|"done", ...}`.
