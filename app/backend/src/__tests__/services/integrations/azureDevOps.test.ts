/**
 * Unit tests for the Azure DevOps provider helpers (spec 007, WP-BE8).
 */
import {
  validateAzureDevOpsOrgUrl,
  testAzureDevOpsConnection,
  createAzureDevOpsClient,
} from "../../../services/integrations/providers/azureDevOps";

jest.mock("../../../utils/logger", () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

describe("validateAzureDevOpsOrgUrl (SSRF guard)", () => {
  it("accepts a plain dev.azure.com org URL", () => {
    expect(validateAzureDevOpsOrgUrl("https://dev.azure.com/goa-standards")).toEqual({ valid: true });
  });

  it("accepts a dev.azure.com org URL with a trailing slash", () => {
    expect(validateAzureDevOpsOrgUrl("https://dev.azure.com/goa-standards/")).toEqual({ valid: true });
  });

  it("accepts a visualstudio.com org URL", () => {
    expect(validateAzureDevOpsOrgUrl("https://goa-standards.visualstudio.com")).toEqual({ valid: true });
  });

  it("rejects a non-https scheme", () => {
    expect(validateAzureDevOpsOrgUrl("http://dev.azure.com/goa-standards").valid).toBe(false);
  });

  it("rejects an unrelated host (SSRF)", () => {
    expect(validateAzureDevOpsOrgUrl("https://evil.example.com/goa-standards").valid).toBe(false);
  });

  it("rejects a dev.azure.com URL with an extra path segment (could target internal APIs)", () => {
    expect(validateAzureDevOpsOrgUrl("https://dev.azure.com/goa-standards/some-extra-segment").valid).toBe(false);
  });

  it("rejects a URL with embedded credentials", () => {
    expect(validateAzureDevOpsOrgUrl("https://user:pass@dev.azure.com/goa-standards").valid).toBe(false);
  });

  it("rejects a URL with a query string", () => {
    expect(validateAzureDevOpsOrgUrl("https://dev.azure.com/goa-standards?x=1").valid).toBe(false);
  });

  it("rejects a visualstudio.com URL with a path", () => {
    expect(validateAzureDevOpsOrgUrl("https://goa-standards.visualstudio.com/extra").valid).toBe(false);
  });

  it("rejects garbage input", () => {
    expect(validateAzureDevOpsOrgUrl("not a url").valid).toBe(false);
  });

  it("rejects a dev.azure.com URL with no organization segment", () => {
    expect(validateAzureDevOpsOrgUrl("https://dev.azure.com/").valid).toBe(false);
  });

  // --- additional SSRF edge cases (spec 007, WP-BE8 verification) ---

  it("rejects a lookalike subdomain host (dev.azure.com.evil.com)", () => {
    expect(validateAzureDevOpsOrgUrl("https://dev.azure.com.evil.com/goa-standards").valid).toBe(false);
  });

  it("rejects a lookalike host with dev.azure.com as a path prefix, not the hostname", () => {
    expect(validateAzureDevOpsOrgUrl("https://evil.com/dev.azure.com/goa-standards").valid).toBe(false);
  });

  it("rejects userinfo with no password (user@host)", () => {
    expect(validateAzureDevOpsOrgUrl("https://admin@dev.azure.com/goa-standards").valid).toBe(false);
  });

  it("rejects an IPv4 literal host", () => {
    expect(validateAzureDevOpsOrgUrl("https://169.254.169.254/goa-standards").valid).toBe(false);
  });

  it("rejects an IPv4 literal host disguised as a path (SSRF via cloud metadata address)", () => {
    expect(validateAzureDevOpsOrgUrl("https://169.254.169.254/latest/meta-data").valid).toBe(false);
  });

  it("rejects an IPv6 literal host", () => {
    expect(validateAzureDevOpsOrgUrl("https://[::1]/goa-standards").valid).toBe(false);
  });

  it("rejects localhost", () => {
    expect(validateAzureDevOpsOrgUrl("https://localhost/goa-standards").valid).toBe(false);
  });

  it("rejects localhost with an explicit port", () => {
    expect(validateAzureDevOpsOrgUrl("https://localhost:8080/goa-standards").valid).toBe(false);
  });

  it("rejects a dev.azure.com URL with an explicit port (could target a co-located internal service)", () => {
    expect(validateAzureDevOpsOrgUrl("https://dev.azure.com:8443/goa-standards").valid).toBe(false);
  });

  it("rejects a visualstudio.com host with an extra leading label used to smuggle a different org", () => {
    expect(validateAzureDevOpsOrgUrl("https://evil.goa-standards.visualstudio.com").valid).toBe(false);
  });

  it("rejects a trailing-dot hostname (DNS root label bypass attempt)", () => {
    expect(validateAzureDevOpsOrgUrl("https://dev.azure.com./goa-standards").valid).toBe(false);
  });

  it("rejects http:// even for an otherwise-valid dev.azure.com URL", () => {
    expect(validateAzureDevOpsOrgUrl("http://dev.azure.com/goa-standards").valid).toBe(false);
  });
});

describe("testAzureDevOpsConnection", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("rejects an invalid org URL before making any network call", async () => {
    const fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await testAzureDevOpsConnection({
      organizationUrl: "https://evil.example.com/org",
      authType: "pat",
      patValue: "secret-pat",
    });

    expect(result.ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("succeeds for a PAT when Azure DevOps returns 200", async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, status: 200 });
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await testAzureDevOpsConnection({
      organizationUrl: "https://dev.azure.com/goa-standards",
      authType: "pat",
      patValue: "secret-pat",
    });

    expect(result.ok).toBe(true);
    // The PAT must be sent as a Basic auth header, never as a query param or body.
    const [, init] = fetchMock.mock.calls[0];
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe(`Basic ${Buffer.from(":secret-pat").toString("base64")}`);
  });

  it("fails for a PAT when Azure DevOps returns 401", async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: false, status: 401 });
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await testAzureDevOpsConnection({
      organizationUrl: "https://dev.azure.com/goa-standards",
      authType: "pat",
      patValue: "wrong-pat",
    });

    expect(result.ok).toBe(false);
    expect(result.error).toContain("401");
  });

  it("requires a PAT value when authType is pat", async () => {
    const result = await testAzureDevOpsConnection({
      organizationUrl: "https://dev.azure.com/goa-standards",
      authType: "pat",
    });
    expect(result.ok).toBe(false);
  });

  it("treats a network error as a failure, not a thrown exception", async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error("ECONNREFUSED")) as unknown as typeof fetch;

    const result = await testAzureDevOpsConnection({
      organizationUrl: "https://dev.azure.com/goa-standards",
      authType: "pat",
      patValue: "secret-pat",
    });

    expect(result.ok).toBe(false);
    expect(result.error).toContain("ECONNREFUSED");
  });
});

describe("createAzureDevOpsClient", () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("sends Basic auth built from the PAT on every request", async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, status: 200 });
    global.fetch = fetchMock as unknown as typeof fetch;

    const client = createAzureDevOpsClient("https://dev.azure.com/goa-standards/", "my-pat");
    await client.request("/_apis/projects?api-version=7.1");

    expect(fetchMock).toHaveBeenCalledWith(
      "https://dev.azure.com/goa-standards/_apis/projects?api-version=7.1",
      expect.anything()
    );
    const [, init] = fetchMock.mock.calls[0];
    const headers = init.headers as Headers;
    expect(headers.get("Authorization")).toBe(`Basic ${Buffer.from(":my-pat").toString("base64")}`);
  });
});
