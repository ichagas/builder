/**
 * Unit tests for the sandbox job's callback authentication (spec 007,
 * WP-BE6, T141): per-run, short-lived, HMAC-signed bearer tokens.
 *
 * NODE_ENV=test under jest, so `getSecretStore()` resolves to the in-memory
 * store — no Key Vault involved, matching how the rest of the integrations
 * tests exercise secret minting/reading.
 */
import { mintCallbackToken, verifyCallbackToken, CALLBACK_TOKEN_TTL_SECONDS } from "../../../services/onboarding/callbackAuth";

describe("callbackAuth", () => {
  it("mints a token that verifies for its own run", async () => {
    const { token, secretRef } = await mintCallbackToken("run-1");
    expect(secretRef).toBeTruthy();
    expect(token.split(".")).toHaveLength(2);

    await expect(verifyCallbackToken("run-1", secretRef, token)).resolves.toBe(true);
  });

  it("rejects a token minted for a different run (scoped to that run only)", async () => {
    const { token, secretRef } = await mintCallbackToken("run-1");
    await expect(verifyCallbackToken("run-2", secretRef, token)).resolves.toBe(false);
  });

  it("rejects an expired token", async () => {
    const { token, secretRef } = await mintCallbackToken("run-1", -10);
    await expect(verifyCallbackToken("run-1", secretRef, token)).resolves.toBe(false);
  });

  it("rejects a tampered signature", async () => {
    const { token, secretRef } = await mintCallbackToken("run-1");
    const [payload, signature] = token.split(".");
    const tampered = `${payload}.${signature.slice(0, -2)}zz`;
    await expect(verifyCallbackToken("run-1", secretRef, tampered)).resolves.toBe(false);
  });

  it("rejects a tampered payload (e.g. a forged runId inside the token)", async () => {
    const { token, secretRef } = await mintCallbackToken("run-1");
    const forgedPayload = Buffer.from(JSON.stringify({ runId: "run-2", exp: Math.floor(Date.now() / 1000) + 3600 })).toString(
      "base64url"
    );
    const [, signature] = token.split(".");
    await expect(verifyCallbackToken("run-2", secretRef, `${forgedPayload}.${signature}`)).resolves.toBe(false);
  });

  it("rejects a token verified against a different run's secretRef", async () => {
    const a = await mintCallbackToken("run-1");
    const b = await mintCallbackToken("run-2");
    // Token for run-1 is well-formed for run-1, but signed with a's secret —
    // verifying against b's secretRef must fail even though a's token
    // correctly names run-1.
    await expect(verifyCallbackToken("run-1", b.secretRef, a.token)).resolves.toBe(false);
  });

  it("rejects malformed tokens without throwing", async () => {
    const { secretRef } = await mintCallbackToken("run-1");
    await expect(verifyCallbackToken("run-1", secretRef, "not-a-token")).resolves.toBe(false);
    await expect(verifyCallbackToken("run-1", secretRef, undefined)).resolves.toBe(false);
    await expect(verifyCallbackToken("run-1", undefined, "a.b")).resolves.toBe(false);
  });

  it("rejects a secretRef that doesn't exist in the store", async () => {
    const { token } = await mintCallbackToken("run-1");
    await expect(verifyCallbackToken("run-1", "integration-nonexistent-secret", token)).resolves.toBe(false);
  });

  it("defaults to a 30-minute TTL", () => {
    expect(CALLBACK_TOKEN_TTL_SECONDS).toBe(30 * 60);
  });
});
