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
import { getGitHubAppStatus } from "../../../services/integrations/providers/githubApp";

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
