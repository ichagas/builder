-- 016_integrations.sql
-- D-18 (spec 007, WP-BE8): Integration identities configured by organization
-- admins on Admin -> Integrations (GitHub App status, Azure DevOps service
-- connection or PAT). Secrets live in Key Vault; this table stores only a
-- reference to the secret NAME, never the secret value itself.
--
-- Depends on 013_teams_applications.sql (application_repositories.connection_id
-- exists, without a FK -- added here). onboarding_runs is created by
-- 015_onboarding.sql (WP-BE5); because migrations run in filename order, 015
-- sorts before 016, but a given worktree/environment may not have it yet, so
-- the onboarding_runs.connection_id FK below is guarded by a DO block that
-- only runs when the table already exists.
--
-- Idempotent: safe to re-run (CREATE TABLE IF NOT EXISTS / guarded DDL).

BEGIN;

-- ---------------------------------------------------------------------
-- integration_connections
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.integration_connections (
    id              uuid NOT NULL DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    provider        text NOT NULL CHECK (provider IN ('github_app', 'azure_devops')),
    auth_type       text NOT NULL CHECK (auth_type IN ('app_installation', 'service_connection', 'pat')),
    display_name    text NOT NULL,
    -- Key Vault secret NAME only. Never the secret value. Null for
    -- github_app/app_installation connections, which reuse the platform's
    -- existing GitHub App installation (githubAppAuth.ts) and hold no
    -- per-organization secret of their own.
    secret_ref      text,
    -- Org URL, project list, or installation id -- never credentials.
    scope           jsonb NOT NULL DEFAULT '{}'::jsonb,
    last_tested_at  timestamp with time zone,
    status          text NOT NULL DEFAULT 'untested' CHECK (status IN ('ok', 'failing', 'untested')),
    created_at      timestamp with time zone NOT NULL DEFAULT now(),
    updated_at      timestamp with time zone NOT NULL DEFAULT now(),
    PRIMARY KEY (id)
);

-- Admin -> Integrations list, scoped to the caller's organization.
CREATE INDEX IF NOT EXISTS idx_integration_connections_organization_id
    ON public.integration_connections USING btree (organization_id);

-- ---------------------------------------------------------------------
-- application_repositories.connection_id -> integration_connections
-- ---------------------------------------------------------------------
-- Column already exists (added without a FK in 013_teams_applications.sql to
-- avoid a forward reference). ON DELETE RESTRICT: a connection in use by a
-- repository cannot be deleted (enforced again at the API layer for a
-- friendlier 409, but the DB is the source of truth).
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'application_repositories_connection_id_fkey'
    ) THEN
        ALTER TABLE public.application_repositories
            ADD CONSTRAINT application_repositories_connection_id_fkey
            FOREIGN KEY (connection_id) REFERENCES public.integration_connections(id)
            ON DELETE RESTRICT;
    END IF;
END $$;

-- ---------------------------------------------------------------------
-- onboarding_runs.connection_id -> integration_connections
-- ---------------------------------------------------------------------
-- onboarding_runs is created by 015_onboarding.sql (WP-BE5). Filename order
-- puts 015 before 016, but this migration must still run cleanly in an
-- environment where 015 has not been applied yet (parallel work-package
-- worktrees do not share migration history). Guard on table existence so
-- 016 is idempotent and order-tolerant either way; if 015 is applied later
-- in an environment that already ran 016, 015 itself is responsible for
-- adding this same FK (or a later migration must pick it up -- see
-- data-model.md §3/§4).
DO $$
BEGIN
    IF to_regclass('public.onboarding_runs') IS NOT NULL THEN
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
