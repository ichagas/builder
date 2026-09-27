/**
 * Per-repository HMAC secret resolution for the Assurance Mesh ingest
 * endpoint (spec 007, WP-BE4, T122).
 *
 * `application_repositories.report_secret_ref` never stores the secret
 * itself — only a reference. This module resolves that reference to the
 * actual secret value:
 *
 *  - **Production** (`KEY_VAULT_URL` or `AZURE_KEY_VAULT_URL` set — fix
 *    round 2, item 3: the same variables
 *    `services/integrations/secretStore.ts` (WP-BE8) selects Key Vault mode
 *    from, since WP-BE5's onboarding mints `report_secret_ref` there):
 *    the reference is a Key Vault secret name, read from the vault's data
 *    plane using the platform's Managed Identity / `DefaultAzureCredential`
 *    (see `utils/azureCredential.ts`, the same pattern
 *    `services/deployment/docker/genappKeyVault.ts` uses for per-app
 *    vaults). `MESH_KEYVAULT_URI` is still honored as an optional override
 *    (checked first) for any deployment that set it before this module read
 *    `KEY_VAULT_URL`/`AZURE_KEY_VAULT_URL` too.
 *  - **Local dev / CI / tests** (none of the above set): the reference is
 *    looked up as an environment variable, so `report_secret_ref` can simply
 *    be the env var name (e.g. `MESH_SECRET_PERMITS_API`) during onboarding
 *    dry runs and integration tests.
 *
 * The resolver is exposed behind a small interface so routes/tests can inject
 * a mock instead of hitting Key Vault or `process.env`.
 */
import { logger } from "../../utils/logger";
import { AzureScope, getAzureTokenForScope } from "../../utils/azureCredential";

const KV_DATA_PLANE_API_VERSION = "7.4";

export interface SecretResolver {
  /**
   * Resolve `report_secret_ref` to the actual HMAC secret value, or `null`
   * when it cannot be resolved (unknown reference, vault error, etc.). The
   * caller must treat `null` as "reject the request" — never fall back to a
   * default secret.
   */
  resolveReportSecret(secretRef: string): Promise<string | null>;
}

/** Reads the secret value from `process.env[secretRef]`. Local dev / tests. */
export class EnvSecretResolver implements SecretResolver {
  async resolveReportSecret(secretRef: string): Promise<string | null> {
    if (!secretRef) return null;
    const value = process.env[secretRef];
    return value && value.length > 0 ? value : null;
  }
}

/** Reads the secret from an Azure Key Vault's data plane. Production. */
export class KeyVaultSecretResolver implements SecretResolver {
  constructor(private readonly vaultUri: string) {}

  async resolveReportSecret(secretRef: string): Promise<string | null> {
    if (!secretRef) return null;
    try {
      const token = await getAzureTokenForScope(AzureScope.KeyVault);
      const url = `${this.vaultUri}/secrets/${encodeURIComponent(secretRef)}?api-version=${KV_DATA_PLANE_API_VERSION}`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        logger.warn(
          `[mesh-secret-resolver] Key Vault secret lookup failed: ref=${secretRef} status=${res.status}`,
        );
        return null;
      }
      const data = (await res.json()) as { value?: string };
      return data.value ?? null;
    } catch (err: any) {
      logger.error(
        `[mesh-secret-resolver] Key Vault secret lookup error: ref=${secretRef} ${err?.message}`,
      );
      return null;
    }
  }
}

let cachedResolver: SecretResolver | null = null;

/**
 * The resolver to use for the current environment. Cached as a singleton;
 * call {@link resetSecretResolverForTests} in tests that change any of
 * `MESH_KEYVAULT_URI`/`KEY_VAULT_URL`/`AZURE_KEY_VAULT_URL` between cases.
 *
 * Fix round 2, item 3: `KEY_VAULT_URL`/`AZURE_KEY_VAULT_URL` (the variables
 * `services/integrations/secretStore.ts` selects Key Vault mode from) are
 * now honored here too, so a `report_secret_ref` minted by onboarding
 * (WP-BE5, via that same secret store) resolves correctly without also
 * having to set `MESH_KEYVAULT_URI` to the same value. `MESH_KEYVAULT_URI`
 * is checked first and still works as an explicit override.
 */
export function getSecretResolver(): SecretResolver {
  if (!cachedResolver) {
    const vaultUri = process.env.MESH_KEYVAULT_URI || process.env.KEY_VAULT_URL || process.env.AZURE_KEY_VAULT_URL;
    cachedResolver = vaultUri
      ? new KeyVaultSecretResolver(vaultUri)
      : new EnvSecretResolver();
  }
  return cachedResolver;
}

/** Test-only: force the next {@link getSecretResolver} call to re-evaluate. */
export function resetSecretResolverForTests(): void {
  cachedResolver = null;
}
