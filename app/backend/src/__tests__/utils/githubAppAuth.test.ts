/**
 * Unit tests for utils/githubAppAuth.ts's repo-scoped installation token
 * (spec 007, WP-BE4, fix round 1: mesh issue/PR operations must not use the
 * installation-wide token).
 */
jest.mock("../../utils/logger", () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

jest.mock("jsonwebtoken", () => ({ sign: jest.fn(() => "fake-app-jwt") }));

const ORIGINAL_ENV = process.env;

beforeEach(() => {
  jest.resetModules();
  process.env = {
    ...ORIGINAL_ENV,
    GITHUB_APP_ID: "12345",
    GITHUB_APP_INSTALLATION_ID: "67890",
    GITHUB_APP_PRIVATE_KEY: "fake-private-key",
  };
});

afterEach(() => {
  process.env = ORIGINAL_ENV;
  jest.restoreAllMocks();
});

describe("getInstallationTokenForRepo", () => {
  it("requests a token scoped to only the repo name (no owner) and the given permissions", async () => {
    const mockFetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ token: "ghs_scoped", expires_at: "2026-09-26T18:00:00Z" }),
    });
    global.fetch = mockFetch as unknown as typeof fetch;

    const { getInstallationTokenForRepo } = await import("../../utils/githubAppAuth");

    const token = await getInstallationTokenForRepo({
      fullName: "goa/permits-api",
      permissions: { issues: "write" },
    });

    expect(token).toBe("ghs_scoped");
    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.github.com/app/installations/67890/access_tokens",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ repositories: ["permits-api"], permissions: { issues: "write" } }),
      }),
    );
  });

  it("never reuses or populates the whole-installation token cache", async () => {
    const mockFetch = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ token: "ghs_scoped_a", expires_at: "2026-09-26T18:00:00Z" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ token: "ghs_scoped_b", expires_at: "2026-09-26T18:00:00Z" }),
      });
    global.fetch = mockFetch as unknown as typeof fetch;

    const { getInstallationTokenForRepo } = await import("../../utils/githubAppAuth");

    const first = await getInstallationTokenForRepo({ fullName: "goa/permits-api", permissions: { issues: "write" } });
    const second = await getInstallationTokenForRepo({
      fullName: "goa/other-repo",
      permissions: { contents: "write", pull_requests: "write" },
    });

    // Two distinct calls, two distinct tokens — no cross-repo caching.
    expect(first).toBe("ghs_scoped_a");
    expect(second).toBe("ghs_scoped_b");
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(mockFetch).toHaveBeenNthCalledWith(
      2,
      "https://api.github.com/app/installations/67890/access_tokens",
      expect.objectContaining({
        body: JSON.stringify({
          repositories: ["other-repo"],
          permissions: { contents: "write", pull_requests: "write" },
        }),
      }),
    );
  });

  it("throws when the GitHub App is not configured", async () => {
    process.env.GITHUB_APP_ID = "";
    const { getInstallationTokenForRepo } = await import("../../utils/githubAppAuth");

    await expect(
      getInstallationTokenForRepo({ fullName: "goa/permits-api", permissions: { issues: "write" } }),
    ).rejects.toThrow(/not configured/);
  });

  it("throws a descriptive error when GitHub's token exchange fails", async () => {
    const mockFetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 422,
      text: async () => "Unprocessable: unknown permission",
    });
    global.fetch = mockFetch as unknown as typeof fetch;

    const { getInstallationTokenForRepo } = await import("../../utils/githubAppAuth");

    await expect(
      getInstallationTokenForRepo({ fullName: "goa/permits-api", permissions: { issues: "write" } }),
    ).rejects.toThrow(/422/);
  });
});
