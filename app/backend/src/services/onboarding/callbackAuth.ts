/**
 * Callback authentication for the onboarding sandbox job (spec 007, epic B3,
 * WP-BE6, T141; migration `022_onboarding_callback_secret.sql`).
 *
 * The sandbox job (an Azure Container Apps Job execution, or the
 * local/mock dispatcher's out-of-process mode) is a separate process from
 * the API, so it cannot report progress/results through an in-process
 * callback the way {@link ../jobDispatcher.InMemoryJobDispatcher} does. It
 * instead calls `POST /onboarding/runs/:id/callback` with a bearer token
 * this module mints and verifies:
 *
 *  - **Per-run**: the token's payload names the run id it is valid for; a
 *    token minted for one run is rejected for every other run, even before
 *    checking the signature.
 *  - **Short-lived**: the payload carries an expiry (default 30 minutes —
 *    comfortably longer than a two-repository sandbox run, per the
 *    acceptance target, but far short of the run's own lifetime).
 *  - **HMAC, constant-time verified**: the signing key is a per-run secret
 *    minted in the **dedicated onboarding sandbox Key Vault**
 *    (`sandbox/sandboxSecretStore.ts` — fix round 1, item 1; separate from
 *    `services/integrations/secretStore.ts`'s platform store, which holds
 *    longer-lived integration/report secrets, not per-run job material) when
 *    the run is dispatched — never a long-lived, shared key baked into the
 *    job image or checked into config. Only the secret's *name*
 *    (`onboarding_runs.callback_secret_ref`) is ever persisted; the value is
 *    read back from the store to verify, and compared with
 *    `crypto.timingSafeEqual`, mirroring `services/mesh/ingest.ts`'s
 *    `verifySignature`. `AzureContainerAppsJobDispatcher` never sends the
 *    assembled token to the job — only this secret's name plus the token's
 *    plaintext payload, so the job can fetch the key and recompute the same
 *    token itself (see `infra/onboarding-sandbox/src/entrypoint.ts`).
 *
 * Token shape (deliberately not a JWT library dependency for something this
 * small): `base64url(JSON.stringify({runId, exp})) + "." + base64url(hmac)`.
 */
import crypto from "crypto";
import { getSandboxSecretStore } from "./sandbox/sandboxSecretStore";

export interface CallbackTokenPayload {
  runId: string;
  /** Unix seconds. */
  exp: number;
}

/** Default token lifetime — see module docstring. */
export const CALLBACK_TOKEN_TTL_SECONDS = 30 * 60;

function base64url(input: Buffer): string {
  return input.toString("base64url");
}

function signPayload(payloadB64: string, secret: string): string {
  return base64url(crypto.createHmac("sha256", secret).update(payloadB64).digest());
}

/**
 * Mint a fresh per-run secret in the secret store and a signed token bound
 * to `runId`, expiring `ttlSeconds` from now. Callers persist the returned
 * `secretRef` on the run (`onboarding_runs.callback_secret_ref`) and hand
 * the job the `token` (e.g. as an env var), never the raw secret value.
 */
export async function mintCallbackToken(
  runId: string,
  ttlSeconds: number = CALLBACK_TOKEN_TTL_SECONDS
): Promise<{ token: string; secretRef: string }> {
  const secretValue = crypto.randomBytes(32).toString("hex");
  const secretRef = await getSandboxSecretStore().createSecret("onboarding-callback", secretValue, ttlSeconds);

  const payload: CallbackTokenPayload = { runId, exp: Math.floor(Date.now() / 1000) + ttlSeconds };
  const payloadB64 = base64url(Buffer.from(JSON.stringify(payload)));
  const signature = signPayload(payloadB64, secretValue);
  return { token: `${payloadB64}.${signature}`, secretRef };
}

/**
 * Parse a token's payload without verifying its signature. Used only to
 * decide whether verification is even worth attempting (e.g. logging); never
 * trust the parsed `runId`/`exp` without also calling {@link verifyCallbackToken}.
 */
function parseTokenUnsafe(token: string): CallbackTokenPayload | null {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  try {
    const json = Buffer.from(parts[0], "base64url").toString("utf8");
    const parsed = JSON.parse(json);
    if (typeof parsed?.runId === "string" && typeof parsed?.exp === "number") {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Verify `token` was minted for exactly `runId`, has not expired, and its
 * signature matches the secret referenced by `secretRef` (read from the
 * secret store) — constant-time comparison, uniform `false` for every
 * failure mode (malformed token, wrong run, expired, tampered, missing
 * secret) so callers can return the same generic 401 in every case.
 */
export async function verifyCallbackToken(
  runId: string,
  secretRef: string | null | undefined,
  token: string | undefined
): Promise<boolean> {
  if (!token || !secretRef) return false;

  const parts = token.split(".");
  if (parts.length !== 2) return false;
  const [payloadB64, signature] = parts;

  const payload = parseTokenUnsafe(token);
  if (!payload) return false;
  if (payload.runId !== runId) return false;
  if (payload.exp < Math.floor(Date.now() / 1000)) return false;

  let secretValue: string;
  try {
    secretValue = await getSandboxSecretStore().getSecret(secretRef);
  } catch {
    return false;
  }

  const expected = Buffer.from(signPayload(payloadB64, secretValue));
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length) return false;
  return crypto.timingSafeEqual(expected, actual);
}
