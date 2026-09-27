-- 022_onboarding_callback_secret.sql
-- Epic B3 (spec 007, WP-BE6, T141): the sandbox job (an Azure Container Apps
-- Job execution, or the local/mock dispatcher's out-of-process mode) reports
-- progress and results back to the API over HTTP
-- (`POST /onboarding/runs/:id/callback`), not through an in-process callback
-- — the job is a separate process/container. That endpoint has no user
-- session, so it authenticates with a short-lived, per-run bearer token
-- (services/onboarding/callbackAuth.ts): HMAC-signed, scoped to this run's
-- id and an expiry, verified with a constant-time comparison.
--
-- The HMAC key itself is a per-run secret minted in the platform's secret
-- store (Key Vault in production; services/integrations/secretStore.ts) when
-- the run is dispatched, exactly like `application_repositories.report_secret_ref`
-- (data-model.md §2) -- only the Key Vault secret NAME is ever persisted
-- here, never the key value.
--
-- Idempotent: safe to re-run (ADD COLUMN IF NOT EXISTS).

BEGIN;

ALTER TABLE public.onboarding_runs
    ADD COLUMN IF NOT EXISTS callback_secret_ref text;

COMMENT ON COLUMN public.onboarding_runs.callback_secret_ref IS
    'Key Vault secret name (never the secret itself) holding this run''s HMAC key for POST /onboarding/runs/:id/callback. Minted when the sandbox job is dispatched (services/onboarding/callbackAuth.ts#mintCallbackToken); NULL before the run starts or for a run whose dispatcher never needs an out-of-process callback (e.g. the in-memory/in-process dispatchers).';

COMMIT;
