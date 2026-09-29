-- WP-F6 (T016): E2E baseline seed for the regression suite.
--
-- Additive and idempotent: every insert is `ON CONFLICT DO NOTHING` keyed on
-- the fixed ids below, so re-running this script against an already-seeded
-- database is a no-op. IDs are fixed (not random) so e2e/fixtures/seedIds.ts
-- can reference them directly without a lookup query.
--
-- This only seeds what most PR-xx specs need to exist *before* the test
-- runs (a signed-in user, one project, one standard, one tech stack, one
-- share token). Each spec is still responsible for creating whatever it is
-- itself testing the creation of (a new requirement, a new chat session,
-- etc.) through the UI, per T017's "main write works" checklist.
--
-- Run this after infra/migrations have applied (docker-entrypoint-initdb.d
-- runs migrations first, then any *.sql dropped into the same directory —
-- see e2e/scripts/stack.sh, which mounts this file after infra/migrations).

BEGIN;

-- Organization ----------------------------------------------------------
INSERT INTO public.organizations (id, name)
VALUES ('00000000-0000-4000-8000-000000000001', 'E2E Test Org')
ON CONFLICT (id) DO NOTHING;

-- Mock signed-in user (matches e2e/fixtures/seedIds.ts OWNER_USER) ------
INSERT INTO auth.users (id, email, raw_user_meta_data, email_verified)
VALUES (
  '00000000-0000-4000-8000-0000000000a1',
  'e2e-owner@pronghorn.test',
  '{"name":"E2E Owner"}'::jsonb,
  true
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.user_roles (user_id, role)
VALUES ('00000000-0000-4000-8000-0000000000a1', 'admin')
ON CONFLICT (user_id, role) DO NOTHING;

INSERT INTO public.profiles (id, user_id, org_id, display_name, email)
VALUES (
  '00000000-0000-4000-8000-0000000000a1',
  '00000000-0000-4000-8000-0000000000a1',
  '00000000-0000-4000-8000-000000000001',
  'E2E Owner',
  'e2e-owner@pronghorn.test'
)
ON CONFLICT (id) DO NOTHING;

-- Baseline project (PR-01, PR-02, PR-03, PR-05, PR-16, PR-17 read cases) -
INSERT INTO public.projects (id, name, description, org_id, created_by, organization)
VALUES (
  '00000000-0000-4000-8000-000000000101',
  'E2E Smoke Project',
  'Seeded baseline project for the WP-F6 regression suite.',
  '00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-0000000000a1',
  'E2E Test Org'
)
ON CONFLICT (id) DO NOTHING;

-- Share tokens for PR-03 (Access) -----------------------------------------
INSERT INTO public.project_tokens (id, project_id, token, role, label, created_by)
VALUES
  ('00000000-0000-4000-8000-000000000501', '00000000-0000-4000-8000-000000000101',
   '00000000-0000-4000-8000-000000000511', 'viewer', 'E2E viewer token',
   '00000000-0000-4000-8000-0000000000a1'),
  ('00000000-0000-4000-8000-000000000502', '00000000-0000-4000-8000-000000000101',
   '00000000-0000-4000-8000-000000000512', 'editor', 'E2E editor token',
   '00000000-0000-4000-8000-0000000000a1')
ON CONFLICT (id) DO NOTHING;

-- One requirement so Requirements/Standards tree pages have a read case --
INSERT INTO public.requirements (id, project_id, parent_id, type, title, content, code)
VALUES (
  '00000000-0000-4000-8000-000000000401',
  '00000000-0000-4000-8000-000000000101',
  NULL,
  'FEATURE',
  'E2E seeded requirement',
  'Seeded for PR-04 read coverage.',
  'REQ-1'
)
ON CONFLICT (id) DO NOTHING;

-- Standards library (PR-05, PR-16) ----------------------------------------
INSERT INTO public.standard_categories (id, name, description, org_id, created_by)
VALUES (
  '00000000-0000-4000-8000-000000000201',
  'E2E Category',
  'Seeded standards category.',
  '00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-0000000000a1'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.standards (id, category_id, code, title, description, org_id, created_by)
VALUES (
  '00000000-0000-4000-8000-000000000202',
  '00000000-0000-4000-8000-000000000201',
  'STD-1',
  'E2E seeded standard',
  'Seeded for PR-05/PR-16 read coverage.',
  '00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-0000000000a1'
)
ON CONFLICT (id) DO NOTHING;

-- Tech stacks (PR-05, PR-17) ------------------------------------------------
-- `type` is NULL here on purpose: it's a root-level tech stack (a category),
-- and `type` is only set on leaf items nested under one (see
-- TechStackTreeManager.tsx / EditTechStackItemDialog.tsx). The library page's
-- `get_tech_stacks_root` RPC (PR-17) filters on `parent_id IS NULL AND type
-- IS NULL`, so a non-NULL type here would make this row invisible there.
INSERT INTO public.tech_stacks (id, org_id, name, description, created_by, type)
VALUES (
  '00000000-0000-4000-8000-000000000301',
  '00000000-0000-4000-8000-000000000001',
  'E2E Tech Stack',
  'Seeded for PR-05/PR-17 read coverage.',
  '00000000-0000-4000-8000-0000000000a1',
  NULL
)
ON CONFLICT (id) DO NOTHING;

-- Build book (PR-18) ---------------------------------------------------------
INSERT INTO public.build_books (id, name, short_description, org_id, created_by)
VALUES (
  '00000000-0000-4000-8000-000000000601',
  'E2E Build Book',
  'Seeded for PR-18 read coverage.',
  '00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-0000000000a1'
)
ON CONFLICT (id) DO NOTHING;

-- Gallery (PR-19): publish the baseline project ----------------------------
INSERT INTO public.published_projects (id, project_id, name, description, published_by)
VALUES (
  '00000000-0000-4000-8000-000000000701',
  '00000000-0000-4000-8000-000000000101',
  'E2E Smoke Project',
  'Seeded for PR-19 gallery read coverage.',
  '00000000-0000-4000-8000-0000000000a1'
)
ON CONFLICT (id) DO NOTHING;

-- US5 Assurance console (T130, WP-A1; extended by T131-T136) ---------------
-- e2e-owner is already an organization admin (see user_roles insert above),
-- so one signed-in user covers both NA-01's "your teams" and "all teams for
-- org admins" (D-8) cases: team 801 they belong to, team 802 they don't
-- (visible only through GET /teams).
-- published_at is set explicitly: the API picks the latest pack with
-- ORDER BY published_at DESC, and rows inserted by one statement would
-- otherwise tie on now().
INSERT INTO public.standards_packs (version, notes, published_at)
VALUES
  ('2026.1', 'Seeded for US5 adoption coverage (older pack).', now() - interval '30 days'),
  ('2026.2', 'Seeded for US5 adoption coverage (latest pack).', now() - interval '1 day')
ON CONFLICT (version) DO NOTHING;

INSERT INTO public.teams (id, organization_id, name)
VALUES
  ('00000000-0000-4000-8000-000000000801', '00000000-0000-4000-8000-000000000001', 'Permits Platform'),
  ('00000000-0000-4000-8000-000000000802', '00000000-0000-4000-8000-000000000001', 'Licensing')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.team_members (team_id, user_id, role)
VALUES ('00000000-0000-4000-8000-000000000801', '00000000-0000-4000-8000-0000000000a1', 'owner')
ON CONFLICT (team_id, user_id) DO NOTHING;

INSERT INTO public.applications (id, team_id, name, owner_label, onboarded_at)
VALUES
  ('00000000-0000-4000-8000-000000000811', '00000000-0000-4000-8000-000000000801', 'Permits API', 'Permits squad', now() - interval '30 days'),
  ('00000000-0000-4000-8000-000000000812', '00000000-0000-4000-8000-000000000801', 'Permits Portal', 'Permits squad', now() - interval '10 days'),
  ('00000000-0000-4000-8000-000000000813', '00000000-0000-4000-8000-000000000802', 'Licensing API', 'Licensing squad', now() - interval '5 days')
ON CONFLICT (id) DO NOTHING;

-- application_repositories.full_name is globally unique -- see data-model.md
-- ("Canonical form, everywhere") -- so these use a namespaced "e2e-goa/..."
-- to never collide with a real org/repo.
INSERT INTO public.application_repositories
  (id, application_id, provider, full_name, default_branch, ci_provider, profile, stack_label, part, pinned_pack, last_report_at)
VALUES
  ('00000000-0000-4000-8000-000000000821', '00000000-0000-4000-8000-000000000811', 'github', 'e2e-goa/permits-api', 'main', 'github_actions', 'dotnet', '.NET 8', 'api', '2026.2', now() - interval '1 day'),
  ('00000000-0000-4000-8000-000000000822', '00000000-0000-4000-8000-000000000811', 'github', 'e2e-goa/permits-worker', 'main', 'github_actions', 'dotnet', '.NET 8', 'worker', '2026.1', now() - interval '10 days'),
  ('00000000-0000-4000-8000-000000000823', '00000000-0000-4000-8000-000000000812', 'github', 'e2e-goa/permits-portal', 'main', 'github_actions', 'node', 'Node 20', 'web', '2026.2', now() - interval '2 hours'),
  ('00000000-0000-4000-8000-000000000824', '00000000-0000-4000-8000-000000000813', 'github', 'e2e-goa/licensing-api', 'main', 'github_actions', 'java', 'Java 21', 'api', '2026.2', NULL)
ON CONFLICT (id) DO NOTHING;

-- US4 Versions and changes (T110, WP-V1) -------------------------------------
-- Its own project (not the shared baseline project 101): a real version
-- timeline and triage inbox here must never shift a PR-xx regression spec
-- that navigates the baseline project's `v/current/...` routes (those keep
-- exercising the D-7 "no versions yet" -> single "Building" node fallback).
INSERT INTO public.projects (id, name, description, org_id, created_by, organization)
VALUES (
  '00000000-0000-4000-8000-000000000102',
  'E2E Versions Project',
  'Seeded baseline project for the US4 versions/triage e2e coverage (NV-01, NV-02).',
  '00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-0000000000a1',
  'E2E Test Org'
)
ON CONFLICT (id) DO NOTHING;

-- One released "current" version (with the first-release flag) and one
-- open "next" version work is scheduled into -- NV-01's timeline needs
-- both a released node and an open one to show something other than the
-- D-7 fallback.
INSERT INTO public.versions (id, project_id, name, kind, is_current, is_first_release, released_at, git_tag)
VALUES
  ('00000000-0000-4000-8000-000000000901', '00000000-0000-4000-8000-000000000102', 'v1.4.2', 'released', true, true, now() - interval '60 days', 'v1.4.2'),
  ('00000000-0000-4000-8000-000000000902', '00000000-0000-4000-8000-000000000102', 'v1.5.0', 'next', false, false, NULL, NULL)
ON CONFLICT (id) DO NOTHING;

-- Triage inbox (NV-02): a high-severity bug (suggests a hotfix) and an
-- enhancement with no severity (suggests the next open version), both
-- unscheduled (version_id NULL, status 'triage'); plus one change already
-- scheduled into v1.5.0 so the "In progress" lane shows a non-zero count.
INSERT INTO public.work_items (id, project_id, key, version_id, type, severity, title, source, evidence, status)
VALUES
  ('00000000-0000-4000-8000-000000000911', '00000000-0000-4000-8000-000000000102', 'WI-1', NULL, 'bug', 'high',
   'Confirmation email shows the wrong submission date', 'Reported by the test team',
   'Applicants use this date as proof they applied before the deadline. Dates are sent in UTC, so after 5pm the email shows tomorrow''s date.',
   'triage'),
  ('00000000-0000-4000-8000-000000000912', '00000000-0000-4000-8000-000000000102', 'WI-2', NULL, 'enhancement', NULL,
   'Show the eligibility result faster', 'Requested by the caseworker lead',
   'Applicants wait about 3 seconds for the result today.',
   'triage'),
  ('00000000-0000-4000-8000-000000000913', '00000000-0000-4000-8000-000000000102', 'WI-3', '00000000-0000-4000-8000-000000000902', 'feature', NULL,
   'Applicants can save a draft and return later', 'Requested by the program area', NULL,
   'active')
ON CONFLICT (id) DO NOTHING;

-- Admin -> Integrations (T136, WP-A6, NA-08) -------------------------------
-- A non-admin org member, to prove the page (and the backend behind it)
-- refuse anyone but an organization admin. Never given a `user_roles`
-- 'admin' row -- unlike e2e-owner above.
INSERT INTO auth.users (id, email, raw_user_meta_data, email_verified)
VALUES (
  '00000000-0000-4000-8000-0000000000a2',
  'e2e-member@pronghorn.test',
  '{"name":"E2E Member"}'::jsonb,
  true
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.profiles (id, user_id, org_id, display_name, email)
VALUES (
  '00000000-0000-4000-8000-0000000000a2',
  '00000000-0000-4000-8000-0000000000a2',
  '00000000-0000-4000-8000-000000000001',
  'E2E Member',
  'e2e-member@pronghorn.test'
)
ON CONFLICT (id) DO NOTHING;

-- No secret values here -- an azure_devops PAT is Key Vault-only and never
-- appears in a seed file (see .github/agents/security.agent.md and BE8's
-- own doc comment in app/backend/src/routes/admin/integrations.ts).
-- `secret_ref` null + `status`='untested' represents "added, never tested",
-- same as a freshly-created service-connection row.
INSERT INTO public.integration_connections (id, organization_id, provider, auth_type, display_name, secret_ref, scope, status)
VALUES (
  -- Renumbered from ...901 at merge (collided with WP-O1's connection row).
  '00000000-0000-4000-8000-000000000903',
  '00000000-0000-4000-8000-000000000001',
  'azure_devops',
  'service_connection',
  'GOA Azure DevOps',
  NULL,
  '{"organizationUrl":"https://dev.azure.com/e2e-goa","projects":["Permits"],"serviceConnectionId":"e2e-service-connection"}'::jsonb,
  'untested'
)
ON CONFLICT (id) DO NOTHING;

-- Application page (T131, WP-A2; extends T130's seed) -- NA-03 (grouped
-- grid with per-check mesh verdicts) and NA-04 (group actions, exceptions).
-- permits-api (821, part "api") is on the latest pack with a clean run;
-- permits-worker (822, part "worker") is behind (2026.1), not reporting
-- (last_report_at 10 days old, above) and its latest run has a warning and
-- one new finding, so it's both "behind" and "new findings" and its
-- "worker" group gets a "Send update PRs" action (T131 NA-04).
INSERT INTO public.mesh_runs
  (id, repository_id, commit_sha, pr_number, base_branch, pr_state, trigger, pack_version, verdicts, new_findings, asvs_passed, alberta_passed, report_url, received_at)
VALUES
  ('00000000-0000-4000-8000-000000000831', '00000000-0000-4000-8000-000000000821', 'e2e-commit-831', 210, 'main', 'open', 'pull_request', '2026.2', '{"green":"pass","yellow":"pass","red":"pass","blue":"pass"}'::jsonb, 0, 285, 62, 'https://example.test/e2e/reports/831.json', now() - interval '1 day'),
  ('00000000-0000-4000-8000-000000000832', '00000000-0000-4000-8000-000000000822', 'e2e-commit-832', 211, 'main', 'open', 'pull_request', '2026.1', '{"green":"pass","yellow":"warn","red":"pass","blue":"skip"}'::jsonb, 1, 280, 60, 'https://example.test/e2e/reports/832.json', now() - interval '10 days')
ON CONFLICT (id) DO NOTHING;

-- One exception on permits-worker (Red recon, no test environment), for the
-- application page's Exceptions disclosure (T131, NA-04).
INSERT INTO public.mesh_exceptions (id, repository_id, rule, reason, approved_by, expires_at)
VALUES (
  '00000000-0000-4000-8000-000000000841',
  '00000000-0000-4000-8000-000000000822',
  'Red recon',
  'Batch job, no public endpoint',
  '00000000-0000-4000-8000-0000000000a1',
  now() + interval '180 days'
)
ON CONFLICT (id) DO NOTHING;

-- US6 Onboarding wizard (T150, WP-O1; extended by WP-O2) ------------------
-- A `github_app` connection scoped to owner "e2e-goa" for the E2E org, so
-- NO-02's repository-scope check (PUT .../onboarding/runs/:id/repositories,
-- DB-only -- no real GitHub API call) accepts an "e2e-goa/..." full_name
-- and refuses anything else with 403, deterministically and without a real
-- GitHub App installation in the e2e stack. `secret_ref` is null: an
-- `app_installation` connection reuses the platform's shared GitHub App
-- credentials, not a per-connection secret (data-model.md §4).
INSERT INTO public.integration_connections
  (id, organization_id, provider, auth_type, display_name, secret_ref, scope, status)
VALUES (
  -- Renumbered from ...901 at merge (collided with WP-A6's connection row).
  '00000000-0000-4000-8000-000000000904',
  '00000000-0000-4000-8000-000000000001',
  'github_app',
  'app_installation',
  'E2E GitHub',
  NULL,
  '{"owners":["e2e-goa"]}'::jsonb,
  'ok'
)
ON CONFLICT (id) DO NOTHING;

-- NV-06 Version scoping (T113, WP-V4) -------------------------------------
-- Requirement deltas on WI-3 (scheduled into v1.5.0), rendered above the
-- phase tool when browsing /p/<versions project>/v/<v1.5.0 id>/...
INSERT INTO public.work_item_requirement_changes (id, work_item_id, requirement_id, kind, title, criterion)
VALUES
  ('00000000-0000-4000-8000-000000000940', '00000000-0000-4000-8000-000000000913', NULL, 'new',
   'Saved drafts', 'A draft is kept for 30 days'),
  ('00000000-0000-4000-8000-000000000941', '00000000-0000-4000-8000-000000000913', NULL, 'changed',
   'Application submission', 'Submitting clears the saved draft')
ON CONFLICT (id) DO NOTHING;

-- US4 Release tool (T112, WP-V3, NV-05): ids 930..93f -----------------------
-- Two isolated projects (no release spec touches project 102). No repository
-- is linked, so the "repository-linked" check fails and a real release can't
-- go out (merge/tag need GitHub); the spec mocks the POST for the confirm flow.
-- 930: building era, v1.0.0 building, one shipped + one unfinished change.
-- 934: stage 'released'; v1.0.0 released; v1.0.1 hotfix and v1.1.0 next open
-- (v1.1.0 is blocked until v1.0.1 releases; one shipped, one carry-over).
INSERT INTO public.projects (id, name, description, org_id, created_by, organization, stage)
VALUES
  ('00000000-0000-4000-8000-000000000930', 'E2E Release First', 'NV-05: first-release checks.',
   '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000a1', 'E2E Test Org', 'building'),
  ('00000000-0000-4000-8000-000000000934', 'E2E Release Ordered', 'NV-05: in-order release with carry-over.',
   '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000a1', 'E2E Test Org', 'released')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.versions (id, project_id, name, kind, is_current, is_first_release, released_at, git_tag)
VALUES
  ('00000000-0000-4000-8000-000000000931', '00000000-0000-4000-8000-000000000930', 'v1.0.0', 'building', false, false, NULL, NULL),
  ('00000000-0000-4000-8000-000000000935', '00000000-0000-4000-8000-000000000934', 'v1.0.0', 'released', true, true, now() - interval '30 days', 'v1.0.0'),
  ('00000000-0000-4000-8000-000000000936', '00000000-0000-4000-8000-000000000934', 'v1.0.1', 'hotfix', false, false, NULL, NULL),
  ('00000000-0000-4000-8000-000000000937', '00000000-0000-4000-8000-000000000934', 'v1.1.0', 'next', false, false, NULL, NULL)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.work_items (id, project_id, key, version_id, type, severity, title, source, evidence, status)
VALUES
  ('00000000-0000-4000-8000-000000000932', '00000000-0000-4000-8000-000000000930', 'WI-1', '00000000-0000-4000-8000-000000000931', 'feature', NULL,
   'Applicants can upload supporting documents', NULL, NULL, 'shipped'),
  ('00000000-0000-4000-8000-000000000933', '00000000-0000-4000-8000-000000000930', 'WI-2', '00000000-0000-4000-8000-000000000931', 'bug', 'low',
   'Footer link opens in the same tab', NULL, NULL, 'active'),
  ('00000000-0000-4000-8000-000000000938', '00000000-0000-4000-8000-000000000934', 'WI-1', '00000000-0000-4000-8000-000000000937', 'bug', 'medium',
   'Status page shows a stale case count', NULL, NULL, 'shipped'),
  ('00000000-0000-4000-8000-000000000939', '00000000-0000-4000-8000-000000000934', 'WI-2', '00000000-0000-4000-8000-000000000937', 'enhancement', NULL,
   'Add a print view for the decision letter', NULL, NULL, 'active'),
  ('00000000-0000-4000-8000-00000000093a', '00000000-0000-4000-8000-000000000934', 'WI-3', '00000000-0000-4000-8000-000000000936', 'bug', 'high',
   'Confirmation email drops the case number', NULL, NULL, 'shipped')
ON CONFLICT (id) DO NOTHING;

-- US4 Change page (T111, WP-V2, NV-03/NV-04) --------------------------------
-- Own project (ids ...920-...92f only) so the change-page specs can't shift
-- WP-V1's triage/lane assertions on project 102. Keys are WI-92x, never
-- WI-<small n>, so another WP's seed rows can't collide on
-- UNIQUE (project_id, key). Read-only fixtures: tests that mutate a change
-- create their own through the API (desktop and mobile run concurrently).
INSERT INTO public.projects (id, name, description, org_id, created_by, organization)
VALUES (
  '00000000-0000-4000-8000-000000000920',
  'E2E Change Page Project',
  'Seeded project for the US4 change-page e2e coverage (NV-03, NV-04).',
  '00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-0000000000a1',
  'E2E Test Org'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.versions (id, project_id, name, kind, is_current, is_first_release, released_at, git_tag)
VALUES
  ('00000000-0000-4000-8000-000000000921', '00000000-0000-4000-8000-000000000920', 'v2.0.0', 'released', true, true, now() - interval '30 days', 'v2.0.0'),
  ('00000000-0000-4000-8000-000000000922', '00000000-0000-4000-8000-000000000920', 'v2.1.0', 'next', false, false, NULL, NULL),
  ('00000000-0000-4000-8000-000000000923', '00000000-0000-4000-8000-000000000920', 'v2.0.1', 'hotfix', false, false, NULL, NULL)
ON CONFLICT (id) DO NOTHING;

-- Two canvas nodes and an edge between them: the scoped canvas highlights
-- the affected ones and lists what they connect to.
INSERT INTO public.canvas_nodes (id, project_id, type, data)
VALUES
  ('00000000-0000-4000-8000-000000000926', '00000000-0000-4000-8000-000000000920', 'API', '{"label":"Checkout API"}'::jsonb),
  ('00000000-0000-4000-8000-000000000927', '00000000-0000-4000-8000-000000000920', 'DATABASE', '{"label":"Orders database"}'::jsonb),
  ('00000000-0000-4000-8000-000000000928', '00000000-0000-4000-8000-000000000920', 'WEB_COMPONENT', '{"label":"Marketing site"}'::jsonb)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.canvas_edges (id, project_id, source, target)
VALUES ('00000000-0000-4000-8000-000000000929', '00000000-0000-4000-8000-000000000920',
        '00000000-0000-4000-8000-000000000926', '00000000-0000-4000-8000-000000000927')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.work_items
  (id, project_id, key, version_id, type, severity, title, source, status, phase_state, phase_notes, branch, preview_url, bug_report, components)
VALUES
  -- 924: a bug in Define (design skipped), with a bug report and one delta (92a)
  ('00000000-0000-4000-8000-000000000924', '00000000-0000-4000-8000-000000000920', 'WI-920',
   '00000000-0000-4000-8000-000000000922', 'bug', 'high', 'Checkout total ignores the discount code', 'Reported by support', 'active',
   '{"define":"active","design":"skipped","build":"todo","ship":"todo"}'::jsonb, '{"define":"1 requirement"}'::jsonb,
   'fix/wi-920-checkout-total', NULL,
   '{"steps":["Add an item to the cart","Apply code SAVE10","Open checkout"],"expected":"Total is 10% lower","actual":"Total is unchanged","environment":"Production, Safari 18"}'::jsonb,
   '{}'),
  -- 925: an enhancement in Design, affecting the Checkout API and Orders database
  ('00000000-0000-4000-8000-000000000925', '00000000-0000-4000-8000-000000000920', 'WI-921',
   '00000000-0000-4000-8000-000000000922', 'enhancement', NULL, 'Send order confirmations by SMS', 'Requested by operations', 'active',
   '{"define":"done","design":"active","build":"todo","ship":"todo"}'::jsonb, '{}'::jsonb,
   'feat/wi-921-sms-confirmations', NULL, NULL,
   ARRAY['00000000-0000-4000-8000-000000000926','00000000-0000-4000-8000-000000000927']),
  -- 92b: built and reviewed, on the Ship step, with a preview
  ('00000000-0000-4000-8000-00000000092b', '00000000-0000-4000-8000-000000000920', 'WI-923',
   '00000000-0000-4000-8000-000000000922', 'feature', NULL, 'Guest checkout', 'Requested by the product owner', 'active',
   '{"define":"done","design":"skipped","build":"done","ship":"active"}'::jsonb, '{}'::jsonb,
   'feat/wi-923-guest-checkout', 'https://wi-923.preview.example.test', NULL, '{}'),
  -- 92c: shipped in the released v2.0.0 (locked, read-only)
  ('00000000-0000-4000-8000-00000000092c', '00000000-0000-4000-8000-000000000920', 'WI-922',
   '00000000-0000-4000-8000-000000000921', 'feature', NULL, 'Saved payment methods', 'Requested by the product owner', 'shipped',
   '{"define":"done","design":"done","build":"done","ship":"done"}'::jsonb, '{}'::jsonb,
   'feat/wi-922-saved-payments', NULL, NULL, '{}')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.work_item_requirement_changes (id, work_item_id, requirement_id, kind, title, criterion)
VALUES ('00000000-0000-4000-8000-00000000092a', '00000000-0000-4000-8000-000000000924', NULL, 'changed',
        'Order total includes discounts', 'A valid discount code lowers the checkout total')
ON CONFLICT (id) DO NOTHING;

-- WP-A3 (T132) mesh runs by day and evidence (NA-05); ids ...960-...96f.
-- Extra runs on assuranceApp1's repositories, all OLDER than the runs above
-- (831: 1 day, 832: 10 days) so each repository's *latest* run -- which
-- NA-03/NA-04 assert on -- is unchanged.
--   961 permits-api    2 days ago  merged PR 209, all pass
--   962 permits-api    3 days ago  closed PR 208 (never listed: closed-unmerged)
--   963 permits-worker 12 days ago merged PR 207, Red fail, 2 new findings (14-day window+)
--   964 permits-worker 20 days ago open PR 206 (30-day window only)
INSERT INTO public.mesh_runs
  (id, repository_id, commit_sha, pr_number, base_branch, pr_state, trigger, pack_version, verdicts, new_findings, asvs_passed, alberta_passed, report_url, received_at)
VALUES
  ('00000000-0000-4000-8000-000000000961', '00000000-0000-4000-8000-000000000821', 'e2e-commit-961', 209, 'main', 'merged', 'pull_request', '2026.2', '{"green":"pass","yellow":"pass","red":"pass","blue":"pass"}'::jsonb, 0, 285, 62, 'https://example.test/e2e/reports/961.json', now() - interval '2 days'),
  ('00000000-0000-4000-8000-000000000962', '00000000-0000-4000-8000-000000000821', 'e2e-commit-962', 208, 'main', 'closed', 'pull_request', '2026.2', '{"green":"pass","yellow":"pass","red":"pass","blue":"pass"}'::jsonb, 0, 285, 62, NULL, now() - interval '3 days'),
  ('00000000-0000-4000-8000-000000000963', '00000000-0000-4000-8000-000000000822', 'e2e-commit-963', 207, 'main', 'merged', 'pull_request', '2026.1', '{"green":"pass","yellow":"pass","red":"fail","blue":"pass"}'::jsonb, 2, 270, 58, 'https://example.test/e2e/reports/963.json', now() - interval '12 days'),
  ('00000000-0000-4000-8000-000000000964', '00000000-0000-4000-8000-000000000822', 'e2e-commit-964', 206, 'main', 'open', 'pull_request', '2026.1', '{"green":"pass","yellow":"pass","red":"pass","blue":"pass"}'::jsonb, 0, 268, 57, NULL, now() - interval '20 days')
ON CONFLICT (id) DO NOTHING;

-- US5 Packs, policy, exceptions (T133, WP-A4, NA-06): ids ...970-...97f -------
-- Two exceptions on Permits Portal's repository (application 812, whose
-- exceptions no other spec counts): one active, one already expired, for the
-- Policy page's Exceptions tab. (Not on Permits API: NA-03/NA-04 assert its
-- exception count.)
INSERT INTO public.mesh_exceptions (id, repository_id, rule, reason, approved_by, expires_at)
VALUES
  ('00000000-0000-4000-8000-000000000970', '00000000-0000-4000-8000-000000000823', 'Red recon', 'Governance fixture: static site, no test environment', '00000000-0000-4000-8000-0000000000a1', now() + interval '365 days'),
  ('00000000-0000-4000-8000-000000000971', '00000000-0000-4000-8000-000000000823', 'Green coverage', 'Governance fixture: lapsed deviation', '00000000-0000-4000-8000-0000000000a1', now() - interval '30 days')
ON CONFLICT (id) DO NOTHING;

-- US5 All teams (T134/T135, WP-A5, NA-07): 15 more repositories across two new
-- teams in the same organization. Ids: teams/apps in the 980..98f block, the
-- 15 repositories in the second block 9b0..9be (16 ids were not enough for
-- 2 teams + 3 apps + 15 repos). Full names are "e2e-goa/a5-*".
-- Isolation: existing NA-01..NA-08 specs only address teams 801/802 by id,
-- app 811..813 and repos 821..824, so these never change their counts. The
-- two teams only add rows to the "All teams" section of the switcher (names
-- avoid "Permits Platform" and "Licensing", which those specs match).
-- Fleet Services (980, 10 repos): 6 on the latest pack 2026.2, 4 not reporting.
-- Harbor Ops (981, 5 repos): 4 on 2026.2, 1 not reporting. e2e-member (not an
-- org admin) is a plain member of Fleet Services only, so /assurance/all and
-- Harbor Ops are refused for them while Fleet Services stays readable.
INSERT INTO public.teams (id, organization_id, name)
VALUES
  ('00000000-0000-4000-8000-000000000980', '00000000-0000-4000-8000-000000000001', 'Fleet Services'),
  ('00000000-0000-4000-8000-000000000981', '00000000-0000-4000-8000-000000000001', 'Harbor Ops')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.team_members (team_id, user_id, role)
VALUES ('00000000-0000-4000-8000-000000000980', '00000000-0000-4000-8000-0000000000a2', 'member')
ON CONFLICT (team_id, user_id) DO NOTHING;

INSERT INTO public.applications (id, team_id, name, owner_label, onboarded_at)
VALUES
  ('00000000-0000-4000-8000-000000000982', '00000000-0000-4000-8000-000000000980', 'Fleet Core', 'Fleet squad', now() - interval '40 days'),
  ('00000000-0000-4000-8000-000000000983', '00000000-0000-4000-8000-000000000980', 'Fleet Field', 'Fleet squad', now() - interval '20 days'),
  ('00000000-0000-4000-8000-000000000984', '00000000-0000-4000-8000-000000000981', 'Harbor Core', 'Harbor squad', now() - interval '15 days')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.application_repositories
  (id, application_id, provider, full_name, default_branch, ci_provider, profile, stack_label, part, pinned_pack, last_report_at)
VALUES
  ('00000000-0000-4000-8000-0000000009b0', '00000000-0000-4000-8000-000000000982', 'github', 'e2e-goa/a5-fleet-core-api', 'main', 'github_actions', 'dotnet', '.NET 8', 'api', '2026.2', now() - interval '1 day'),
  ('00000000-0000-4000-8000-0000000009b1', '00000000-0000-4000-8000-000000000982', 'github', 'e2e-goa/a5-fleet-core-web', 'main', 'github_actions', 'node', 'Node 20', 'web', '2026.2', now() - interval '2 days'),
  ('00000000-0000-4000-8000-0000000009b2', '00000000-0000-4000-8000-000000000982', 'github', 'e2e-goa/a5-fleet-core-worker', 'main', 'github_actions', 'dotnet', '.NET 8', 'worker', '2026.1', now() - interval '12 days'),
  ('00000000-0000-4000-8000-0000000009b3', '00000000-0000-4000-8000-000000000982', 'github', 'e2e-goa/a5-fleet-core-db', 'main', 'github_actions', 'java', 'Java 21', 'db', '2026.2', now() - interval '3 days'),
  ('00000000-0000-4000-8000-0000000009b4', '00000000-0000-4000-8000-000000000982', 'github', 'e2e-goa/a5-fleet-core-events', 'main', 'github_actions', 'node', 'Node 20', 'events', '2026.1', now() - interval '1 day'),
  ('00000000-0000-4000-8000-0000000009b5', '00000000-0000-4000-8000-000000000982', 'github', 'e2e-goa/a5-fleet-core-gateway', 'main', 'github_actions', 'node', 'Node 20', 'gateway', '2026.2', NULL),
  ('00000000-0000-4000-8000-0000000009b6', '00000000-0000-4000-8000-000000000982', 'github', 'e2e-goa/a5-fleet-core-batch', 'main', 'github_actions', 'python', 'Python 3.12', 'batch', NULL, now() - interval '20 days'),
  ('00000000-0000-4000-8000-0000000009b7', '00000000-0000-4000-8000-000000000983', 'github', 'e2e-goa/a5-fleet-field-app', 'main', 'github_actions', 'node', 'Node 20', 'app', '2026.2', now() - interval '1 day'),
  ('00000000-0000-4000-8000-0000000009b8', '00000000-0000-4000-8000-000000000983', 'github', 'e2e-goa/a5-fleet-field-sync', 'main', 'github_actions', 'dotnet', '.NET 8', 'sync', '2026.1', now() - interval '9 days'),
  ('00000000-0000-4000-8000-0000000009b9', '00000000-0000-4000-8000-000000000983', 'github', 'e2e-goa/a5-fleet-field-tools', 'main', 'github_actions', 'python', 'Python 3.12', 'tools', '2026.2', now() - interval '4 hours'),
  ('00000000-0000-4000-8000-0000000009ba', '00000000-0000-4000-8000-000000000984', 'github', 'e2e-goa/a5-harbor-api', 'main', 'github_actions', 'java', 'Java 21', 'api', '2026.2', now() - interval '1 day'),
  ('00000000-0000-4000-8000-0000000009bb', '00000000-0000-4000-8000-000000000984', 'github', 'e2e-goa/a5-harbor-ui', 'main', 'github_actions', 'node', 'Node 20', 'web', '2026.2', now() - interval '1 day'),
  ('00000000-0000-4000-8000-0000000009bc', '00000000-0000-4000-8000-000000000984', 'github', 'e2e-goa/a5-harbor-ingest', 'main', 'github_actions', 'dotnet', '.NET 8', 'ingest', '2026.1', now() - interval '1 day'),
  ('00000000-0000-4000-8000-0000000009bd', '00000000-0000-4000-8000-000000000984', 'github', 'e2e-goa/a5-harbor-reports', 'main', 'github_actions', 'python', 'Python 3.12', 'reports', '2026.2', now() - interval '8 days'),
  ('00000000-0000-4000-8000-0000000009be', '00000000-0000-4000-8000-000000000984', 'github', 'e2e-goa/a5-harbor-cli', 'main', 'github_actions', 'node', 'Node 20', 'cli', '2026.2', now() - interval '1 day')
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------
-- WP-O2 (T152): onboarding steps 3-5 (NO-03/04/05), ids ...990-...99f.
-- Runs in fixed states so the sandbox log, output review and PR steps render
-- without a real sandbox job (BLOCKED-EXTERNAL) or GitHub App: 990 ready
-- (991 with generated files, 992 with a sandbox error), 993 running (994),
-- 995 failed (996), 997 prs_open (998, PR #42 open, linked to Permits API).
-- ---------------------------------------------------------------------
INSERT INTO public.onboarding_runs (id, team_id, application_name, application_id, status, step, log_blob, started_by)
VALUES
  ('00000000-0000-4000-8000-000000000990', '00000000-0000-4000-8000-000000000801', 'E2E Sandbox Ready App', NULL, 'ready', 'output',
   E'cloning e2e-goa/onboard-ready\ndetected node\ngenerated 1 file', '00000000-0000-4000-8000-0000000000a1'),
  ('00000000-0000-4000-8000-000000000993', '00000000-0000-4000-8000-000000000801', 'E2E Sandbox Running App', NULL, 'running', 'sandbox',
   NULL, '00000000-0000-4000-8000-0000000000a1'),
  ('00000000-0000-4000-8000-000000000995', '00000000-0000-4000-8000-000000000801', 'E2E Sandbox Failed App', NULL, 'failed', 'sandbox',
   E'cloning e2e-goa/onboard-failed\nsandbox job failed', '00000000-0000-4000-8000-0000000000a1'),
  ('00000000-0000-4000-8000-000000000997', '00000000-0000-4000-8000-000000000801', 'E2E Prs Open App', '00000000-0000-4000-8000-000000000811', 'prs_open', 'prs',
   NULL, '00000000-0000-4000-8000-0000000000a1')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.onboarding_run_repositories
  (id, run_id, full_name, selected, detected_profile, detected_stack, detected_build, detected_ci, part, review, generated_manifest, baseline_counts, pr_number, pr_state)
VALUES
  ('00000000-0000-4000-8000-000000000991', '00000000-0000-4000-8000-000000000990', 'e2e-goa/onboard-ready', true,
   'node', 'Node.js', 'npm ci && npm run build', 'github_actions', 'APIs', '{}'::jsonb,
   '[{"path":".github/workflows/assurance-mesh.yml","content":"name: assurance-mesh\non: pull_request"}]'::jsonb,
   '{"green":3,"yellow":1,"red":0,"blue":2}'::jsonb, NULL, NULL),
  ('00000000-0000-4000-8000-000000000992', '00000000-0000-4000-8000-000000000990', 'e2e-goa/onboard-broken', true,
   NULL, NULL, NULL, NULL, NULL, '{"sandboxError":"clone failed: repository is empty"}'::jsonb, '[]'::jsonb, '{}'::jsonb, NULL, NULL),
  ('00000000-0000-4000-8000-000000000994', '00000000-0000-4000-8000-000000000993', 'e2e-goa/onboard-running', true,
   NULL, NULL, NULL, NULL, NULL, '{}'::jsonb, '[]'::jsonb, '{}'::jsonb, NULL, NULL),
  ('00000000-0000-4000-8000-000000000996', '00000000-0000-4000-8000-000000000995', 'e2e-goa/onboard-failed', true,
   NULL, NULL, NULL, NULL, NULL, '{}'::jsonb, '[]'::jsonb, '{}'::jsonb, NULL, NULL),
  ('00000000-0000-4000-8000-000000000998', '00000000-0000-4000-8000-000000000997', 'e2e-goa/onboard-opened', true,
   'node', 'Node.js', 'npm ci', 'github_actions', 'APIs', '{}'::jsonb,
   '[{"path":".github/workflows/assurance-mesh.yml","content":"name: assurance-mesh"}]'::jsonb,
   '{"green":1,"yellow":0,"red":0,"blue":0}'::jsonb, 42, 'open')
ON CONFLICT (id) DO NOTHING;

COMMIT;
