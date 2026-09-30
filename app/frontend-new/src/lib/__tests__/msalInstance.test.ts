import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("lib/msalInstance", () => {
  it("is null in local mode and needs no Entra ids", async () => {
    vi.stubEnv("VITE_AUTH_MODE", "local");
    vi.stubEnv("VITE_ENTRA_CLIENT_ID", "");
    vi.stubEnv("VITE_ENTRA_TENANT_ID", "");
    const { msalInstance } = await import("../msalInstance");
    expect(msalInstance).toBeNull();
  });

  it("is a real PublicClientApplication otherwise", async () => {
    vi.stubEnv("VITE_AUTH_MODE", "msal");
    vi.stubEnv("VITE_ENTRA_CLIENT_ID", "00000000-0000-4000-8000-000000000001");
    vi.stubEnv("VITE_ENTRA_TENANT_ID", "organizations");
    const { msalInstance } = await import("../msalInstance");
    expect(msalInstance).not.toBeNull();
    expect(typeof msalInstance!.handleRedirectPromise).toBe("function");
  });

  it("still fails fast without a client id in MSAL mode", async () => {
    vi.stubEnv("VITE_AUTH_MODE", "msal");
    vi.stubEnv("VITE_ENTRA_CLIENT_ID", "");
    await expect(import("../msalInstance")).rejects.toThrow(/VITE_ENTRA_CLIENT_ID/);
  });
});
