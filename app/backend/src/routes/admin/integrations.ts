/**
 * Admin: Integrations routes (spec 007, D-18, WP-BE8).
 *
 * GET    /admin/integrations          - GitHub App status + Azure DevOps connections
 * POST   /admin/integrations          - add an Azure DevOps connection (PAT or service connection)
 * POST   /admin/integrations/:id/test - test an Azure DevOps connection
 * DELETE /admin/integrations/:id      - remove an Azure DevOps connection (409 while in use)
 *
 * Organization admins only, scoped to their own organization. The GitHub App
 * is a single platform-wide installation (env-configured, see
 * `utils/githubAppAuth.ts`) — it has no per-organization row, isn't created
 * or deleted through this API, and its status is read-only.
 *
 * SECURITY: secret values (PATs) are written to Key Vault and never stored
 * in the database, returned in any response, or logged. Responses expose
 * only `hasSecret: boolean`.
 */
import { Router, Request, Response } from "express";
import { Errors } from "../../middleware/errorHandler";
import { logger } from "../../utils/logger";
import { isOrgAdmin, getUserOrgId } from "../../services/teams/authorization";
import {
  listConnections,
  getConnectionForOrg,
  createConnection,
  updateConnectionTestResult,
  isConnectionInUse,
  deleteConnection,
  IntegrationConnectionRow,
} from "../../services/integrations/connectionRepository";
import { getSecretStore } from "../../services/integrations/secretStore";
import { getGitHubAppStatus } from "../../services/integrations/providers/githubApp";
import {
  validateAzureDevOpsOrgUrl,
  testAzureDevOpsConnection,
} from "../../services/integrations/providers/azureDevOps";

const router = Router();

/** Require an authenticated organization admin; returns the caller's org id. */
async function requireOrgAdmin(req: Request): Promise<string> {
  const userId = req.user?.id;
  if (!userId) throw Errors.unauthorized();

  const admin = await isOrgAdmin(userId);
  if (!admin) throw Errors.forbidden("Organization admin role required");

  const orgId = await getUserOrgId(userId);
  if (!orgId) throw Errors.forbidden("No organization for this account");

  return orgId;
}

/** Never include `secret_ref` — only whether a secret is stored. */
function maskConnection(row: IntegrationConnectionRow) {
  return {
    id: row.id,
    provider: row.provider,
    authType: row.auth_type,
    displayName: row.display_name,
    scope: row.scope,
    status: row.status,
    lastTestedAt: row.last_tested_at,
    createdAt: row.created_at,
    hasSecret: Boolean(row.secret_ref),
  };
}

/**
 * GET /admin/integrations
 * GitHub App installation status (platform-wide, read-only) plus this
 * organization's Azure DevOps connections.
 */
router.get("/", async (req: Request, res: Response) => {
  const orgId = await requireOrgAdmin(req);

  const [githubApp, connections] = await Promise.all([
    getGitHubAppStatus(),
    listConnections(orgId),
  ]);

  const azureDevOps = connections
    .filter((c) => c.provider === "azure_devops")
    .map(maskConnection);

  return res.json({ githubApp, azureDevOps });
});

interface CreateAzureDevOpsBody {
  displayName?: string;
  organizationUrl?: string;
  authType?: "pat" | "service_connection";
  projects?: string[];
  patValue?: string;
  serviceConnectionId?: string;
}

/**
 * POST /admin/integrations
 * Add an Azure DevOps connection. `patValue` (when authType is `pat`) is
 * written to Key Vault and never persisted anywhere else; only the returned
 * secret name goes to the database.
 */
router.post("/", async (req: Request, res: Response) => {
  const orgId = await requireOrgAdmin(req);
  const body = (req.body ?? {}) as CreateAzureDevOpsBody;

  if (!body.displayName || typeof body.displayName !== "string") {
    throw Errors.validation({ displayName: "required" });
  }
  if (!body.organizationUrl || typeof body.organizationUrl !== "string") {
    throw Errors.validation({ organizationUrl: "required" });
  }
  if (body.authType !== "pat" && body.authType !== "service_connection") {
    throw Errors.validation({ authType: "must be 'pat' or 'service_connection'" });
  }

  // SSRF guard: only a well-formed Azure DevOps organization URL is accepted,
  // never an arbitrary host the server would later issue authenticated
  // requests to.
  const orgCheck = validateAzureDevOpsOrgUrl(body.organizationUrl);
  if (!orgCheck.valid) {
    throw Errors.validation({ organizationUrl: orgCheck.error });
  }

  let secretRef: string | null = null;

  if (body.authType === "pat") {
    if (!body.patValue || typeof body.patValue !== "string") {
      throw Errors.validation({ patValue: "required when authType is 'pat'" });
    }
    secretRef = await getSecretStore().createSecret("azure-devops", body.patValue);
  } else {
    if (!body.serviceConnectionId || typeof body.serviceConnectionId !== "string") {
      throw Errors.validation({ serviceConnectionId: "required when authType is 'service_connection'" });
    }
  }

  const scope: Record<string, unknown> = {
    organizationUrl: body.organizationUrl,
    projects: Array.isArray(body.projects) ? body.projects : [],
  };
  if (body.authType === "service_connection") {
    scope.serviceConnectionId = body.serviceConnectionId;
  }

  const connection = await createConnection({
    organizationId: orgId,
    provider: "azure_devops",
    authType: body.authType,
    displayName: body.displayName,
    secretRef,
    scope,
  });

  logger.info(
    `[admin/integrations] Azure DevOps connection created (id=${connection.id}, org=${orgId}, authType=${body.authType})`
  );

  return res.status(201).json(maskConnection(connection));
});

/**
 * POST /admin/integrations/:id/test
 * Re-run the provider test call and persist the resulting status.
 */
router.post("/:id/test", async (req: Request, res: Response) => {
  const orgId = await requireOrgAdmin(req);
  const { id } = req.params;

  const connection = await getConnectionForOrg(id, orgId);
  if (!connection) throw Errors.notFound("Integration connection");

  const organizationUrl = (connection.scope as { organizationUrl?: string })?.organizationUrl;
  if (!organizationUrl) throw Errors.badRequest("Connection has no organization URL configured");

  let patValue: string | undefined;
  if (connection.auth_type === "pat") {
    if (!connection.secret_ref) throw Errors.badRequest("Connection has no stored secret");
    patValue = await getSecretStore().getSecret(connection.secret_ref);
  }

  const result = await testAzureDevOpsConnection({
    organizationUrl,
    authType: connection.auth_type === "pat" ? "pat" : "service_connection",
    patValue,
  });

  const updated = await updateConnectionTestResult(id, result.ok ? "ok" : "failing");

  logger.info(
    `[admin/integrations] Connection tested (id=${id}, org=${orgId}, result=${result.ok ? "ok" : "failing"})`
  );

  return res.json({ ...maskConnection(updated), testError: result.ok ? undefined : result.error });
});

/**
 * DELETE /admin/integrations/:id
 * Blocked (409) while any repository or onboarding run still references it.
 * Also removes the Key Vault secret, if any.
 */
router.delete("/:id", async (req: Request, res: Response) => {
  const orgId = await requireOrgAdmin(req);
  const { id } = req.params;

  const connection = await getConnectionForOrg(id, orgId);
  if (!connection) throw Errors.notFound("Integration connection");

  const inUse = await isConnectionInUse(id);
  if (inUse) {
    throw Errors.conflict("Connection is in use by one or more repositories or onboarding runs");
  }

  if (connection.secret_ref) {
    await getSecretStore().deleteSecret(connection.secret_ref);
  }
  await deleteConnection(id);

  logger.info(`[admin/integrations] Connection deleted (id=${id}, org=${orgId})`);

  return res.status(204).send();
});

export default router;
