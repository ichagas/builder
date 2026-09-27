/**
 * Unit tests for GitHub App status (spec 007, WP-BE8).
 */
jest.mock("../../../utils/logger", () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

jest.mock("../../../utils/githubAppAuth", () => ({
  isGitHubAppConfigured: jest.fn(),
  getInstallationToken: jest.fn(),
}));

// The app-level JWT signature itself isn't under test here (it mirrors
// githubAppAuth's own, already-tested construction) — stub it out so this
// suite doesn't depend on a real RSA private key being configured.
jest.mock("jsonwebtoken", () => ({ sign: jest.fn(() => "fake-app-jwt") }));

import { isGitHubAppConfigured, getInstallationToken } from "../../../utils/githubAppAuth";
import {
  getGitHubAppStatus,
  isValidGitHubLogin,
  verifyGitHubOwnersHaveRepositories,
} from "../../../services/integrations/providers/githubApp";

const mockIsConfigured = isGitHubAppConfigured as jest.Mock;
const mockGetToken = getInstallationToken as jest.Mock;

describe("getGitHubAppStatus", () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
    jest.resetAllMocks();
  });

  it("reports not configured without making any network call", async () => {
    mockIsConfigured.mockReturnValue(false);
    const fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;

    const status = await getGitHubAppStatus();

    expect(status).toEqual({ configured: false, ok: false, error: "GitHub App is not configured" });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(mockGetToken).not.toHaveBeenCalled();
  });

  it("reports ok with permissions when the installation responds", async () => {
    mockIsConfigured.mockReturnValue(true);
    mockGetToken.mockResolvedValue("installation-token");
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        account: { login: "goa-standards" },
        permissions: { pull_requests: "write", issues: "write" },
      }),
    }) as unknown as typeof fetch;

    const status = await getGitHubAppStatus();

    expect(status.configured).toBe(true);
    expect(status.ok).toBe(true);
    expect(status.accountLogin).toBe("goa-standards");
    expect(status.permissions).toEqual({ pull_requests: "write", issues: "write" });
  });

  it("reports not-ok when GitHub returns a non-2xx status, without throwing", async () => {
    mockIsConfigured.mockReturnValue(true);
    mockGetToken.mockResolvedValue("installation-token");
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 404,
      text: async () => "Not Found",
    }) as unknown as typeof fetch;

    const status = await getGitHubAppStatus();

    expect(status.configured).toBe(true);
    expect(status.ok).toBe(false);
    expect(status.error).toContain("404");
  });

  it("reports not-ok when the token exchange throws", async () => {
    mockIsConfigured.mockReturnValue(true);
    mockGetToken.mockRejectedValue(new Error("bad private key"));

    const status = await getGitHubAppStatus();

    expect(status.ok).toBe(false);
    expect(status.error).toContain("bad private key");
  });
});

describe("isValidGitHubLogin", () => {
  it.each(["goa", "goa-standards", "a", "a1", "GOA-Standards", "x".repeat(39)])(
    "accepts %s",
    (login) => {
      expect(isValidGitHubLogin(login)).toBe(true);
    }
  );

  it.each([
    "",
    "-leading",
    "trailing-",
    "goa--standards",
    "goa_standards",
    "goa standards",
    "x".repeat(40),
    "goa/standards",
    null,
    undefined,
    42,
  ])("rejects %p", (login) => {
    expect(isValidGitHubLogin(login)).toBe(false);
  });
});

describe("verifyGitHubOwnersHaveRepositories", () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
    jest.resetAllMocks();
  });

  it("reports every owner as not-ok, without a network call, when the App isn't configured", async () => {
    mockIsConfigured.mockReturnValue(false);
    const fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;

    const results = await verifyGitHubOwnersHaveRepositories(["goa", "goa-labs"]);

    expect(results).toEqual([
      { owner: "goa", ok: false, error: "GitHub App is not configured" },
      { owner: "goa-labs", ok: false, error: "GitHub App is not configured" },
    ]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("marks an owner ok only when a visible repository's owner login matches (case-insensitively)", async () => {
    mockIsConfigured.mockReturnValue(true);
    mockGetToken.mockResolvedValue("installation-token");
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        repositories: [{ owner: { login: "GOA-Standards" } }, { owner: { login: "other-org" } }],
      }),
    }) as unknown as typeof fetch;

    const results = await verifyGitHubOwnersHaveRepositories(["goa-standards", "goa-labs"]);

    expect(results).toEqual([
      { owner: "goa-standards", ok: true, error: undefined },
      { owner: "goa-labs", ok: false, error: "No repositories visible to the installation under this owner" },
    ]);
  });

  it("reports every owner as failing when GitHub returns a non-2xx status", async () => {
    mockIsConfigured.mockReturnValue(true);
    mockGetToken.mockResolvedValue("installation-token");
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 500 }) as unknown as typeof fetch;

    const results = await verifyGitHubOwnersHaveRepositories(["goa"]);

    expect(results).toEqual([{ owner: "goa", ok: false, error: "GitHub API returned 500" }]);
  });

  it("reports every owner as failing when the token exchange throws", async () => {
    mockIsConfigured.mockReturnValue(true);
    mockGetToken.mockRejectedValue(new Error("bad private key"));

    const results = await verifyGitHubOwnersHaveRepositories(["goa"]);

    expect(results).toEqual([{ owner: "goa", ok: false, error: "bad private key" }]);
  });

  it("paginates until a short page, across multiple owners", async () => {
    mockIsConfigured.mockReturnValue(true);
    mockGetToken.mockResolvedValue("installation-token");
    const fullPage = Array.from({ length: 100 }, () => ({ owner: { login: "goa" } }));
    const secondPage = [{ owner: { login: "goa-labs" } }];
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ repositories: fullPage }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ repositories: secondPage }) });
    global.fetch = fetchMock as unknown as typeof fetch;

    const results = await verifyGitHubOwnersHaveRepositories(["goa", "goa-labs"]);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(results).toEqual([
      { owner: "goa", ok: true, error: undefined },
      { owner: "goa-labs", ok: true, error: undefined },
    ]);
  });
});
