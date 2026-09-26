-- 019_onboarding_pr_lease.sql
-- Epic B3 (spec 007, WP-BE5, fix round 2, item 4): a short-lived lease for
-- POST /onboarding/runs/:id/pull-requests, so two concurrent confirms for
-- the same run can be serialized with a single atomic UPDATE ... WHERE ...
-- RETURNING claim instead of holding a pooled connection (and its
-- transaction-scoped advisory lock) open across external GitHub/Azure
-- DevOps HTTP calls for the whole PR-opening critical section.
--
-- Idempotent: safe to re-run (ADD COLUMN IF NOT EXISTS).

BEGIN;

ALTER TABLE public.onboarding_runs
    ADD COLUMN IF NOT EXISTS pr_lease_until timestamp with time zone;

COMMENT ON COLUMN public.onboarding_runs.pr_lease_until IS
    'Set (a few minutes in the future) while a POST .../pull-requests call is in flight for this run, and cleared when it finishes. A second call sees a still-future value and 409s ("PR opening already in progress") instead of racing the first.';

COMMIT;
