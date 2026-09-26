/**
 * Unit tests for the secret store abstraction (spec 007, WP-BE8).
 *
 * Security-critical: these tests assert the secret VALUE is never exposed
 * through the returned name/ref, and that the in-memory store (selected in
 * tests/local dev) round-trips correctly without ever writing to a database.
 */
import { logger } from "../../../utils/logger";

jest.mock("../../../utils/logger", () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

describe("secretStore selection", () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...ORIGINAL_ENV };
    delete process.env.KEY_VAULT_URL;
    delete process.env.AZURE_KEY_VAULT_URL;
    delete process.env.INTEGRATIONS_SECRET_STORE;
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  it("defaults to the in-memory store when no Key Vault URL is configured", async () => {
    const { getSecretStore } = await import("../../../services/integrations/secretStore");
    const store = getSecretStore();

    const name = await store.createSecret("azure-devops", "super-secret-pat");
    expect(name).not.toContain("super-secret-pat");

    const value = await store.getSecret(name);
    expect(value).toBe("super-secret-pat");
  });

  it("generates a secret name that never embeds the secret value or free-form prefixes", async () => {
    const { getSecretStore } = await import("../../../services/integrations/secretStore");
    const store = getSecretStore();

    const name = await store.createSecret("../../etc/passwd; DROP TABLE", "value");
    expect(name).toMatch(/^integration-[A-Za-z0-9-]+-[0-9a-f-]{36}$/);
  });

  it("deleteSecret is a no-op for a name that was never created", async () => {
    const { getSecretStore } = await import("../../../services/integrations/secretStore");
    const store = getSecretStore();
    await expect(store.deleteSecret("integration-does-not-exist")).resolves.not.toThrow();
  });

  it("getSecret throws for an unknown name rather than returning undefined", async () => {
    const { getSecretStore } = await import("../../../services/integrations/secretStore");
    const store = getSecretStore();
    await expect(store.getSecret("integration-nope")).rejects.toThrow();
  });

  it("never logs the secret value on create", async () => {
    const { getSecretStore } = await import("../../../services/integrations/secretStore");
    const store = getSecretStore();
    await store.createSecret("azure-devops", "totally-secret-value-xyz");

    const allLogCalls = [
      ...(logger.info as jest.Mock).mock.calls,
      ...(logger.warn as jest.Mock).mock.calls,
      ...(logger.error as jest.Mock).mock.calls,
      ...(logger.debug as jest.Mock).mock.calls,
    ].flat();
    for (const call of allLogCalls) {
      expect(String(call)).not.toContain("totally-secret-value-xyz");
    }
  });

  it("selects the Key Vault store when KEY_VAULT_URL is set, without throwing at import/build time", async () => {
    process.env.KEY_VAULT_URL = "https://example.vault.azure.net";
    // Constructing SecretClient with DefaultAzureCredential must not require
    // network access or throw synchronously.
    const { getSecretStore } = await import("../../../services/integrations/secretStore");
    expect(() => getSecretStore()).not.toThrow();
  });

  it("INTEGRATIONS_SECRET_STORE=memory forces the in-memory store even with a vault URL set", async () => {
    process.env.KEY_VAULT_URL = "https://example.vault.azure.net";
    process.env.INTEGRATIONS_SECRET_STORE = "memory";
    const { getSecretStore } = await import("../../../services/integrations/secretStore");
    const store = getSecretStore();
    const name = await store.createSecret("azure-devops", "value");
    // In-memory store round-trips without any network call.
    await expect(store.getSecret(name)).resolves.toBe("value");
  });
});

describe("secretStore fail-closed behavior (production without Key Vault)", () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...ORIGINAL_ENV };
    delete process.env.KEY_VAULT_URL;
    delete process.env.AZURE_KEY_VAULT_URL;
    delete process.env.INTEGRATIONS_SECRET_STORE;
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  it("logs an error at module load (startup) when misconfigured, without throwing", async () => {
    process.env.NODE_ENV = "production";
    const { logger: freshLogger } = await import("../../../utils/logger");
    // Importing the module must not throw even though it's misconfigured —
    // other, unrelated routes must keep working.
    await expect(import("../../../services/integrations/secretStore")).resolves.toBeDefined();
    expect(freshLogger.error).toHaveBeenCalledWith(expect.stringContaining("No secret store is configured"));
  });

  it("throws a 503 SecretStoreConfigurationError at first use (production, no vault URL, no override)", async () => {
    process.env.NODE_ENV = "production";
    const { getSecretStore, SecretStoreConfigurationError } = await import(
      "../../../services/integrations/secretStore"
    );

    expect(() => getSecretStore()).toThrow(SecretStoreConfigurationError);
    try {
      getSecretStore();
      throw new Error("expected getSecretStore() to throw");
    } catch (err: any) {
      expect(err).toBeInstanceOf(SecretStoreConfigurationError);
      expect(err.statusCode).toBe(503);
    }
  });

  it("fails closed when NODE_ENV is unset (default env is treated as non-dev/test)", async () => {
    delete process.env.NODE_ENV;
    const { getSecretStore } = await import("../../../services/integrations/secretStore");
    expect(() => getSecretStore()).toThrow();
  });

  it("allows the in-memory store in development, but logs a warning (used outside tests)", async () => {
    process.env.NODE_ENV = "development";
    const { logger: freshLogger } = await import("../../../utils/logger");
    const { getSecretStore } = await import("../../../services/integrations/secretStore");
    expect(() => getSecretStore()).not.toThrow();
    expect(freshLogger.warn).toHaveBeenCalledWith(expect.stringContaining("in-memory secret store outside tests"));
  });

  it("does not warn when the in-memory store is used under NODE_ENV=test", async () => {
    process.env.NODE_ENV = "test";
    const { logger: freshLogger } = await import("../../../utils/logger");
    const { getSecretStore } = await import("../../../services/integrations/secretStore");
    getSecretStore();
    expect(freshLogger.warn).not.toHaveBeenCalled();
  });

  it("an explicit INTEGRATIONS_SECRET_STORE=memory override in production still logs a warning", async () => {
    process.env.NODE_ENV = "production";
    process.env.INTEGRATIONS_SECRET_STORE = "memory";
    const { logger: freshLogger } = await import("../../../utils/logger");
    const { getSecretStore } = await import("../../../services/integrations/secretStore");
    expect(() => getSecretStore()).not.toThrow();
    expect(freshLogger.warn).toHaveBeenCalledWith(expect.stringContaining("in-memory secret store outside tests"));
  });
});
