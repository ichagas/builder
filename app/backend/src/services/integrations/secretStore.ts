/**
 * Secret store abstraction for integration connections (spec 007, D-18).
 *
 * `integration_connections.secret_ref` holds only a Key Vault secret NAME.
 * The secret value itself never touches the database, a log line, or an API
 * response. This module is the only place in the codebase allowed to read or
 * write the secret value.
 *
 * Two implementations, selected by environment — **fail closed**:
 *  - `KeyVaultSecretStore` — real Key Vault via `@azure/keyvault-secrets`,
 *    using the same credential chain as the rest of the backend
 *    ({@link getAzureCredential}). Selected whenever `KEY_VAULT_URL` (or
 *    `AZURE_KEY_VAULT_URL`) is set (and the in-memory store isn't forced).
 *  - `InMemorySecretStore` — used in tests and local dev. Values live only
 *    in process memory and are lost on restart. Selected only when
 *    `NODE_ENV` is `test` or `development`, or when an operator explicitly
 *    opts in with `INTEGRATIONS_SECRET_STORE=memory` (which also takes
 *    priority over a configured vault URL, e.g. for integration tests that
 *    stub the DB but don't want live Key Vault calls).
 *
 * Anything else — notably production (`NODE_ENV=production` or unset) with
 * no vault URL and no explicit override — is a **misconfiguration**: the
 * resolved mode is computed once at module load so the problem is logged at
 * error level on startup (without crashing the process — other, unrelated
 * routes must keep working), and {@link getSecretStore} throws a
 * `SecretStoreConfigurationError` (503) the first time anything actually
 * tries to use the store, which the integrations routes surface as a clear
 * 503 rather than a generic 500.
 *
 * Using the in-memory store outside tests (development, or an explicit
 * production override) logs a warning every time the store is selected.
 */
import { randomUUID } from "crypto";
import { SecretClient } from "@azure/keyvault-secrets";
import { getAzureCredential } from "../../utils/azureCredential";
import { logger } from "../../utils/logger";

export interface SecretStore {
  /** Write a secret value under a newly generated name, returning that name. */
  createSecret(namePrefix: string, value: string): Promise<string>;
  /** Read a secret value by name. Throws if not found. */
  getSecret(name: string): Promise<string>;
  /** Delete a secret by name. No-op (does not throw) if it doesn't exist. */
  deleteSecret(name: string): Promise<void>;
}

/**
 * Thrown when no secret store can be safely selected (production without a
 * Key Vault URL configured and no explicit in-memory override). `statusCode`
 * is read by `errorHandler` so routes surface a 503, not a generic 500.
 */
export class SecretStoreConfigurationError extends Error {
  statusCode = 503;
  code = "SECRET_STORE_NOT_CONFIGURED";

  constructor(message: string) {
    super(message);
    this.name = "SecretStoreConfigurationError";
  }
}

/**
 * Key Vault secret names must be 1-127 chars of [a-zA-Z0-9-]. We generate a
 * name from a prefix (e.g. the provider) plus a random suffix so names never
 * embed organization or connection identifiers, and never collide.
 */
function generateSecretName(namePrefix: string): string {
  const safePrefix = namePrefix.replace(/[^a-zA-Z0-9-]/g, "-").slice(0, 40);
  return `integration-${safePrefix}-${randomUUID()}`;
}

// ---------------------------------------------------------------------------
// Key Vault-backed store
// ---------------------------------------------------------------------------

class KeyVaultSecretStore implements SecretStore {
  private client: SecretClient;

  constructor(vaultUrl: string) {
    this.client = new SecretClient(vaultUrl, getAzureCredential());
  }

  async createSecret(namePrefix: string, value: string): Promise<string> {
    const name = generateSecretName(namePrefix);
    await this.client.setSecret(name, value);
    logger.info(`[integrations/secretStore] Secret created in Key Vault (name=${name})`);
    return name;
  }

  async getSecret(name: string): Promise<string> {
    const secret = await this.client.getSecret(name);
    if (!secret.value) {
      throw new Error(`Secret "${name}" has no value`);
    }
    return secret.value;
  }

  async deleteSecret(name: string): Promise<void> {
    try {
      const poller = await this.client.beginDeleteSecret(name);
      await poller.pollUntilDone();
      logger.info(`[integrations/secretStore] Secret deleted from Key Vault (name=${name})`);
    } catch (err: any) {
      if (err?.statusCode === 404 || err?.code === "SecretNotFound") {
        return;
      }
      throw err;
    }
  }
}

// ---------------------------------------------------------------------------
// In-memory store (tests / local dev without Key Vault)
// ---------------------------------------------------------------------------

class InMemorySecretStore implements SecretStore {
  private values = new Map<string, string>();

  async createSecret(namePrefix: string, value: string): Promise<string> {
    const name = generateSecretName(namePrefix);
    this.values.set(name, value);
    logger.info(`[integrations/secretStore] Secret created in-memory store (name=${name})`);
    return name;
  }

  async getSecret(name: string): Promise<string> {
    const value = this.values.get(name);
    if (value === undefined) {
      throw new Error(`Secret "${name}" not found`);
    }
    return value;
  }

  async deleteSecret(name: string): Promise<void> {
    this.values.delete(name);
  }
}

// ---------------------------------------------------------------------------
// Selection (fail closed)
// ---------------------------------------------------------------------------

type Resolution =
  | { kind: "keyvault"; vaultUrl: string }
  | { kind: "memory" }
  | { kind: "misconfigured"; error: SecretStoreConfigurationError };

let resolution: Resolution | null = null;

/**
 * Decide which store to use, exactly once (cached). Never throws — a
 * misconfiguration is recorded in the returned `Resolution` and logged here,
 * so the process can still boot and serve unrelated routes; only actually
 * using the store (via {@link getSecretStore}) throws.
 */
function resolveSelection(): Resolution {
  if (resolution) return resolution;

  const vaultUrl = process.env.KEY_VAULT_URL || process.env.AZURE_KEY_VAULT_URL;
  const forceMemory = process.env.INTEGRATIONS_SECRET_STORE === "memory";
  // Deliberately NOT defaulted to "development" when unset: fail closed means
  // an unset NODE_ENV (as a real production deploy might have, if it forgot
  // to set it) is treated the same as production, not as a permissive dev
  // default. Only an explicit "test" or "development" is permissive.
  const nodeEnv = process.env.NODE_ENV;
  const nodeEnvLabel = nodeEnv ?? "unset";
  const memoryAllowedByEnv = nodeEnv === "test" || nodeEnv === "development";

  if (vaultUrl && !forceMemory) {
    resolution = { kind: "keyvault", vaultUrl };
    return resolution;
  }

  if (forceMemory || memoryAllowedByEnv) {
    resolution = { kind: "memory" };
    if (nodeEnv !== "test") {
      logger.warn(
        `[integrations/secretStore] Using the in-memory secret store outside tests (NODE_ENV=${nodeEnvLabel}` +
          `${forceMemory ? ", INTEGRATIONS_SECRET_STORE=memory" : ", no KEY_VAULT_URL"}). ` +
          "Secrets will NOT persist across restarts and this is not suitable for production."
      );
    }
    return resolution;
  }

  const error = new SecretStoreConfigurationError(
    `No secret store is configured for integrations (NODE_ENV=${nodeEnvLabel}, KEY_VAULT_URL/AZURE_KEY_VAULT_URL unset). ` +
      "Set KEY_VAULT_URL to a Key Vault URI, or set INTEGRATIONS_SECRET_STORE=memory to explicitly opt into the " +
      "in-memory store (development/testing only — never for production)."
  );
  logger.error(`[integrations/secretStore] ${error.message}`);
  resolution = { kind: "misconfigured", error };
  return resolution;
}

// Resolve once at module load so a misconfiguration is logged at error level
// on startup, even before any request reaches the integrations routes.
// This never throws — see resolveSelection's docstring.
resolveSelection();

function buildStore(): SecretStore {
  const r = resolveSelection();

  if (r.kind === "misconfigured") {
    // Re-throw the same, already-logged error at first use.
    throw r.error;
  }
  if (r.kind === "keyvault") {
    logger.info("[integrations/secretStore] Using Key Vault secret store");
    return new KeyVaultSecretStore(r.vaultUrl);
  }
  return new InMemorySecretStore();
}

let cachedStore: SecretStore | null = null;

/**
 * The process-wide secret store. Lazily built (and cached) on first use, so
 * a misconfiguration throws here rather than at import time — but see the
 * module-load-time call to {@link resolveSelection} above, which already
 * logged the same problem at error level on startup.
 */
export function getSecretStore(): SecretStore {
  if (!cachedStore) {
    cachedStore = buildStore();
  }
  return cachedStore;
}

/** Test-only: reset the cached store/resolution so tests can re-select after changing env vars. */
export function __resetSecretStoreForTests(): void {
  cachedStore = null;
  resolution = null;
}
