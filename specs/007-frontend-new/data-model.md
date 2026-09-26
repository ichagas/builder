# Data Model: New Backend Entities (B1–B3)

Existing tables are reused unchanged (see `infra/migrations/001_full_schema.sql`). Everything below is **additive**. Migrations start at `012_`. All tables have `id uuid primary key default gen_random_uuid()`, `created_at timestamptz default now()`, `updated_at timestamptz default now()`, and row-level authorization in RPC and routers following the existing `authorize_project_access` pattern.

## 1. Epic B1: Versions and changes (Builder projects, Approach 3)

Migration `012_versions_work_items.sql`

### `versions`
| Column | Type | Notes |
|---|---|---|
| project_id | uuid FK → projects ON DELETE CASCADE | |
| name | text | semver, e.g. `v1.4.3`. Unique per project |
| kind | text check in (`building`,`hotfix`,`next`,`planned`,`released`) | `building` is used only before the first release |
| is_current | boolean default false | Exactly one released version is current (partial unique index) |
| is_first_release | boolean default false | Places the flag on the timeline |
| released_at | timestamptz null | |
| released_by | uuid FK → profiles null | |
| release_notes | text null | Drafted by the agent |
| git_tag | text null | Set on release |

### `work_items` (changes)
| Column | Type | Notes |
|---|---|---|
| project_id | uuid FK → projects | |
| key | text | `WI-42`, sequential per project |
| version_id | uuid FK → versions null | null = not scheduled (triage) |
| type | text check in (`bug`,`enhancement`,`feature`) | |
| severity | text check in (`high`,`medium`,`low`) null | bugs only |
| title | text | |
| source | text | who reported or requested it |
| evidence | text null | |
| status | text check in (`triage`,`active`,`shipped`,`declined`) | |
| phase_state | jsonb | `{define, design, build, ship}` each `todo`,`active`,`done`,`skipped` |
| phase_notes | jsonb | short per-phase labels shown in the step bar |
| branch | text null | real Git branch created when the change is scheduled or accepted, e.g. `fix/wi-42-heic` (D-9) |
| preview_url | text null | set after "Send for review" |
| bug_report | jsonb null | `{steps[], expected, actual, environment}` |
| components | text[] | affected canvas node ids |
| agent_session_id | uuid FK → agent_sessions null | live run |

### `work_item_requirement_changes`
| Column | Type | Notes |
|---|---|---|
| work_item_id | uuid FK → work_items ON DELETE CASCADE | |
| requirement_id | uuid FK → requirements null | null when `kind = new` before it's created |
| kind | text check in (`new`,`changed`,`regression`) | |
| title | text | |
| criterion | text null | new acceptance criterion |

### Changes to existing tables
- `repo_staging.branch text not null default 'main'`, plus the index `(repo_id, branch)`. Commits from a change go to its real Git branch (D-9).
- `projects.stage text not null default 'building' check in ('building','released')`. Set by the first release.

**Rules:** Releases go out in order (`name` semver ascending). On release, unfinished `work_items` move to the next open version. Released versions are read-only.

## 2. Epic B2: Teams, applications and the Assurance Mesh (Option B)

Migrations `013_teams_applications.sql`, `014_assurance_mesh.sql`

### `teams`
| Column | Type | Notes |
|---|---|---|
| organization_id | uuid FK → organizations | |
| name | text | unique per organization |

### `team_members`
| Column | Type | Notes |
|---|---|---|
| team_id | uuid FK → teams ON DELETE CASCADE | |
| user_id | uuid FK → profiles | |
| role | text check in (`owner`,`member`) | |
| | | PK (team_id, user_id) |

Roles follow GitHub: `owner` or `member` per team. Organization admins (the existing admin role in `user_roles`) see **All teams** and set organization policy (research D-8).

### `applications`
| Column | Type | Notes |
|---|---|---|
| team_id | uuid FK → teams | |
| name | text | |
| owner_label | text | e.g. "Health · Environmental Public Health" |
| onboarded_at | timestamptz null | set when the first mesh run is received |

### `application_repositories`
| Column | Type | Notes |
|---|---|---|
| application_id | uuid FK → applications ON DELETE CASCADE | |
| provider | text check in (`github`,`azure_devops`) | |
| full_name | text | `goa/permits-api`, unique |
| default_branch | text default 'main' | main, master, develop… the mesh runs on PRs targeting it |
| ci_provider | text check in (`github_actions`,`azure_pipelines`) | where the mesh CI was generated (D-12) |
| profile | text check in (`dotnet`,`node`,`java`,`python`) | stack profile |
| stack_label | text | ".NET 8 · ASP.NET Core" |
| part | text | "APIs", "Front ends", "Batch & integration" (editable) |
| build_command | text | |
| pinned_pack | text FK → standards_packs(version) | from `pronghorn.standards.yml` |
| update_pr_number | int null | |
| update_pr_state | text null check in (`open`,`merged`,`closed`) | |
| report_secret_ref | text | Key Vault secret name for HMAC |
| last_report_at | timestamptz null | "not reporting" after 7 days |

### `standards_packs`
| Column | Type | Notes |
|---|---|---|
| version | text PK | `2026.3` |
| published_at | timestamptz | |
| notes | text | |
| changes | jsonb | `[{kind:new|changed, text, agent?}]` |
| workflow_ref | text | `goa-standards/assurance-mesh@v3` |

### `mesh_runs`
| Column | Type | Notes |
|---|---|---|
| repository_id | uuid FK → application_repositories | |
| commit_sha | text | |
| pr_number | int null | pull request that triggered it |
| base_branch | text | the default branch the PR targets (main, master, develop…) |
| pr_state | text check in (`open`,`merged`,`closed`) | updated by later runs and webhooks. A merged PR's evidence is its last run |
| trigger | text check in (`pull_request`,`manual`,`baseline`) | CI runs on PRs to the default branch (D-10) |
| pack_version | text | |
| verdicts | jsonb | `{green,yellow,red,blue}` each `pass`,`warn`,`fail`,`skip` |
| new_findings | int | after the baseline ratchet |
| asvs_passed | int null | out of 285 |
| alberta_passed | int null | out of 62 |
| report_url | text | blob URL of the full evidence |
| received_at | timestamptz | |

### `mesh_baselines`
| Column | Type | Notes |
|---|---|---|
| repository_id | uuid FK | |
| agent | text | green, yellow, red, blue |
| fingerprint | text | `(agent, rule, file, location)` hash |
| | | unique (repository_id, fingerprint) |

### `mesh_exceptions`
| Column | Type | Notes |
|---|---|---|
| repository_id | uuid FK | |
| rule | text | e.g. "Red recon" |
| reason | text | |
| approved_by | uuid FK → profiles | |
| expires_at | timestamptz | |

### `mesh_policy`
| Column | Type | Notes |
|---|---|---|
| scope | text check in (`organization`,`team`,`application`) | |
| scope_id | uuid | |
| agent | text | |
| mode | text check in (`issue`,`notify`,`block`,`off`) | default `issue` (notify + open an issue). `block` is TBD per check (D-15). A narrower scope may only tighten |

## 3. Epic B3: Onboarding runs

Migration `015_onboarding.sql`

### `onboarding_runs`
| Column | Type | Notes |
|---|---|---|
| team_id | uuid FK → teams | |
| application_name | text | |
| application_id | uuid FK → applications null | set when PRs are opened |
| pack_version | text | |
| status | text check in (`draft`,`running`,`ready`,`prs_open`,`completed`,`failed`,`cancelled`) | |
| step | text check in (`team`,`connect`,`sandbox`,`output`,`prs`) | wizard position (URL mirrors it) |
| job_execution_id | text null | Container Apps Job execution |
| log_blob | text null | |
| started_by | uuid FK → profiles | |

### `onboarding_run_repositories`
| Column | Type | Notes |
|---|---|---|
| run_id | uuid FK → onboarding_runs ON DELETE CASCADE | |
| full_name | text | |
| selected | boolean | |
| detected_profile | text | |
| detected_stack | text | |
| detected_build | text | |
| detected_ci | text | `github_actions` or `azure_pipelines` (determines the generated CI) |
| part | text | |
| review | jsonb | notes from the code review |
| generated_manifest | jsonb | list of generated files, with blob refs |
| baseline_counts | jsonb | `{green,yellow,red,blue}` |
| pr_number | int null | |
| pr_state | text null | |

## 4. Integrations (D-18)

Migration `016_integrations.sql`

### `integration_connections`
| Column | Type | Notes |
|---|---|---|
| organization_id | uuid FK → organizations | |
| provider | text check in (`github_app`,`azure_devops`) | |
| auth_type | text check in (`app_installation`,`service_connection`,`pat`) | Azure DevOps choice left to admins |
| display_name | text | |
| secret_ref | text | Key Vault secret name. **Never** the secret itself |
| scope | jsonb | org URL, projects or installation id |
| last_tested_at | timestamptz null | |
| status | text check in (`ok`,`failing`,`untested`) | |

`application_repositories` and `onboarding_runs` reference the connection used (`connection_id`). `mesh_policy` gains `cyber_risk_sandbox boolean default false` at repository or application scope (D-17).

## Realtime channels (new)
| Channel | Events |
|---|---|
| `versions-{projectId}` | version created, released, item moved |
| `work-item-{id}` | phase changed, agent progress |
| `team-{teamId}` | mesh run received, PR state changed, app added |
| `onboarding-{runId}` | log line, step state, completed |
