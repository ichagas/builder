/**
 * Unit tests for mesh report secret resolution (spec 007, WP-BE4;
 * fix round 2, item 3: honoring KEY_VAULT_URL/AZURE_KEY_VAULT_URL, the same
 * variables services/integrations/secretStore.ts (WP-BE8) selects Key Vault
 * mode from, not just the mesh-specific MESH_KEYVAULT_URI).
 */
jest.mock("../../../utils/logger", () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

describe("getSecretResolver — env var selection", () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...ORIGINAL_ENV };
    delete process.env.MESH_KEYVAULT_URI;
    delete process.env.KEY_VAULT_URL;
    delete process.env.AZURE_KEY_VAULT_URL;
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  it("defaults to the env-var resolver when nothing is configured", async () => {
    const { getSecretResolver, EnvSecretResolver } = await import("../../../services/mesh/secretResolver");
    expect(getSecretResolver()).toBeInstanceOf(EnvSecretResolver);
  });

  it("selects the Key Vault resolver from KEY_VAULT_URL (fix round 2, item 3)", async () => {
    process.env.KEY_VAULT_URL = "https://kv-pronghorn.vault.azure.net";
    const { getSecretResolver, KeyVaultSecretResolver } = await import("../../../services/mesh/secretResolver");
    expect(getSecretResolver()).toBeInstanceOf(KeyVaultSecretResolver);
  });

  it("selects the Key Vault resolver from AZURE_KEY_VAULT_URL too", async () => {
    process.env.AZURE_KEY_VAULT_URL = "https://kv-pronghorn.vault.azure.net";
    const { getSecretResolver, KeyVaultSecretResolver } = await import("../../../services/mesh/secretResolver");
    expect(getSecretResolver()).toBeInstanceOf(KeyVaultSecretResolver);
  });

  it("MESH_KEYVAULT_URI still works as an explicit override, and is preferred if all three are set", async () => {
    process.env.MESH_KEYVAULT_URI = "https://mesh-only-vault.vault.azure.net";
    process.env.KEY_VAULT_URL = "https://kv-pronghorn.vault.azure.net";
    const { getSecretResolver, KeyVaultSecretResolver } = await import("../../../services/mesh/secretResolver");
    const resolver = getSecretResolver();
    expect(resolver).toBeInstanceOf(KeyVaultSecretResolver);
    expect((resolver as any).vaultUri).toBe("https://mesh-only-vault.vault.azure.net");
  });

  it("EnvSecretResolver is selected when only INTEGRATIONS_SECRET_STORE=memory-style envs are set (no vault URL at all)", async () => {
    const { getSecretResolver, EnvSecretResolver } = await import("../../../services/mesh/secretResolver");
    expect(getSecretResolver()).toBeInstanceOf(EnvSecretResolver);
  });
});

describe("secretStore <-> secretResolver integration (fix round 2, item 3)", () => {
  const ORIGINAL_ENV = process.env;
  // Named with a `mock` prefix so Jest's module-factory hoisting allows
  // referencing it from the jest.mock() factories below.
  const mockVaultStorage = new Map<string, string>();

  beforeEach(() => {
    jest.resetModules();
    mockVaultStorage.clear();
    process.env = {
      ...ORIGINAL_ENV,
      NODE_ENV: "test",
      KEY_VAULT_URL: "https://kv-pronghorn.vault.azure.net",
    };
    delete process.env.MESH_KEYVAULT_URI;
    delete process.env.AZURE_KEY_VAULT_URL;
    delete process.env.INTEGRATIONS_SECRET_STORE;
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  jest.mock("@azure/keyvault-secrets", () => ({
    SecretClient: jest.fn().mockImplementation(() => ({
      setSecret: jest.fn(async (name: string, value: string) => {
        mockVaultStorage.set(name, value);
        return { name, value };
      }),
      beginDeleteSecret: jest.fn(),
    })),
  }));

  jest.mock("../../../utils/azureCredential", () => ({
    getAzureCredential: jest.fn(() => ({})),
    getAzureTokenForScope: jest.fn(async () => "fake-azure-token"),
    AzureScope: { KeyVault: "https://vault.azure.net/.default" },
  }));

  it("a secret minted via secretStore (WP-BE8, e.g. onboarding's report_secret_ref) resolves back to the same value via secretResolver, using the same KEY_VAULT_URL", async () => {
    // Fake the Key Vault data-plane GET .../secrets/{name} that
    // KeyVaultSecretResolver calls directly with fetch (no SDK client).
    const originalFetch = global.fetch;
    global.fetch = jest.fn(async (url: string) => {
      const match = /\/secrets\/([^/?]+)/.exec(url);
      const name = match ? decodeURIComponent(match[1]) : "";
      if (!mockVaultStorage.has(name)) {
        return { ok: false, status: 404 } as Response;
      }
      return { ok: true, json: async () => ({ value: mockVaultStorage.get(name) }) } as unknown as Response;
    }) as unknown as typeof fetch;

    try {
      const { getSecretStore } = await import("../../../services/integrations/secretStore");
      const { getSecretResolver } = await import("../../../services/mesh/secretResolver");

      const store = getSecretStore();
      const secretRef = await store.createSecret("onboarding-mesh", "super-secret-hmac-value");

      const resolver = getSecretResolver();
      const resolved = await resolver.resolveReportSecret(secretRef);

      expect(resolved).toBe("super-secret-hmac-value");
    } finally {
      global.fetch = originalFetch;
    }
  });

  it("returns null (never falls back to a default) for a ref that was never minted", async () => {
    global.fetch = jest.fn(async () => ({ ok: false, status: 404 })) as unknown as typeof fetch;

    const { getSecretResolver } = await import("../../../services/mesh/secretResolver");
    const resolved = await getSecretResolver().resolveReportSecret("integration-onboarding-mesh-does-not-exist");

    expect(resolved).toBeNull();
  });
});
