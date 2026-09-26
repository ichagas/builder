/**
 * Secret store abstraction for integration connections (spec 007, D-18).
 *
 * `integration_connections.secret_ref` holds only a Key Vault secret NAME.
 * The secret value itself never touches the database, a log line, or an API
 * response. This module is the only place in the codebase allowed to read or
 * write the secret value.
 *
 * Two implementations, selected by environment:
 *  - `KeyVaultSecretStore` — real Key Vault via `@azure/keyvault-secrets`,
 *    using the same credential chain as the rest of the backend
 *    ({@link getAzureCredential}).
 *  - `InMemorySecretStore` — used in tests and local dev when no Key Vault
 *    URL is configured. Values live only in process memory.
 *
 * Selection: `KEY_VAULT_URL` (or `AZURE_KEY_VAULT_URL`) set -> Key Vault.
 * Otherwise the in-memory store, which is the default for `npm test` and for
 * local dev without Azure configured. `INTEGRATIONS_SECRET_STORE=memory` can
 * force the in-memory store even when a vault URL is present (useful for
 * integration tests that stub the DB but don't want live Key Vault calls).
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
// Selection
// ---------------------------------------------------------------------------

let cachedStore: SecretStore | null = null;

function buildStore(): SecretStore {
  const vaultUrl = process.env.KEY_VAULT_URL || process.env.AZURE_KEY_VAULT_URL;
  const forceMemory = process.env.INTEGRATIONS_SECRET_STORE === "memory";

  if (vaultUrl && !forceMemory) {
    logger.info("[integrations/secretStore] Using Key Vault secret store");
    return new KeyVaultSecretStore(vaultUrl);
  }

  logger.info("[integrations/secretStore] Using in-memory secret store (no KEY_VAULT_URL, or forced)");
  return new InMemorySecretStore();
}

/** The process-wide secret store. Lazily built so imports have no side effects. */
export function getSecretStore(): SecretStore {
  if (!cachedStore) {
    cachedStore = buildStore();
  }
  return cachedStore;
}

/** Test-only: reset the cached store so tests can re-select it after changing env vars. */
export function __resetSecretStoreForTests(): void {
  cachedStore = null;
}
