-- 012_versions_work_items.sql
-- Epic B1: Versions and changes (Builder projects, Approach 3).
--
-- Additive migration per specs/007-frontend-new/data-model.md §1. Introduces
-- the version timeline (`versions`), the change/work-item tracker
-- (`work_items`), and the requirement deltas each work item can carry
-- (`work_item_requirement_changes`); also extends `repo_staging` with the
-- real Git branch a change's commits land on (D-9), and `projects` with a
-- `stage` flag flipped by the first release.
--
-- Idempotent: safe to run multiple times and safe to run inside the same
-- docker-entrypoint-initdb.d batch as 001/009/010/011 (alphabetical order)
-- and via app/backend/src/migrate.ts's tracked migration runner.

-- Table: public.versions
CREATE TABLE IF NOT EXISTS public.versions (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    name text NOT NULL,
    kind text NOT NULL CHECK (kind IN ('building', 'hotfix', 'next', 'planned', 'released')),
    is_current boolean NOT NULL DEFAULT false,
    is_first_release boolean NOT NULL DEFAULT false,
    released_at timestamp with time zone,
    released_by uuid REFERENCES public.profiles(id),
    release_notes text,
    git_tag text,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    PRIMARY KEY (id),
    CONSTRAINT versions_project_id_name_key UNIQUE (project_id, name)
);

COMMENT ON TABLE public.versions IS
    'Version timeline for a Builder project (Approach 3): building/hotfix/next/planned/released. Exactly one released version is "current" per project (see versions_one_current_per_project below).';
COMMENT ON COLUMN public.versions.kind IS
    '''building'' is used only before the first release.';
COMMENT ON COLUMN public.versions.is_current IS
    'Exactly one released version is current per project (enforced by the partial unique index below).';
COMMENT ON COLUMN public.versions.is_first_release IS
    'Places the flag on the timeline for the version that carried the project''s first release.';

CREATE INDEX IF NOT EXISTS idx_versions_project_id ON public.versions USING btree (project_id);

-- Exactly one CURRENT version per project. A partial unique index (rather
-- than a boolean-column trick) lets `is_current = false` repeat freely.
CREATE UNIQUE INDEX IF NOT EXISTS versions_one_current_per_project
    ON public.versions (project_id)
    WHERE is_current;

-- Table: public.work_items
CREATE TABLE IF NOT EXISTS public.work_items (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    key text NOT NULL,
    version_id uuid REFERENCES public.versions(id),
    type text NOT NULL CHECK (type IN ('bug', 'enhancement', 'feature')),
    severity text CHECK (severity IN ('high', 'medium', 'low')),
    title text NOT NULL,
    source text,
    evidence text,
    status text NOT NULL CHECK (status IN ('triage', 'active', 'shipped', 'declined')) DEFAULT 'triage',
    phase_state jsonb NOT NULL DEFAULT '{"define":"todo","design":"todo","build":"todo","ship":"todo"}'::jsonb,
    phase_notes jsonb NOT NULL DEFAULT '{}'::jsonb,
    branch text,
    preview_url text,
    bug_report jsonb,
    components text[] NOT NULL DEFAULT '{}'::text[],
    agent_session_id uuid REFERENCES public.agent_sessions(id),
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    PRIMARY KEY (id),
    CONSTRAINT work_items_project_id_key_key UNIQUE (project_id, key)
);

COMMENT ON TABLE public.work_items IS
    'Changes tracked against a Builder project: bugs, enhancements, features. `key` is sequential per project (WI-42).';
COMMENT ON COLUMN public.work_items.version_id IS
    'null = not scheduled (triage).';
COMMENT ON COLUMN public.work_items.severity IS
    'Bugs only.';
COMMENT ON COLUMN public.work_items.phase_state IS
    'Per-phase state: {define, design, build, ship} each todo|active|done|skipped.';
COMMENT ON COLUMN public.work_items.phase_notes IS
    'Short per-phase labels shown in the step bar.';
COMMENT ON COLUMN public.work_items.branch IS
    'Real Git branch created when the change is scheduled or accepted, e.g. fix/wi-42-heic (D-9).';
COMMENT ON COLUMN public.work_items.preview_url IS
    'Set after "Send for review".';
COMMENT ON COLUMN public.work_items.bug_report IS
    '{steps[], expected, actual, environment}';
COMMENT ON COLUMN public.work_items.components IS
    'Affected canvas node ids.';
COMMENT ON COLUMN public.work_items.agent_session_id IS
    'Live agent run driving this change, if any.';

CREATE INDEX IF NOT EXISTS idx_work_items_project_id ON public.work_items USING btree (project_id);
CREATE INDEX IF NOT EXISTS idx_work_items_version_id ON public.work_items USING btree (version_id);
CREATE INDEX IF NOT EXISTS idx_work_items_status ON public.work_items USING btree (status);

-- Table: public.work_item_requirement_changes
CREATE TABLE IF NOT EXISTS public.work_item_requirement_changes (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    work_item_id uuid NOT NULL REFERENCES public.work_items(id) ON DELETE CASCADE,
    requirement_id uuid REFERENCES public.requirements(id),
    kind text NOT NULL CHECK (kind IN ('new', 'changed', 'regression')),
    title text NOT NULL,
    criterion text,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    PRIMARY KEY (id)
);

COMMENT ON COLUMN public.work_item_requirement_changes.requirement_id IS
    'null when kind = new, before the requirement is created.';
COMMENT ON COLUMN public.work_item_requirement_changes.criterion IS
    'New acceptance criterion.';

CREATE INDEX IF NOT EXISTS idx_work_item_requirement_changes_work_item_id
    ON public.work_item_requirement_changes USING btree (work_item_id);

-- Changes to existing tables --------------------------------------------

-- Commits from a change go to its real Git branch (D-9).
ALTER TABLE public.repo_staging
    ADD COLUMN IF NOT EXISTS branch text NOT NULL DEFAULT 'main';

CREATE INDEX IF NOT EXISTS idx_repo_staging_repo_id_branch
    ON public.repo_staging USING btree (repo_id, branch);

-- Set by the first release.
ALTER TABLE public.projects
    ADD COLUMN IF NOT EXISTS stage text NOT NULL DEFAULT 'building';

ALTER TABLE public.projects
    DROP CONSTRAINT IF EXISTS projects_stage_check;

ALTER TABLE public.projects
    ADD CONSTRAINT projects_stage_check CHECK (stage IN ('building', 'released'));

COMMENT ON COLUMN public.projects.stage IS
    'building until the first release; released (and read-only prior versions) thereafter.';
