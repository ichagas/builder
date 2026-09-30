/**
 * Auth mode (dev-only local sign-in)
 *
 * Default is Entra ID (AUTH_MODE unset or "entra"). Setting AUTH_MODE=local is
 * an explicit opt-in for developers who have no Entra app registration:
 *   - Entra/JWKS validation and APIM identity headers are ignored; only
 *     HS256 tokens signed with JWT_SECRET (issued by POST /auth/dev-login)
 *     are accepted.
 *   - POST /api/v1/auth/dev-login is mounted (it is absent otherwise).
 *
 * Because dev-login is a passwordless sign-in, local mode is an allow-list:
 * the process REFUSES TO START unless NODE_ENV is exactly "development" or
 * "test" (unset is refused), and also with a hosting marker of Azure Container
 * Apps / App Service, or with a weak / placeholder JWT_SECRET.
 */
import jwt from "jsonwebtoken";

export const LOCAL_JWT_ISSUER = "pronghorn-local-dev";
export const LOCAL_JWT_ALGORITHM = "HS256" as const;
/** Token lifetime for dev-login tokens. */
export const LOCAL_JWT_EXPIRES_IN = "12h";
/** JWT_SECRET must be at least this long in local mode (openssl rand -hex 32 = 64). */
export const MIN_LOCAL_JWT_SECRET_LENGTH = 32;

type Env = Record<string, string | undefined>;

/** NODE_ENV values under which AUTH_MODE=local may run (allow-list). */
export const LOCAL_ALLOWED_NODE_ENVS = ["development", "test"];
/** Second layer: env markers set by Azure hosting platforms. */
const AZURE_HOSTING_MARKERS = [
  "CONTAINER_APP_NAME",
  "CONTAINER_APP_REVISION",
  "WEBSITE_SITE_NAME",
  "WEBSITE_INSTANCE_ID",
  "IDENTITY_ENDPOINT",
  "MSI_ENDPOINT",
];
const LOCAL_DB_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]", "db"]);

/** True when POSTGRES_HOST points at the developer machine / compose network. */
export function isLocalDatabaseHost(env: Env = process.env): boolean {
  return LOCAL_DB_HOSTS.has((env.POSTGRES_HOST || "").trim().toLowerCase());
}

/** Marks users created by dev-login (auth.users.raw_user_meta_data.provider). */
export const LOCAL_DEV_PROVIDER = "local-dev";

export function isLocalAuthMode(env: Env = process.env): boolean {
  return (env.AUTH_MODE || "").trim().toLowerCase() === "local";
}

/**
 * Throws when AUTH_MODE=local is unsafe or misconfigured. No-op in the
 * default (Entra) mode. Call at module load of anything that validates tokens.
 */
export function assertAuthModeConfig(env: Env = process.env): void {
  const raw = (env.AUTH_MODE || "").trim().toLowerCase();
  if (raw && raw !== "local" && raw !== "entra") {
    throw new Error(`AUTH_MODE must be "entra" (default) or "local", got "${env.AUTH_MODE}".`);
  }
  if (raw !== "local") return;

  if (!LOCAL_ALLOWED_NODE_ENVS.includes(env.NODE_ENV ?? "")) {
    throw new Error(
      `AUTH_MODE=local is a development-only passwordless sign-in and requires NODE_ENV to be exactly "development" or "test" (got ${
        env.NODE_ENV ? `"${env.NODE_ENV}"` : "unset"
      }).`,
    );
  }
  const azureMarker = AZURE_HOSTING_MARKERS.find((k) => env[k]);
  if (azureMarker) {
    throw new Error(
      `AUTH_MODE=local is refused on Azure-hosted runtimes (${azureMarker} is set).`,
    );
  }
  const secret = env.JWT_SECRET || "";
  if (!secret) {
    throw new Error(
      "AUTH_MODE=local requires JWT_SECRET. Generate one with: openssl rand -hex 32",
    );
  }
  if (secret.length < MIN_LOCAL_JWT_SECRET_LENGTH || /change[-_ ]?me/i.test(secret)) {
    throw new Error(
      `AUTH_MODE=local requires a JWT_SECRET of at least ${MIN_LOCAL_JWT_SECRET_LENGTH} characters that is not a placeholder ("change-me"). ` +
        "Generate one with: openssl rand -hex 32",
    );
  }
}

export interface LocalTokenClaims {
  sub: string;
  email?: string;
  name?: string;
  role?: string;
}

/** Sign a dev-login token. Throws if JWT_SECRET is unset. */
export function signLocalToken(claims: LocalTokenClaims): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET not configured");
  return jwt.sign(
    { sub: claims.sub, email: claims.email, name: claims.name, role: claims.role },
    secret,
    { algorithm: LOCAL_JWT_ALGORITHM, issuer: LOCAL_JWT_ISSUER, expiresIn: LOCAL_JWT_EXPIRES_IN },
  );
}

/** Verify a dev-login token (HS256 only, issuer pinned). Throws when invalid. */
export function verifyLocalToken(token: string): LocalTokenClaims {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET not configured");
  return jwt.verify(token, secret, {
    algorithms: [LOCAL_JWT_ALGORITHM],
    issuer: LOCAL_JWT_ISSUER,
  }) as LocalTokenClaims;
}
