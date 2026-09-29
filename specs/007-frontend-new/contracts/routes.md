# Contract: Route Map and Regression Checklist

`app/frontend-new` is a fork of `app/frontend` (research D-1), so every capability exists from day one. This contract covers two things:

1. **Where each page lives** in the new URL structure, and the redirects from legacy routes (CR-003).
2. **The regression checklist** that proves the redesign didn't break anything. It's the cutover gate (SC-001). A row passes when its Playwright smoke test, first written against the **legacy** app (T017), also passes against the new app on the live stack.

Share tokens: legacy `/project/:id/<page>/t/:token` → new `/p/:id/<route>?t=:token`. The existing `useShareToken` hook keeps working. The router only rewrites the URL form.

## 1. Route map

| Legacy route | New route | Layout | Restyle work package |
|---|---|---|---|
| `/` (Landing) | `/welcome` (public). `/` redirects to `/projects` when signed in | Public | WP-P1 |
| `/auth`, `/auth/callback`, `/github/callback` | same | Public | WP-L5 |
| `/terms`, `/privacy`, `/license` | same | Public | WP-P1 |
| `/dashboard` | `/projects` | Root | WP-P2 |
| `/gallery` | `/library/gallery` | Library | WP-L4 |
| `/standards` | `/library/standards` | Library | WP-L1 |
| `/tech-stacks` | `/library/tech-stacks` | Library | WP-L2 |
| `/build-books`, `/build-books/new`, `/build-books/:id`, `/build-books/:id/edit` | `/library/build-books[/new|/:id|/:id/edit]` | Library | WP-L3 |
| `/settings/profile`, `/settings/organization` | same | Root | WP-L5 |
| — (new, US5) | `/admin/integrations` | Root | WP-A6 (built new) |
| `/project/:id/settings` | `/p/:id/settings` | Project | WP-P3 |
| `/project/:id/requirements` | `/p/:id/v/current/define/requirements` | Project | WP-D1 |
| `/project/:id/standards` | `/p/:id/v/current/define/standards` | Project | WP-D2 |
| `/project/:id/artifacts` | `/p/:id/v/current/define/artifacts` | Project | WP-D3 |
| `/project/:id/chat` | `/p/:id/v/current/define/chat` | Project | WP-D4 |
| `/project/:id/canvas` | `/p/:id/v/current/design/canvas` | Project | WP-G1 |
| `/project/:id/specifications` | `/p/:id/v/current/design/specifications` | Project | WP-G2 |
| `/project/:id/build` | `/p/:id/v/current/build/agent` | Project | WP-B1 |
| `/project/:id/repository` | `/p/:id/v/current/build/repository` | Project | WP-B2 |
| `/project/:id/database` | `/p/:id/v/current/build/database` | Project | WP-B3 |
| `/project/:id/deploy` | `/p/:id/v/current/ship/environments` | Project | WP-S1 |
| `/project/:id/audit` | `/p/:id/v/current/ship/audit` | Project | WP-S2 |
| `/project/:id/present` | `/p/:id/v/current/ship/present` | Project | WP-S3 |
| every `/project/:id/<page>/t/:token` | the route above + `?t=:token` | Project | WP-F3 (redirects) |
| — (new, US4) | `/p/:id/versions`, `/p/:id/changes/:changeId/:step?`, `/p/:id/v/:version/ship/release` | Project | WP-V1…V4 (built new) |
| — (new, US5, US6) | `/assurance/t/:teamId`, `/assurance/t/:teamId/apps/:appId`, `/assurance/t/:teamId/apps/:appId/runs`, `/assurance/t/:teamId/onboard/:step?`, `/assurance/all`, `/assurance/packs`, `/assurance/policy` | Assurance | WP-A1…A5, WP-O1…O2 (built new) |
| `*` | NotFound with search and links to Projects and Assurance | Root | WP-F3 |

`v/current` resolves to the selected version (D-7: a single "Building" version until B1). In `v/:version/...`, `:version` is a version **name** (canonical, e.g. `v1.1.0`, used in generated links) or a version **id** (the timeline strip navigates with ids); both resolve to the same version.

**Assurance query-param conventions** (state held in the URL via `useUrlState`; defaults are omitted):

| Route | Params |
|---|---|
| `/assurance/t/:teamId/apps/:appId/runs` | `?days=7\|14\|30` (window, default 7), `?run=<id>` (selected run; one outside the window shows a "not in this window" notice with a link to widen the window or clear it) |
| `/assurance/packs` | none |
| `/assurance/policy` | `?tab=policy\|exceptions`, `?scope=organization\|team\|application`, `?team=<id>`, `?app=<id>` |
| `/assurance/all` | `?f=attention` (only teams needing attention), `?s=name\|repos\|notReporting` (sort) |

## 2. Regression checklist

Each row lists the capabilities its smoke test exercises. Behavior must be **identical** to legacy. Only the layout, navigation and look may differ. ✅ = the legacy smoke test passes on the new app at 1440 and 390.

| ID | Area | Capabilities the smoke test exercises | Legacy source |
|---|---|---|---|
| PR-01 | Projects home | List mine and linked projects; create (standard and enhanced dialogs); clone; edit; delete with deletion counts; add a shared project; anonymous project warning and save-to-user; activity feed | `pages/Dashboard.tsx`, `components/dashboard/*` |
| PR-02 | Project settings | Name and details; LLM settings; tokens (create, roll, delete, roles); publish to gallery; splash image; delete | `pages/project/ProjectSettings.tsx`, `project/TokenManagement`, `admin/PublishProjectDialog` |
| PR-03 | Access | Share-token access with owner, editor and viewer roles; access banner; token recovery message | `project/AccessLevelBanner`, `TokenRecoveryMessage`, `hooks/useShareToken` |
| PR-04 | Requirements | Tree CRUD; AI decompose; expand; link standards; source upload; realtime | `components/requirements/*` |
| PR-05 | Project standards | Select and link standards and tech stacks; tree selectors; realtime | `pages/project/Standards.tsx`, `standards/*Selector` |
| PR-06 | Artifacts | Folder tree; universal upload and drop zone; PDF, DOCX, PPTX, XLSX and image viewers; move; rename; download; AI summarize; enhance image; visual recognition import; collaboration editor, chat, timeline and heatmap | `components/artifacts/*`, `collaboration/*` |
| PR-07 | Chat | Sessions CRUD and clone; streaming responses; attach context (artifacts, canvas, requirements, repo files, schema); summarize | `pages/project/Chat.tsx`, `project/*Selector` |
| PR-08 | Canvas | Nodes, edges, layers, lasso, palettes, zones, notes, labels; properties panels; AI architect and critic; agent flow; iterative enhancement; change heatmap and log; infographic; realtime | `components/canvas/*` |
| PR-09 | Specifications | Generate; saved specs; version history; set latest; download options | `components/specifications/*` |
| PR-10 | Build agent | Agent sessions; prompt editor; configuration; progress, status and file tree; chat viewer; raw LLM logs; abort; staging panel with diff; commit history | `components/build/*` |
| PR-11 | Repository | Repos (create, link, from template, clone public); prime repo; file tree with search and context menu; Monaco editor; create, rename, delete; content search; stage and unstage; commit; pull and push sync; PAT management; GitHub connect banner | `components/repository/*` |
| PR-12 | Database | Databases and external connections; schema tree and context menu; SQL editor; saved queries; results; table structure; import wizard (Excel, JSON, field mapper, ERD, SQL review, conflict resolution); database agent; migrations | `components/deploy/Database*`, `deploy/import/*` |
| PR-13 | Environments | Deployments CRUD; deploy, start, stop, restart; logs; env vars; service config; preview token; testing logs | `components/deploy/Deployment*`, `EnvVarEditor`, `TestingLogsViewer` |
| PR-14 | Audit | Configure; orchestrator run; activity and pipeline streams; blackboard; tesseract; knowledge graph (2D and WebGL); Venn; fit-gap; findings; coverage | `components/audit/*`, `hooks/useAuditPipeline` |
| PR-15 | Present | Presentations list; agent generation; layouts; slide canvas and renderer; notes; thumbnails; images; font scale; PDF export | `components/present/*` |
| PR-16 | Standards Library | Categories; tree manager; AI create standards; edit; attachments and resources | `pages/Standards.tsx`, `standards/*`, `resources/*` |
| PR-17 | Tech Stacks | Tree manager; edit items; resources | `pages/TechStacks.tsx`, `techstack/*` |
| PR-18 | Build Books | List; detail with docs viewer and chat; editor with cover upload; apply to project | `pages/BuildBook*.tsx`, `buildbook/*` |
| PR-19 | Gallery | Browse; preview; clone | `pages/Gallery.tsx`, `gallery/*` |
| PR-20 | Settings and admin | Profile; organization; admin access; superadmin cloud, GitHub and render managers; signup code validation | `pages/Settings.tsx`, `superadmin/*`, `auth/*` |
| PR-21 | Public | Landing, terms, privacy, license; PWA update prompt; theme toggle | `pages/Landing.tsx` etc. |
| PR-22 | Shell (new) | No remount across routes; tool and tab restored from the URL; mobile tab bar; status pill and center for long runs; keyboard focus; ⌘K search; legacy redirects | new (`PROPOSAL.md`) |

New capabilities (not in the regression gate; cutover doesn't wait for them): **NV-01…NV-06** versions and changes (US4), **NA-01…NA-07** assurance (US5), **NO-01…NO-05** onboarding (US6). See `tasks.md`.
