/**
 * Minimal Key Vault client for the sandbox job (spec 007, WP-BE6, T141,
 * fix round 1 item 1) — raw REST calls via `fetch`, not the
 * `@azure/identity`/`@azure/keyvault-secrets` SDKs, to keep this image
 * small (it has no other Azure dependency).
 *
 * Managed identity token: Azure Container Apps (like every Azure compute
 * host) exposes the standard Azure Instance Metadata Service (IMDS) token
 * endpoint at a well-known link-local address. For a user-assigned identity,
 * the client id must be passed explicitly (`PRONGHORN_IDENTITY_CLIENT_ID` —
 * set by Terraform's `azurerm_container_app_job.onboarding_sandbox`
 * `identity.identity_ids`, `infra/main.tf`).
 *
 * Fix round 2, item A (security): this module deliberately exposes only
 * {@link getSecret} — one GET by exact name, never a LIST/enumerate call.
 * That's not just a coding convention: the sandbox job's UAMI is granted a
 * custom Azure role with exactly one dataAction,
 * `Microsoft.KeyVault/vaults/secrets/getSecret/action` (`infra/main.tf`'s
 * `onboarding_sandbox_kv_secret_getter`), not the built-in "Key Vault
 * Secrets User" role (which also grants `secrets/readMetadata/action` —
 * list). Even if this file grew a list call by mistake, the vault itself
 * would reject it. See `infra/onboarding-sandbox/README.md`'s "Secrets: the
 * sandbox Key Vault" section for the full residual-risk writeup.
 */

const IMDS_TOKEN_ENDPOINT = "http://169.254.169.254/metadata/identity/oauth2/token";
const KEY_VAULT_RESOURCE = "https://vault.azure.net";
const KEY_VAULT_API_VERSION = "7.4";

interface ImdsTokenResponse {
  access_token: string;
  expires_on: string;
}

let cachedToken: { value: string; expiresAtSeconds: number } | null = null;

async function getManagedIdentityToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedToken.expiresAtSeconds - 60 > now) {
    return cachedToken.value;
  }

  const clientId = process.env.PRONGHORN_IDENTITY_CLIENT_ID;
  const params = new URLSearchParams({
    "api-version": "2018-02-01",
    resource: KEY_VAULT_RESOURCE,
  });
  if (clientId) params.set("client_id", clientId);

  const res = await fetch(`${IMDS_TOKEN_ENDPOINT}?${params.toString()}`, {
    headers: { Metadata: "true" },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`could not acquire a managed identity token: ${res.status} ${text.slice(0, 200)}`);
  }
  const data = (await res.json()) as ImdsTokenResponse;
  cachedToken = { value: data.access_token, expiresAtSeconds: Number(data.expires_on) };
  return data.access_token;
}

/**
 * Fetch one secret's current value from `vaultUri` by name. Never logs the
 * value; callers must not either.
 */
export async function getSecret(vaultUri: string, name: string): Promise<string> {
  const token = await getManagedIdentityToken();
  const base = vaultUri.replace(/\/+$/, "");
  const res = await fetch(`${base}/secrets/${encodeURIComponent(name)}?api-version=${KEY_VAULT_API_VERSION}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    // Never include a header/body that could carry vault contents.
    throw new Error(`could not read secret "${name}" from the sandbox vault: ${res.status}`);
  }
  const data = (await res.json()) as { value?: string };
  if (!data.value) throw new Error(`secret "${name}" has no value`);
  return data.value;
}
