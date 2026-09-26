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
INSERT INTO public.tech_stacks (id, org_id, name, description, created_by, type)
VALUES (
  '00000000-0000-4000-8000-000000000301',
  '00000000-0000-4000-8000-000000000001',
  'E2E Tech Stack',
  'Seeded for PR-05/PR-17 read coverage.',
  '00000000-0000-4000-8000-0000000000a1',
  'backend'
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

COMMIT;
