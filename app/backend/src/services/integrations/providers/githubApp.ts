/**
 * GitHub App status for Admin -> Integrations (D-18).
 *
 * There is exactly one GitHub App installation for the whole platform
 * (`GITHUB_APP_ID` / `GITHUB_APP_INSTALLATION_ID` / `GITHUB_APP_PRIVATE_KEY`,
 * see {@link ../../../utils/githubAppAuth}) — organizations don't bring their
 * own GitHub App, they just see its status and permissions here. This module
 * reuses `githubAppAuth`'s configuration check and installation-token
 * exchange for the "is it working" test call, and additionally signs a
 * short-lived app-level JWT (the same construction as `githubAppAuth`, kept
 * local to this file to avoid changing shared, actively-developed auth code)
 * to read the installation's granted permissions from GitHub's
 * "Get an installation for the authenticated app" endpoint — a read-only,
 * introspection-only call.
 */
import jwt from "jsonwebtoken";
import { isGitHubAppConfigured, getInstallationToken } from "../../../utils/githubAppAuth";
import { logger } from "../../../utils/logger";

const GITHUB_APP_ID = process.env.GITHUB_APP_ID || "";
const GITHUB_APP_INSTALLATION_ID = process.env.GITHUB_APP_INSTALLATION_ID || "";
const GITHUB_APP_PRIVATE_KEY = (process.env.GITHUB_APP_PRIVATE_KEY || "").replace(/\\n/g, "\n");

export interface GitHubAppStatus {
  configured: boolean;
  installationId?: string;
  accountLogin?: string;
  permissions?: Record<string, string>;
  ok: boolean;
  error?: string;
}

function createShortLivedAppJwt(): string {
  const nowSeconds = Math.floor(Date.now() / 1000);
  return jwt.sign(
    { iss: GITHUB_APP_ID, iat: nowSeconds - 60, exp: nowSeconds + 10 * 60 },
    GITHUB_APP_PRIVATE_KEY,
    { algorithm: "RS256" }
  );
}

/**
 * Current status of the platform's GitHub App installation: whether it's
 * configured, and (when it is) the installation id, account and granted
 * permissions (expected to include `pull_requests` and `issues` for the
 * assurance-mesh PR/issue flows).
 */
export async function getGitHubAppStatus(): Promise<GitHubAppStatus> {
  if (!isGitHubAppConfigured()) {
    return { configured: false, ok: false, error: "GitHub App is not configured" };
  }

  try {
    // Confirms the private key + app id can mint a valid installation token
    // (exercises the same path used for real operations).
    await getInstallationToken();

    const appJwt = createShortLivedAppJwt();
    const res = await fetch(
      `https://api.github.com/app/installations/${GITHUB_APP_INSTALLATION_ID}`,
      {
        headers: {
          Authorization: `Bearer ${appJwt}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
        },
      }
    );

    if (!res.ok) {
      const body = await res.text();
      logger.warn(`[integrations/githubApp] Installation status check failed: ${res.status}`);
      return {
        configured: true,
        installationId: GITHUB_APP_INSTALLATION_ID,
        ok: false,
        error: `GitHub API returned ${res.status}: ${body.slice(0, 200)}`,
      };
    }

    const data = (await res.json()) as {
      account?: { login?: string };
      permissions?: Record<string, string>;
    };

    return {
      configured: true,
      installationId: GITHUB_APP_INSTALLATION_ID,
      accountLogin: data.account?.login,
      permissions: data.permissions,
      ok: true,
    };
  } catch (err: any) {
    logger.error(`[integrations/githubApp] Installation status check error: ${err.message}`);
    return { configured: true, installationId: GITHUB_APP_INSTALLATION_ID, ok: false, error: err.message };
  }
}
