-- 013_teams_applications.sql
-- Epic B2 (spec 007, Option B): teams, applications and their repositories.
--
-- Teams sit under organizations. Team membership follows a GitHub-like model
-- (owner/member). Organization admins (existing public.user_roles role =
-- 'admin') can see every team in their organization and set org-level policy
-- (research D-8) — that authorization is enforced in the API layer, not here.
--
-- Idempotent: safe to re-run (CREATE TABLE IF NOT EXISTS / guarded DDL).

BEGIN;

-- ---------------------------------------------------------------------
-- teams
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.teams (
    id              uuid NOT NULL DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    name            text NOT NULL,
    created_at      timestamp with time zone NOT NULL DEFAULT now(),
    updated_at      timestamp with time zone NOT NULL DEFAULT now(),
    PRIMARY KEY (id)
);

CREATE UNIQUE INDEX IF NOT EXISTS teams_organization_id_name_key
    ON public.teams USING btree (organization_id, name);

-- ---------------------------------------------------------------------
-- team_members
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.team_members (
    team_id    uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
    user_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    role       text NOT NULL CHECK (role IN ('owner', 'member')),
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    PRIMARY KEY (team_id, user_id)
);

-- "Teams for the switcher" (GET /teams/mine) looks up by user_id.
CREATE INDEX IF NOT EXISTS idx_team_members_user_id
    ON public.team_members USING btree (user_id);

-- ---------------------------------------------------------------------
-- applications
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.applications (
    id            uuid NOT NULL DEFAULT gen_random_uuid(),
    team_id       uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
    name          text NOT NULL,
    owner_label   text,
    onboarded_at  timestamp with time zone,
    created_at    timestamp with time zone NOT NULL DEFAULT now(),
    updated_at    timestamp with time zone NOT NULL DEFAULT now(),
    PRIMARY KEY (id)
);

-- Portfolio query: applications for a team.
CREATE INDEX IF NOT EXISTS idx_applications_team_id
    ON public.applications USING btree (team_id);

-- ---------------------------------------------------------------------
-- application_repositories
-- ---------------------------------------------------------------------
-- NOTE on connection_id: data-model.md §4 says application_repositories
-- references integration_connections, but that table is only created in
-- migration 016 (WP-BE8, epic D-18). To avoid a forward reference, this
-- column is added here WITHOUT a foreign key. Migration 016 is responsible
-- for adding:
--   ALTER TABLE public.application_repositories
--       ADD CONSTRAINT application_repositories_connection_id_fkey
--       FOREIGN KEY (connection_id) REFERENCES public.integration_connections(id);
--
-- NOTE on pinned_pack: references standards_packs(version), which is only
-- created in migration 014 (assurance mesh) — that migration adds the FK
-- constraint once the table exists.
CREATE TABLE IF NOT EXISTS public.application_repositories (
    id               uuid NOT NULL DEFAULT gen_random_uuid(),
    application_id   uuid NOT NULL REFERENCES public.applications(id) ON DELETE CASCADE,
    provider         text NOT NULL CHECK (provider IN ('github', 'azure_devops')),
    full_name        text NOT NULL,
    default_branch   text NOT NULL DEFAULT 'main',
    ci_provider      text CHECK (ci_provider IN ('github_actions', 'azure_pipelines')),
    profile          text CHECK (profile IN ('dotnet', 'node', 'java', 'python')),
    stack_label      text,
    part             text,
    build_command    text,
    pinned_pack      text,
    update_pr_number int,
    update_pr_state  text CHECK (update_pr_state IN ('open', 'merged', 'closed')),
    report_secret_ref text,
    last_report_at   timestamp with time zone,
    -- Set by WP-BE8 (migration 016) once integration_connections exists.
    connection_id    uuid,
    created_at       timestamp with time zone NOT NULL DEFAULT now(),
    updated_at       timestamp with time zone NOT NULL DEFAULT now(),
    PRIMARY KEY (id)
);

CREATE UNIQUE INDEX IF NOT EXISTS application_repositories_full_name_key
    ON public.application_repositories USING btree (full_name);

-- Portfolio query: repositories for an application (rolled up per team/app).
CREATE INDEX IF NOT EXISTS idx_application_repositories_application_id
    ON public.application_repositories USING btree (application_id);

-- "Not reporting" scans (last_report_at older than 7 days, or null).
CREATE INDEX IF NOT EXISTS idx_application_repositories_last_report_at
    ON public.application_repositories USING btree (last_report_at);

COMMIT;
