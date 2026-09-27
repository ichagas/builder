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

-- Fix round 3: the lease's owner. Each POST .../pull-requests call claims
-- with a fresh random token; renewing (during a long PR-opening loop) and
-- releasing are both guarded on it, so a call whose lease expired and was
-- re-claimed by another call can neither extend nor clear the new holder's
-- lease. (Added here rather than in a later migration because 019 has not
-- been merged anywhere yet; ADD COLUMN IF NOT EXISTS keeps it re-runnable.)
ALTER TABLE public.onboarding_runs
    ADD COLUMN IF NOT EXISTS pr_lease_owner uuid;

COMMENT ON COLUMN public.onboarding_runs.pr_lease_owner IS
    'Random token of the POST .../pull-requests call currently holding pr_lease_until; renew/release only match their own token. NULL when no lease is held.';

COMMIT;
