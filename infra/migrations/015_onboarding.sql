-- 015_onboarding.sql
-- Epic B3 (spec 007, WP-BE5): onboarding runs for existing applications —
-- the wizard state machine (draft -> running -> ready -> prs_open ->
-- completed; failed/cancelled terminal) plus the per-repository import,
-- review and generated-manifest rows (data-model.md §3).
--
-- Depends on 013_teams_applications.sql (teams, applications) and
-- 014_assurance_mesh.sql (nothing directly, but shares the profile / ci
-- provider vocabulary with application_repositories).
--
-- connection_id (data-model.md §4, D-18): onboarding_runs references the
-- integration_connections row used to import/PR this run. That table is
-- created by 016_integrations.sql (WP-BE8). Migrations run in filename
-- order, so 015 sorts BEFORE 016 -- on a fresh database, 016 will find
-- onboarding_runs already created and add the FK itself (see its own
-- comment). But a worktree/environment may have already run 016 before this
-- migration lands (parallel work-package databases don't share migration
-- history), in which case 016 could not add the FK (onboarding_runs didn't
-- exist yet) -- so this migration adds it itself, guarded on
-- integration_connections existing, exactly mirroring 016's own guard.
--
-- Idempotent: safe to re-run (CREATE TABLE IF NOT EXISTS / guarded DDL).

BEGIN;

-- ---------------------------------------------------------------------
-- onboarding_runs
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.onboarding_runs (
    id               uuid NOT NULL DEFAULT gen_random_uuid(),
    team_id          uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
    application_name text NOT NULL,
    -- Set once PRs are opened and the application row is created (status ->
    -- prs_open). Null throughout draft/running/ready.
    application_id   uuid REFERENCES public.applications(id),
    pack_version     text,
    status           text NOT NULL DEFAULT 'draft'
                       CHECK (status IN ('draft', 'running', 'ready', 'prs_open', 'completed', 'failed', 'cancelled')),
    -- Wizard position; the frontend URL mirrors it.
    step             text NOT NULL DEFAULT 'team'
                       CHECK (step IN ('team', 'connect', 'sandbox', 'output', 'prs')),
    -- Container Apps Job execution id (WP-BE6's dispatcher fills this in).
    job_execution_id text,
    log_blob         text,
    -- The integration connection (github_app or azure_devops) used to
    -- import repositories / open PRs for this run. FK added below, once
    -- integration_connections exists (see header comment).
    connection_id    uuid,
    started_by       uuid NOT NULL REFERENCES public.profiles(id),
    created_at       timestamp with time zone NOT NULL DEFAULT now(),
    updated_at       timestamp with time zone NOT NULL DEFAULT now(),
    PRIMARY KEY (id)
);

-- "My team's onboarding runs" / portfolio-adjacent lookups.
CREATE INDEX IF NOT EXISTS idx_onboarding_runs_team_id
    ON public.onboarding_runs USING btree (team_id);

CREATE INDEX IF NOT EXISTS idx_onboarding_runs_status
    ON public.onboarding_runs USING btree (status);

-- ---------------------------------------------------------------------
-- onboarding_run_repositories
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.onboarding_run_repositories (
    id                  uuid NOT NULL DEFAULT gen_random_uuid(),
    run_id              uuid NOT NULL REFERENCES public.onboarding_runs(id) ON DELETE CASCADE,
    full_name           text NOT NULL,
    selected            boolean NOT NULL DEFAULT true,
    detected_profile    text CHECK (detected_profile IN ('dotnet', 'node', 'java', 'python')),
    detected_stack      text,
    detected_build      text,
    -- Determines which CI file the PR contains (D-12).
    detected_ci         text CHECK (detected_ci IN ('github_actions', 'azure_pipelines')),
    part                text,
    review              jsonb NOT NULL DEFAULT '{}'::jsonb,
    -- List of generated files (path + content/blob ref) the sandbox job
    -- produced for this repository -- what the PR is built from.
    generated_manifest  jsonb NOT NULL DEFAULT '[]'::jsonb,
    baseline_counts     jsonb NOT NULL DEFAULT '{}'::jsonb,
    pr_number           int,
    pr_state            text CHECK (pr_state IN ('open', 'merged', 'closed')),
    created_at          timestamp with time zone NOT NULL DEFAULT now(),
    updated_at          timestamp with time zone NOT NULL DEFAULT now(),
    PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS idx_onboarding_run_repositories_run_id
    ON public.onboarding_run_repositories USING btree (run_id);

-- A repository can only appear once per run (repeated PUT /repositories
-- calls replace the selection rather than accumulating duplicates).
CREATE UNIQUE INDEX IF NOT EXISTS onboarding_run_repositories_run_id_full_name_key
    ON public.onboarding_run_repositories USING btree (run_id, full_name);

-- ---------------------------------------------------------------------
-- onboarding_runs.connection_id -> integration_connections
-- ---------------------------------------------------------------------
-- See header comment: 016_integrations.sql adds this FK when it can (fresh
-- database, 015 already applied). This guarded block covers the reverse
-- ordering, where 016 already ran against a database that didn't yet have
-- onboarding_runs.
DO $$
BEGIN
    IF to_regclass('public.integration_connections') IS NOT NULL THEN
        IF NOT EXISTS (
            SELECT 1 FROM pg_constraint WHERE conname = 'onboarding_runs_connection_id_fkey'
        ) THEN
            ALTER TABLE public.onboarding_runs
                ADD CONSTRAINT onboarding_runs_connection_id_fkey
                FOREIGN KEY (connection_id) REFERENCES public.integration_connections(id)
                ON DELETE RESTRICT;
        END IF;
    END IF;
END $$;

COMMIT;
