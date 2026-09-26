-- 018_staging_branch_unique.sql
-- WP-BE2 T104 (D-9): partition staging by the change's real Git branch.
--
-- `repo_staging.branch` was added in 012_versions_work_items.sql (default
-- 'main', identical to legacy behaviour), but `repo_staging_unique_file`
-- (001_full_schema.sql) still uniqued only on (repo_id, file_path) — so a
-- file staged on two different branches (e.g. two changes touching the
-- same file) collided into a single row instead of the two the "commits go
-- to the change's branch" rule (research.md D-9) requires. Replace it with
-- a (repo_id, file_path, branch) unique index; every write path's
-- `ON CONFLICT` target is updated alongside it (stagedContentStore.ts,
-- rpcHelpers.ts's batchStageFiles, routes/rpc.ts's batch_stage_files/commit
-- RPCs).
--
-- Idempotent: safe to run multiple times, and safe to run after 012 has
-- already backfilled `branch = 'main'` for every existing row.

BEGIN;

DROP INDEX IF EXISTS public.repo_staging_unique_file;

CREATE UNIQUE INDEX IF NOT EXISTS repo_staging_unique_file
    ON public.repo_staging USING btree (repo_id, file_path, branch);

COMMENT ON INDEX public.repo_staging_unique_file IS
    'One staged row per (repo, file, branch) — a file can be staged independently on more than one change''s branch (D-9).';

COMMIT;
