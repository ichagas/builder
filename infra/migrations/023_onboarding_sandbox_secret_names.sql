-- 023_onboarding_sandbox_secret_names.sql
-- Epic B3 (spec 007, WP-BE6, T141, fix round 1 item 2): every per-run secret
-- name written to the dedicated onboarding sandbox Key Vault (the callback
-- token, and every per-repository clone credential —
-- AzureContainerAppsJobDispatcher, jobDispatcher.ts) is tracked here so it
-- can be deleted as soon as the sandbox run reaches a terminal state
-- (ready/failed in applySandboxResult, cancelRun, or a dispatch failure in
-- startRun) instead of only relying on the secrets' own expires_on for
-- cleanup (that TTL still covers a crash between dispatch and cleanup).
--
-- Idempotent: safe to re-run (ADD COLUMN IF NOT EXISTS).

BEGIN;

ALTER TABLE public.onboarding_runs
    ADD COLUMN IF NOT EXISTS sandbox_secret_names text[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.onboarding_runs.sandbox_secret_names IS
    'Every secret name (never a value) written to the onboarding sandbox Key Vault for this run''s dispatch — the callback token and each selected repository''s clone credential. Deleted and cleared at every terminal state of the sandbox job (see services/onboarding/sandbox/sandboxSecretStore.ts#cleanupSandboxSecrets); expires_on on each secret is the backstop for a crash before cleanup runs.';

COMMIT;
