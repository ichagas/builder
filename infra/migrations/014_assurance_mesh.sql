-- 014_assurance_mesh.sql
-- Epic B2 (spec 007, Option B): the Assurance Mesh — standards packs, mesh
-- runs reported by generated CI, baselines (new-findings ratchet),
-- exceptions and policy.
--
-- Depends on 013_teams_applications.sql (application_repositories).
-- Idempotent: safe to re-run (CREATE TABLE IF NOT EXISTS / guarded DDL).

BEGIN;

-- ---------------------------------------------------------------------
-- standards_packs
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.standards_packs (
    version       text NOT NULL,
    published_at  timestamp with time zone NOT NULL DEFAULT now(),
    notes         text,
    changes       jsonb NOT NULL DEFAULT '[]'::jsonb,
    workflow_ref  text,
    created_at    timestamp with time zone NOT NULL DEFAULT now(),
    updated_at    timestamp with time zone NOT NULL DEFAULT now(),
    PRIMARY KEY (version)
);

-- Now that standards_packs exists, wire up the forward reference from
-- migration 013 (application_repositories.pinned_pack -> standards_packs.version).
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'application_repositories_pinned_pack_fkey'
    ) THEN
        ALTER TABLE public.application_repositories
            ADD CONSTRAINT application_repositories_pinned_pack_fkey
            FOREIGN KEY (pinned_pack) REFERENCES public.standards_packs(version);
    END IF;
END $$;

-- ---------------------------------------------------------------------
-- mesh_runs
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.mesh_runs (
    id             uuid NOT NULL DEFAULT gen_random_uuid(),
    repository_id  uuid NOT NULL REFERENCES public.application_repositories(id) ON DELETE CASCADE,
    commit_sha     text NOT NULL,
    pr_number      int,
    base_branch    text NOT NULL,
    pr_state       text CHECK (pr_state IN ('open', 'merged', 'closed')),
    trigger        text NOT NULL CHECK (trigger IN ('pull_request', 'manual', 'baseline')),
    pack_version   text REFERENCES public.standards_packs(version),
    verdicts       jsonb NOT NULL DEFAULT '{}'::jsonb,
    new_findings   int NOT NULL DEFAULT 0,
    asvs_passed    int,
    alberta_passed int,
    report_url     text,
    received_at    timestamp with time zone NOT NULL DEFAULT now(),
    created_at     timestamp with time zone NOT NULL DEFAULT now(),
    updated_at     timestamp with time zone NOT NULL DEFAULT now(),
    PRIMARY KEY (id)
);

-- Requested index: mesh_runs by (repository_id, received_at) — used both by
-- the "runs?days=7" evidence feed and the portfolio's latest-run rollup.
CREATE INDEX IF NOT EXISTS idx_mesh_runs_repository_id_received_at
    ON public.mesh_runs USING btree (repository_id, received_at DESC);

-- ---------------------------------------------------------------------
-- mesh_baselines
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.mesh_baselines (
    id            uuid NOT NULL DEFAULT gen_random_uuid(),
    repository_id uuid NOT NULL REFERENCES public.application_repositories(id) ON DELETE CASCADE,
    agent         text NOT NULL,
    fingerprint   text NOT NULL,
    created_at    timestamp with time zone NOT NULL DEFAULT now(),
    updated_at    timestamp with time zone NOT NULL DEFAULT now(),
    PRIMARY KEY (id)
);

CREATE UNIQUE INDEX IF NOT EXISTS mesh_baselines_repository_id_fingerprint_key
    ON public.mesh_baselines USING btree (repository_id, fingerprint);

-- ---------------------------------------------------------------------
-- mesh_exceptions
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.mesh_exceptions (
    id            uuid NOT NULL DEFAULT gen_random_uuid(),
    repository_id uuid NOT NULL REFERENCES public.application_repositories(id) ON DELETE CASCADE,
    rule          text NOT NULL,
    reason        text,
    approved_by   uuid REFERENCES public.profiles(id),
    expires_at    timestamp with time zone NOT NULL,
    created_at    timestamp with time zone NOT NULL DEFAULT now(),
    updated_at    timestamp with time zone NOT NULL DEFAULT now(),
    PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS idx_mesh_exceptions_repository_id
    ON public.mesh_exceptions USING btree (repository_id);

-- ---------------------------------------------------------------------
-- mesh_policy
-- ---------------------------------------------------------------------
-- data-model.md §2 defines scope as organization|team|application, but §4
-- (D-17) says cyber_risk_sandbox is set "at repository or application
-- scope". Read literally together, 'repository' is a valid scope value too
-- -- widening the check constraint accordingly rather than dropping D-17's
-- repository-level sandbox toggle. (Deviation noted in the WP-BE3 report.)
CREATE TABLE IF NOT EXISTS public.mesh_policy (
    id                  uuid NOT NULL DEFAULT gen_random_uuid(),
    scope               text NOT NULL CHECK (scope IN ('organization', 'team', 'application', 'repository')),
    scope_id            uuid NOT NULL,
    agent               text NOT NULL,
    mode                text NOT NULL DEFAULT 'issue' CHECK (mode IN ('issue', 'notify', 'block', 'off')),
    -- D-17: optional Cyber Risk sandbox stage in the generated CI, enabled
    -- per repository or application in mesh policy. Defaults off.
    cyber_risk_sandbox  boolean NOT NULL DEFAULT false,
    created_at          timestamp with time zone NOT NULL DEFAULT now(),
    updated_at          timestamp with time zone NOT NULL DEFAULT now(),
    PRIMARY KEY (id)
);

CREATE UNIQUE INDEX IF NOT EXISTS mesh_policy_scope_scope_id_agent_key
    ON public.mesh_policy USING btree (scope, scope_id, agent);

CREATE INDEX IF NOT EXISTS idx_mesh_policy_scope_scope_id
    ON public.mesh_policy USING btree (scope, scope_id);

COMMIT;
