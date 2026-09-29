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
INSERT INTO public.standards_packs (version, notes)
VALUES
  ('2026.1', 'Seeded for US5 adoption coverage (older pack).'),
  ('2026.2', 'Seeded for US5 adoption coverage (latest pack).')
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

COMMIT;
