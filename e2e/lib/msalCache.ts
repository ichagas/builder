/**
 * Seeds @azure/msal-browser's localStorage cache so the legacy app's
 * MSAL-only AuthContext (app/frontend/src/contexts/AuthContext.tsx) treats
 * Playwright as an already-signed-in user, with zero network calls.
 *
 * Why this exists: app/frontend's `VITE_AUTH_MODE=mock` / localAuthMock.ts
 * are documentation-only placeholders — nothing in AuthContext, App, or
 * apiClient actually branches on them (verified by reading the source).
 * The real login path is 100% MSAL + Azure AD, which we cannot drive
 * headlessly. Instead we pre-populate the exact cache shape MSAL itself
 * writes after a real login, so `getAllAccounts()` / `acquireTokenSilent()`
 * resolve entirely from cache — msal-common ships hardcoded endpoint/cloud
 * metadata for `login.microsoftonline.com`
 * (@azure/msal-common/src/authority/AuthorityMetadata.ts), so Authority
 * resolution never hits the network either, regardless of tenant ID.
 *
 * Key/value formats below are copied from the algorithms in
 * @azure/msal-common/src/cache/entities/AccountEntity.ts and
 * @azure/msal-common/src/cache/utils/CacheHelpers.ts (generateAccountCacheKey,
 * generateCredentialKey) — not guessed. If msal-browser is upgraded and this
 * silently stops working, that's the first place to diff.
 */
import { createHmac } from "node:crypto";

const SEP = "-";

/**
 * Minimal HS256 JWT signer using node:crypto directly instead of the
 * `jsonwebtoken` package: that package's dependency chain (jsonwebtoken ->
 * semver) hits a Node ESM/CJS interop bug ("Unexpected module status 3")
 * under this project's `"type": "module"` + Playwright's TS loader. We only
 * ever need to *sign*, never verify, so this is a handful of lines.
 */
function base64urlEncode(input: Buffer | string): string {
  return Buffer.from(input as any)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function signJwtHS256(payload: Record<string, unknown>, secret: string): string {
  const header = { alg: "HS256", typ: "JWT" };
  const encodedHeader = base64urlEncode(JSON.stringify(header));
  const encodedPayload = base64urlEncode(JSON.stringify(payload));
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const signature = createHmac("sha256", secret).update(signingInput).digest();
  return `${signingInput}.${base64urlEncode(signature)}`;
}

export interface MockAuthUser {
  /** Stable per-test user id (becomes localAccountId / oid / sub / created_by). */
  id: string;
  email: string;
  name: string;
}

export interface MsalMockConfig {
  clientId: string;
  tenantId: string;
  environment?: string; // default: login.microsoftonline.com
  /** HS256 secret — must equal the API's JWT_SECRET so authMiddleware's local-JWT fallback accepts it. */
  jwtSecret: string;
}

function lowerJoin(parts: string[]): string {
  return parts.join(SEP).toLowerCase();
}

function generateAccountKey(homeAccountId: string, environment: string, tenantId: string): string {
  const homeTenantId = homeAccountId.split(".")[1];
  return lowerJoin([homeAccountId, environment || "", homeTenantId || tenantId || ""]);
}

function generateCredentialKey(opts: {
  homeAccountId: string;
  environment: string;
  credentialType: "IdToken" | "AccessToken";
  clientId: string;
  realm: string;
  target?: string;
}): string {
  const accountId = lowerJoin([opts.homeAccountId, opts.environment]);
  const credentialId = lowerJoin([opts.credentialType, opts.clientId, opts.realm || ""]);
  const target = (opts.target || "").toLowerCase();
  const claimsHash = "";
  const scheme = ""; // Bearer omits scheme from the key
  return lowerJoin([accountId, credentialId, target, claimsHash, scheme]);
}

/**
 * Builds a JWT that (a) MSAL will happily decode client-side without any
 * signature check, and (b) the API's authMiddleware will accept via its
 * local-JWT-secret fallback (see app/backend/src/middleware/auth.ts — Azure
 * AD JWKS validation fails offline/against a fake tenant, then it falls back
 * to `jwt.verify(token, process.env.JWT_SECRET)`).
 */
export function signMockIdToken(user: MockAuthUser, cfg: MsalMockConfig): string {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: `https://login.microsoftonline.com/${cfg.tenantId}/v2.0`,
    aud: cfg.clientId,
    sub: user.id,
    oid: user.id,
    tid: cfg.tenantId,
    preferred_username: user.email,
    email: user.email,
    name: user.name,
    iat: now - 60,
    nbf: now - 60,
    exp: now + 60 * 60 * 24 * 365, // 1 year — the e2e stack is short-lived
  };
  return signJwtHS256(payload, cfg.jwtSecret);
}

export interface MsalCacheEntries {
  [localStorageKey: string]: string;
}

/**
 * Builds the full set of localStorage entries needed for MSAL to consider
 * `user` signed in, with a matching access token cached for the
 * ["openid","profile","email"] silent request apiClient.ts / AuthContext.tsx
 * make.
 */
export function buildMsalCacheEntries(user: MockAuthUser, cfg: MsalMockConfig): MsalCacheEntries {
  const environment = cfg.environment || "login.microsoftonline.com";
  const homeAccountId = `${user.id}.${cfg.tenantId}`;
  const idToken = signMockIdToken(user, cfg);
  const nowSec = Math.floor(Date.now() / 1000);
  const expiresOn = nowSec + 60 * 60 * 24 * 365;

  const accountKey = generateAccountKey(homeAccountId, environment, cfg.tenantId);
  const accountEntity = {
    homeAccountId,
    environment,
    realm: cfg.tenantId,
    localAccountId: user.id,
    username: user.email,
    authorityType: "MSSTS",
    name: user.name,
    clientInfo: base64urlEncode(JSON.stringify({ uid: user.id, utid: cfg.tenantId })),
  };

  const idTokenKey = generateCredentialKey({
    homeAccountId,
    environment,
    credentialType: "IdToken",
    clientId: cfg.clientId,
    realm: cfg.tenantId,
  });
  const idTokenEntity = {
    credentialType: "IdToken",
    homeAccountId,
    environment,
    clientId: cfg.clientId,
    secret: idToken,
    realm: cfg.tenantId,
  };

  const target = "openid profile email";
  const accessTokenKey = generateCredentialKey({
    homeAccountId,
    environment,
    credentialType: "AccessToken",
    clientId: cfg.clientId,
    realm: cfg.tenantId,
    target,
  });
  const accessTokenEntity = {
    homeAccountId,
    credentialType: "AccessToken",
    secret: idToken, // apiClient.ts only ever reads response.idToken; the AT secret itself is never sent
    cachedAt: nowSec.toString(),
    expiresOn: expiresOn.toString(),
    extendedExpiresOn: expiresOn.toString(),
    environment,
    clientId: cfg.clientId,
    realm: cfg.tenantId,
    target,
    tokenType: "Bearer",
  };

  const tokenKeysKey = `msal.token.keys.${cfg.clientId}`;
  const tokenKeys = { idToken: [idTokenKey], accessToken: [accessTokenKey], refreshToken: [] };

  return {
    "msal.account.keys": JSON.stringify([accountKey]),
    [accountKey]: JSON.stringify(accountEntity),
    [tokenKeysKey]: JSON.stringify(tokenKeys),
    [idTokenKey]: JSON.stringify(idTokenEntity),
    [accessTokenKey]: JSON.stringify(accessTokenEntity),
  };
}
