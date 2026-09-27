-- 021_repository_full_name_ci.sql
-- Spec 007 (WP-BE5, fix round 3, item 7): repository full_name is
-- case-insensitive.
--
-- GitHub owner/repo names and Azure DevOps organization/project/repository
-- names are all case-insensitive on the provider side, but
-- application_repositories.full_name was unique and matched case-
-- sensitively. That let the same repository be registered twice
-- ("goa/permits-api" and "GOA/permits-api" -- sidestepping the "never
-- reassign a repository to another application" guard) and made mesh
-- ingest 401 when CI reported a differently-cased name (e.g. after an
-- owner/org rename that only changed case).
--
-- Decision: keep full_name as written (display case), compare with
-- lower(full_name) everywhere it is matched (mesh ingest, onboarding
-- registration lookup, the onboarding upsert's ON CONFLICT arbiter), and
-- back that with a unique expression index so lower(full_name) identifies
-- at most one row. The original case-sensitive unique index
-- (application_repositories_full_name_key, 013) is now implied by this one
-- and is kept only so older code paths/ON CONFLICT (full_name) keep working.
--
-- Idempotent (IF NOT EXISTS). Fails loudly, without guessing which row to
-- keep, if case-insensitive duplicates already exist.

BEGIN;

DO $$
DECLARE
    dup text;
BEGIN
    SELECT lower(full_name) INTO dup
    FROM public.application_repositories
    GROUP BY lower(full_name)
    HAVING count(*) > 1
    LIMIT 1;

    IF dup IS NOT NULL THEN
        RAISE EXCEPTION
            'application_repositories has more than one row for repository % (differing only in case); merge them before applying 021',
            dup;
    END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS application_repositories_full_name_lower_key
    ON public.application_repositories USING btree (lower(full_name));

COMMIT;
