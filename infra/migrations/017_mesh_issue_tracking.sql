-- 017_mesh_issue_tracking.sql
-- WP-BE4 (T125): idempotency state for "open an issue/work item for new
-- findings" (research D-15). `POST /mesh/runs/:runId/issue` can be called
-- automatically on ingest AND manually from the evidence page; both paths
-- must not open a second issue for the same run. That requires persisted
-- state (which external issue/work item, if any, already exists for this
-- run) — there is nowhere else in the B2 schema (data-model.md §2) to keep
-- it, so this is the "new migration only if strictly needed" case named in
-- the WP-BE4 brief.
--
-- Idempotent: safe to re-run (guarded ALTER).

BEGIN;

ALTER TABLE public.mesh_runs
    ADD COLUMN IF NOT EXISTS issue_ref text,
    ADD COLUMN IF NOT EXISTS issue_opened_at timestamp with time zone;

COMMENT ON COLUMN public.mesh_runs.issue_ref IS
    'Provider-qualified reference to the issue/work item opened for this run''s new findings, e.g. "github:goa/permits-api#214" or "azure_devops:MyProject#5678". Null when none has been opened yet.';
COMMENT ON COLUMN public.mesh_runs.issue_opened_at IS
    'When issue_ref was set. Guards POST /mesh/runs/:runId/issue against opening a duplicate issue (automatic-on-ingest and manual retrigger both call the same idempotent path).';

COMMIT;
