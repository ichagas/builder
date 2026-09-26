/**
 * Azure DevOps connection validation and test calls (D-18).
 *
 * Admins configure an org URL plus either a PAT or a service connection.
 * Only the PAT case holds a secret Pronghorn calls with directly — a service
 * connection's credential lives in Azure DevOps / Azure Pipelines itself, so
 * there's nothing for us to authenticate with beyond confirming the org URL
 * is reachable. (Deviation, noted in the WP-BE8 report: the spec leaves the
 * PAT/service-connection choice to admins but doesn't define what a
 * service-connection "test" call does; this is the simplest reading.)
 */
import { logger } from "../../../utils/logger";

const AZURE_DEVOPS_API_VERSION = "7.1";

/**
 * SSRF guard: only `https://dev.azure.com/<org>` or
 * `https://<org>.visualstudio.com` (optionally with a trailing slash and
 * nothing else) are accepted as an organization URL. Rejects anything with a
 * path beyond the org segment, query strings, credentials in the URL,
 * non-https schemes, or a different host entirely (which could otherwise be
 * used to make the server issue authenticated requests to an
 * attacker-controlled endpoint).
 */
export function validateAzureDevOpsOrgUrl(input: string): { valid: boolean; error?: string } {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return { valid: false, error: "Not a valid URL" };
  }

  if (url.protocol !== "https:") {
    return { valid: false, error: "Organization URL must use https" };
  }
  if (url.username || url.password) {
    return { valid: false, error: "Organization URL must not contain credentials" };
  }
  if (url.search || url.hash) {
    return { valid: false, error: "Organization URL must not contain a query string or fragment" };
  }

  const path = url.pathname.replace(/\/+$/, "");

  if (url.hostname === "dev.azure.com") {
    // https://dev.azure.com/<org>  (exactly one path segment)
    const segments = path.split("/").filter(Boolean);
    if (segments.length !== 1 || !/^[A-Za-z0-9._-]+$/.test(segments[0])) {
      return { valid: false, error: "Expected https://dev.azure.com/<organization>" };
    }
    return { valid: true };
  }

  if (/^[A-Za-z0-9-]+\.visualstudio\.com$/.test(url.hostname)) {
    // https://<org>.visualstudio.com  (no further path)
    if (path !== "") {
      return { valid: false, error: "Expected https://<organization>.visualstudio.com with no path" };
    }
    return { valid: true };
  }

  return {
    valid: false,
    error: "Organization URL must be https://dev.azure.com/<organization> or https://<organization>.visualstudio.com",
  };
}

function basicAuthHeader(pat: string): string {
  return `Basic ${Buffer.from(`:${pat}`).toString("base64")}`;
}

export interface AzureDevOpsTestInput {
  organizationUrl: string;
  authType: "pat" | "service_connection";
  patValue?: string;
}

export interface AzureDevOpsTestResult {
  ok: boolean;
  error?: string;
}

/**
 * Test call against Azure DevOps. For `pat`, lists projects (a low-privilege,
 * read-only call available to any authenticated identity) using Basic auth.
 * For `service_connection`, only confirms the org URL responds (no
 * credential to authenticate with here — see module docstring).
 */
export async function testAzureDevOpsConnection(input: AzureDevOpsTestInput): Promise<AzureDevOpsTestResult> {
  const orgCheck = validateAzureDevOpsOrgUrl(input.organizationUrl);
  if (!orgCheck.valid) {
    return { ok: false, error: orgCheck.error };
  }

  const projectsUrl = `${input.organizationUrl.replace(/\/+$/, "")}/_apis/projects?api-version=${AZURE_DEVOPS_API_VERSION}`;

  try {
    if (input.authType === "pat") {
      if (!input.patValue) {
        return { ok: false, error: "A personal access token is required" };
      }
      const res = await fetch(projectsUrl, {
        headers: { Authorization: basicAuthHeader(input.patValue) },
      });
      if (!res.ok) {
        return { ok: false, error: `Azure DevOps returned ${res.status}` };
      }
      return { ok: true };
    }

    // service_connection: unauthenticated reachability check only.
    const res = await fetch(projectsUrl, { method: "GET" });
    // Azure DevOps returns 203/401 (not 404/5xx) for an unrecognized-but-valid
    // org URL when unauthenticated — any response short of a network error or
    // 5xx indicates the org URL is reachable and resolves to Azure DevOps.
    if (res.status >= 500) {
      return { ok: false, error: `Azure DevOps returned ${res.status}` };
    }
    return { ok: true };
  } catch (err: any) {
    logger.warn(`[integrations/azureDevOps] Test call failed: ${err.message}`);
    return { ok: false, error: err.message };
  }
}

/**
 * A minimal REST client for an Azure DevOps organization, authenticated with
 * a resolved PAT. Consumed by other work packages (onboarding import, PR and
 * work-item services) via {@link ../index.getAzureDevOpsClient}.
 */
export interface AzureDevOpsClient {
  organizationUrl: string;
  /** Issue an authenticated request against `{organizationUrl}{path}` (path includes leading `/`). */
  request(path: string, init?: RequestInit): Promise<Response>;
}

export function createAzureDevOpsClient(organizationUrl: string, pat: string): AzureDevOpsClient {
  const base = organizationUrl.replace(/\/+$/, "");
  return {
    organizationUrl: base,
    async request(path: string, init: RequestInit = {}): Promise<Response> {
      const headers = new Headers(init.headers);
      headers.set("Authorization", basicAuthHeader(pat));
      if (!headers.has("Accept")) headers.set("Accept", "application/json");
      return fetch(`${base}${path}`, { ...init, headers });
    },
  };
}
