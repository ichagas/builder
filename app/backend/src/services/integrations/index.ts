/**
 * Public surface of the integrations service (spec 007, D-18), consumed by
 * other work packages:
 *  - WP-BE4 (mesh issue/PR services) and WP-BE5 (onboarding import, PR
 *    opening) resolve the configured connection via {@link getConnection}
 *    and, for Azure Repos, get a ready-to-use REST client via
 *    {@link getAzureDevOpsClient}.
 *
 * Nothing here returns a secret value to an HTTP response — only server-side
 * callers within the backend process see resolved credentials.
 */
import {
  getConnectionForOrg,
  getDefaultConnectionForProvider,
  IntegrationConnectionRow,
  IntegrationProvider,
} from "./connectionRepository";
import { getSecretStore } from "./secretStore";
import { createAzureDevOpsClient, AzureDevOpsClient } from "./providers/azureDevOps";

export * from "./connectionRepository";
export * from "./secretStore";
export { getGitHubAppStatus } from "./providers/githubApp";
export {
  validateAzureDevOpsOrgUrl,
  testAzureDevOpsConnection,
  createAzureDevOpsClient,
} from "./providers/azureDevOps";
export type { AzureDevOpsClient } from "./providers/azureDevOps";

/**
 * Resolve the connection a caller should use: a specific `connectionId` when
 * given (must belong to the organization and match `provider`), otherwise
 * the organization's sole connection for that provider. Throws a descriptive
 * error if none is configured — callers (mesh/onboarding services) should
 * surface that as "integration not configured" to the user.
 */
export async function getConnection(
  organizationId: string,
  provider: IntegrationProvider,
  connectionId?: string
): Promise<IntegrationConnectionRow> {
  if (connectionId) {
    const connection = await getConnectionForOrg(connectionId, organizationId);
    if (!connection) {
      throw new Error(`Integration connection "${connectionId}" not found for this organization`);
    }
    if (connection.provider !== provider) {
      throw new Error(`Integration connection "${connectionId}" is not a ${provider} connection`);
    }
    return connection;
  }

  const connection = await getDefaultConnectionForProvider(organizationId, provider);
  if (!connection) {
    throw new Error(`No ${provider} integration is configured for this organization`);
  }
  return connection;
}

/**
 * A ready-to-use Azure DevOps REST client for the organization's configured
 * connection (or a specific `connectionId`). Only supported for `pat`
 * connections — a `service_connection` connection's credential is held by
 * Azure DevOps/Pipelines itself, not by Pronghorn, so there is no token to
 * build a client with; callers should let Azure Pipelines authenticate that
 * case itself (e.g. when opening a PR through a pipeline run rather than a
 * direct REST call).
 */
export async function getAzureDevOpsClient(
  organizationId: string,
  connectionId?: string
): Promise<AzureDevOpsClient> {
  const connection = await getConnection(organizationId, "azure_devops", connectionId);

  if (connection.auth_type !== "pat") {
    throw new Error(
      `Azure DevOps connection "${connection.id}" uses a service connection, not a PAT — ` +
        "no direct REST client is available for it."
    );
  }
  if (!connection.secret_ref) {
    throw new Error(`Azure DevOps connection "${connection.id}" has no stored secret`);
  }

  const organizationUrl = (connection.scope as { organizationUrl?: string })?.organizationUrl;
  if (!organizationUrl) {
    throw new Error(`Azure DevOps connection "${connection.id}" has no organization URL in scope`);
  }

  const pat = await getSecretStore().getSecret(connection.secret_ref);
  return createAzureDevOpsClient(organizationUrl, pat);
}
