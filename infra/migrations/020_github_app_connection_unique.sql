-- 020_github_app_connection_unique.sql
-- Epic B3 / D-18 (spec 007, WP-BE5, fix round 3): at most one `github_app`
-- integration connection per organization.
--
-- Fix round 2 (item 7) enforced this only in POST /admin/integrations with a
-- read-then-insert check, which two concurrent POSTs can both pass. The
-- organization's github_app connection is the single source of its
-- onboarding GitHub import scope and of the owner allow-list checked when
-- selecting repositories and minting installation tokens, so a second row
-- would be dead (and confusing) configuration. The database is now the
-- source of truth; the API maps the resulting unique violation (23505 on
-- this index) to a 409.
--
-- Azure DevOps connections are deliberately not constrained (an
-- organization may have several).
--
-- Idempotent: safe to re-run (CREATE UNIQUE INDEX IF NOT EXISTS). Fails
-- loudly, without guessing which row to keep, if duplicates already exist.

BEGIN;

DO $$
DECLARE
    dup_org uuid;
BEGIN
    SELECT organization_id INTO dup_org
    FROM public.integration_connections
    WHERE provider = 'github_app'
    GROUP BY organization_id
    HAVING count(*) > 1
    LIMIT 1;

    IF dup_org IS NOT NULL THEN
        RAISE EXCEPTION
            'organization % has more than one github_app integration connection; delete the extras (keep the oldest, which is the one onboarding uses) before applying 020',
            dup_org;
    END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_integration_connections_github_app_per_org
    ON public.integration_connections USING btree (organization_id)
    WHERE provider = 'github_app';

COMMIT;
