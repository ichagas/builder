/**
 * Unit tests for the dedicated onboarding sandbox secret store (spec 007,
 * WP-BE6, T141, fix round 1 item 1). NODE_ENV=test under jest, so
 * `getSandboxSecretStore()` resolves to the in-memory store — no Key Vault
 * involved, matching how the platform secretStore.ts tests exercise this.
 */
jest.mock("../../../../utils/logger", () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

describe("sandboxSecretStore selection", () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...ORIGINAL_ENV };
    delete process.env.ONBOARDING_SANDBOX_KEYVAULT_URL;
    delete process.env.ONBOARDING_SANDBOX_SECRET_STORE;
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  it("defaults to the in-memory store when no vault URL is configured (test env)", async () => {
    const { getSandboxSecretStore } = await import("../../../../services/onboarding/sandbox/sandboxSecretStore");
    const store = getSandboxSecretStore();

    const name = await store.createSecret("repo-auth", "super-secret-value", 1800);
    expect(name).not.toContain("super-secret-value");
    await expect(store.getSecret(name)).resolves.toBe("super-secret-value");
  });

  it("throws SandboxSecretStoreConfigurationError in production with nothing configured", async () => {
    process.env.NODE_ENV = "production";
    const { getSandboxSecretStore, SandboxSecretStoreConfigurationError } = await import(
      "../../../../services/onboarding/sandbox/sandboxSecretStore"
    );
    expect(() => getSandboxSecretStore()).toThrow(SandboxSecretStoreConfigurationError);
  });

  it("allows an explicit memory opt-in outside production, with a warning", async () => {
    process.env.NODE_ENV = "production";
    process.env.ONBOARDING_SANDBOX_SECRET_STORE = "memory";
    // `jest.resetModules()` above gives this a fresh copy of the logger
    // mock too — assert against that copy, not the one captured at this
    // file's top-level import.
    const { logger: freshLogger } = await import("../../../../utils/logger");
    const { getSandboxSecretStore } = await import("../../../../services/onboarding/sandbox/sandboxSecretStore");
    expect(() => getSandboxSecretStore()).not.toThrow();
    expect(freshLogger.warn).toHaveBeenCalled();
  });
});

describe("cleanupSandboxSecrets", () => {
  let sandbox: typeof import("../../../../services/onboarding/sandbox/sandboxSecretStore");
  let freshLogger: typeof import("../../../../utils/logger").logger;

  beforeEach(async () => {
    // Fresh module registry per test (matching secretStore.test.ts's own
    // convention) so the dynamically re-imported sandbox module and the
    // logger it calls internally are always the SAME instance this test
    // asserts against — a stale, separately-captured `logger` reference
    // would silently observe zero calls.
    jest.resetModules();
    sandbox = await import("../../../../services/onboarding/sandbox/sandboxSecretStore");
    freshLogger = (await import("../../../../utils/logger")).logger;
    sandbox.__resetSandboxSecretStoreForTests();
  });

  it("deletes every distinct, non-empty name and leaves the store empty", async () => {
    const store = sandbox.getSandboxSecretStore();
    const a = await store.createSecret("repo-auth", "value-a", 1800);
    const b = await store.createSecret("repo-auth", "value-b", 1800);

    await sandbox.cleanupSandboxSecrets([a, b, a, null, undefined, ""]);

    await expect(store.getSecret(a)).rejects.toThrow();
    await expect(store.getSecret(b)).rejects.toThrow();
  });

  it("is a no-op for an empty/all-null list", async () => {
    await expect(sandbox.cleanupSandboxSecrets([null, undefined])).resolves.toBeUndefined();
  });

  it("never throws when a deletion fails — logs and continues with the rest", async () => {
    const store = sandbox.getSandboxSecretStore();
    const good = await store.createSecret("repo-auth", "value", 1800);
    const originalDelete = store.deleteSecret.bind(store);
    store.deleteSecret = jest.fn(async (name: string) => {
      if (name === "missing-name") throw new Error("boom");
      return originalDelete(name);
    });

    await expect(sandbox.cleanupSandboxSecrets(["missing-name", good])).resolves.toBeUndefined();
    expect(freshLogger.warn).toHaveBeenCalledWith(expect.stringContaining("failed to delete sandbox secret"));
    await expect(store.getSecret(good)).rejects.toThrow();
  });
});
