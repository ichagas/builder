/**
 * Dedicated secret store for onboarding sandbox job secrets (spec 007, epic
 * B3, WP-BE6, T141, fix round 1 item 1 — security).
 *
 * Round 1 finding: the Container Apps Jobs "start" REST call
 * (`/jobs/{name}/start`) accepts a `JobExecutionTemplate` (containers/
 * initContainers only) — a `configuration.secrets` block in that body is
 * silently dropped, so any `secretRef` env entry referencing it never
 * resolves. Patching job-level secrets per run was rejected too: job
 * secrets are shared by every execution, so two concurrent runs would race
 * and overwrite each other's callback token/clone credentials.
 *
 * Instead, every per-run secret (the callback HMAC token, and each selected
 * repository's clone `Authorization` header) is written here, to a
 * **dedicated onboarding sandbox Key Vault** (`infra/main.tf`'s
 * `onboarding_sandbox_keyvault` — separate from the platform's main vault
 * and from `services/integrations/secretStore.ts`'s store, which holds
 * longer-lived integration/report secrets). The job's "start" call then
 * carries only non-secret env: the run id, callback URL, this vault's URI,
 * and the secret **names** — never a value. The sandbox job fetches each
 * value itself at startup, using its own UAMI (Key Vault Secrets User on
 * this vault only — `infra/onboarding-sandbox/src/keyvault.ts`, raw REST
 * calls rather than the `@azure/keyvault-secrets` SDK, to keep that image
 * small). The API's identity is Key Vault Secrets Officer on this same
 * vault (write + delete), never the sandbox's own permission.
 *
 * Every secret written here gets an `expiresOn` a little past the job's own
 * timeout (`CALLBACK_TOKEN_TTL_SECONDS`/the dispatch caller's TTL) — a
 * backstop for a crash before {@link cleanupSandboxSecrets} runs; the normal
 * path deletes it explicitly at every terminal state (see that function's
 * docstring).
 *
 * Local development / tests: {@link LocalJobDispatcher} never touches this
 * module (research decision: "Local dispatcher keeps passing values
 * directly, no vault in dev, behind the same interface") — only
 * `AzureContainerAppsJobDispatcher` and `callbackAuth.ts` use it, and both
 * fall back to the in-memory store outside production exactly like
 * `services/integrations/secretStore.ts` does.
 */
import { randomUUID } from "crypto";
import { SecretClient } from "@azure/keyvault-secrets";
import { getAzureCredential } from "../../../utils/azureCredential";
import { logger } from "../../../utils/logger";

export interface SandboxSecretStore {
  /** Write a secret under a newly generated name, expiring `ttlSeconds` from now. Returns the name. */
  createSecret(namePrefix: string, value: string, ttlSeconds: number): Promise<string>;
  getSecret(name: string): Promise<string>;
  /** No-op (never throws) if the secret doesn't exist — safe to call more than once. */
  deleteSecret(name: string): Promise<void>;
}

export class SandboxSecretStoreConfigurationError extends Error {
  statusCode = 503;
  code = "SANDBOX_SECRET_STORE_NOT_CONFIGURED";

  constructor(message: string) {
    super(message);
    this.name = "SandboxSecretStoreConfigurationError";
  }
}

function generateSecretName(namePrefix: string): string {
  const safePrefix = namePrefix.replace(/[^a-zA-Z0-9-]/g, "-").slice(0, 40);
  return `onboarding-${safePrefix}-${randomUUID()}`;
}

class KeyVaultSandboxSecretStore implements SandboxSecretStore {
  private client: SecretClient;

  constructor(vaultUrl: string) {
    this.client = new SecretClient(vaultUrl, getAzureCredential());
  }

  async createSecret(namePrefix: string, value: string, ttlSeconds: number): Promise<string> {
    const name = generateSecretName(namePrefix);
    const expiresOn = new Date(Date.now() + ttlSeconds * 1000);
    await this.client.setSecret(name, value, { expiresOn });
    logger.info(`[onboarding/sandboxSecretStore] secret created in the sandbox Key Vault (name=${name}, expiresOn=${expiresOn.toISOString()})`);
    return name;
  }

  async getSecret(name: string): Promise<string> {
    const secret = await this.client.getSecret(name);
    if (!secret.value) throw new Error(`Sandbox secret "${name}" has no value`);
    return secret.value;
  }

  async deleteSecret(name: string): Promise<void> {
    try {
      const poller = await this.client.beginDeleteSecret(name);
      await poller.pollUntilDone();
      logger.info(`[onboarding/sandboxSecretStore] secret deleted from the sandbox Key Vault (name=${name})`);
    } catch (err: any) {
      if (err?.statusCode === 404 || err?.code === "SecretNotFound") return;
      throw err;
    }
  }
}

class InMemorySandboxSecretStore implements SandboxSecretStore {
  private values = new Map<string, string>();

  async createSecret(namePrefix: string, value: string, _ttlSeconds: number): Promise<string> {
    const name = generateSecretName(namePrefix);
    this.values.set(name, value);
    logger.info(`[onboarding/sandboxSecretStore] secret created in-memory (name=${name})`);
    return name;
  }

  async getSecret(name: string): Promise<string> {
    const value = this.values.get(name);
    if (value === undefined) throw new Error(`Sandbox secret "${name}" not found`);
    return value;
  }

  async deleteSecret(name: string): Promise<void> {
    this.values.delete(name);
  }
}

type Resolution =
  | { kind: "keyvault"; vaultUrl: string }
  | { kind: "memory" }
  | { kind: "misconfigured"; error: SandboxSecretStoreConfigurationError };

let resolution: Resolution | null = null;

function resolveSelection(): Resolution {
  if (resolution) return resolution;

  const vaultUrl = process.env.ONBOARDING_SANDBOX_KEYVAULT_URL;
  const forceMemory = process.env.ONBOARDING_SANDBOX_SECRET_STORE === "memory";
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
        `[onboarding/sandboxSecretStore] Using the in-memory sandbox secret store outside tests (NODE_ENV=${nodeEnvLabel}` +
          `${forceMemory ? ", ONBOARDING_SANDBOX_SECRET_STORE=memory" : ", no ONBOARDING_SANDBOX_KEYVAULT_URL"}). ` +
          "Secrets will NOT persist across restarts and this is not suitable for production."
      );
    }
    return resolution;
  }

  const error = new SandboxSecretStoreConfigurationError(
    `No secret store is configured for the onboarding sandbox (NODE_ENV=${nodeEnvLabel}, ONBOARDING_SANDBOX_KEYVAULT_URL unset). ` +
      "Set ONBOARDING_SANDBOX_KEYVAULT_URL to the dedicated sandbox Key Vault's URI, or set ONBOARDING_SANDBOX_SECRET_STORE=memory to " +
      "explicitly opt into the in-memory store (development/testing only — never production)."
  );
  logger.error(`[onboarding/sandboxSecretStore] ${error.message}`);
  resolution = { kind: "misconfigured", error };
  return resolution;
}

resolveSelection();

function buildStore(): SandboxSecretStore {
  const r = resolveSelection();
  if (r.kind === "misconfigured") throw r.error;
  if (r.kind === "keyvault") {
    logger.info("[onboarding/sandboxSecretStore] Using the dedicated sandbox Key Vault");
    return new KeyVaultSandboxSecretStore(r.vaultUrl);
  }
  return new InMemorySandboxSecretStore();
}

let cachedStore: SandboxSecretStore | null = null;

export function getSandboxSecretStore(): SandboxSecretStore {
  if (!cachedStore) cachedStore = buildStore();
  return cachedStore;
}

/** Test-only: reset the cached store/resolution so tests can re-select after changing env vars. */
export function __resetSandboxSecretStoreForTests(): void {
  cachedStore = null;
  resolution = null;
}

/**
 * Best-effort delete of every secret this run created in the sandbox vault
 * (fix round 1, item 2): the callback token (`run.callback_secret_ref`) and
 * every name in `run.sandbox_secret_names` (which includes the callback
 * secret too, for a single source of truth — deleting it twice is a no-op).
 * Called at every terminal state of the sandbox job itself: `ready`/`failed`
 * in `applySandboxResult`, `cancelRun`, and a dispatch failure in
 * `startRun`. Never throws — logs and continues; each secret's own
 * `expiresOn` (set at creation) is the backstop if this never runs at all
 * (e.g. the process crashes first).
 */
export async function cleanupSandboxSecrets(names: Array<string | null | undefined>): Promise<void> {
  const unique = Array.from(new Set(names.filter((n): n is string => typeof n === "string" && n.length > 0)));
  if (unique.length === 0) return;

  let sandboxStore: SandboxSecretStore;
  try {
    sandboxStore = getSandboxSecretStore();
  } catch (err: any) {
    logger.warn(`[onboarding/sandboxSecretStore] cleanup skipped (store unavailable): ${err.message}`);
    return;
  }

  await Promise.all(
    unique.map(async (name) => {
      try {
        await sandboxStore.deleteSecret(name);
      } catch (err: any) {
        logger.warn(`[onboarding/sandboxSecretStore] failed to delete sandbox secret "${name}": ${err.message}`);
      }
    })
  );
}
