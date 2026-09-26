/**
 * Admin: Integrations routes (spec 007, D-18, WP-BE8; `github_app` connection
 * config added in WP-BE5's fix round, to close the onboarding GitHub import
 * scope gap — see services/onboarding#listImportableGitHubRepositories).
 *
 * GET    /admin/integrations          - GitHub App platform status + this org's github_app/Azure DevOps connections
 * POST   /admin/integrations          - add a connection: `provider: "github_app"` (owners) or Azure DevOps (PAT/service connection)
 * PATCH  /admin/integrations/:id      - update displayName and/or (github_app only) owners
 * POST   /admin/integrations/:id/test - test the connection
 * DELETE /admin/integrations/:id      - remove a connection (409 while in use)
 *
 * Organization admins only, scoped to their own organization. The platform's
 * single GitHub App *installation* (env-configured, see
 * `utils/githubAppAuth.ts`) is unaffected by any of this — there is still
 * only one installation, with one set of credentials, shared by every
 * organization. What an org-scoped `github_app` connection controls is
 * narrower and holds no credentials of its own: which owners (GitHub users
 * or organizations) that organization's onboarding "import repositories"
 * list is allowed to draw from (fix round 1, item 6 — see
 * services/onboarding#listImportableGitHubRepositories). `GET
 * /admin/integrations` still reports the platform installation's own status
 * (`githubApp`) separately from the organization's configured owners
 * (`githubAppConnections`).
 *
 * SECURITY: secret values (PATs) are written to Key Vault and never stored
 * in the database, returned in any response, or logged. Responses expose
 * only `hasSecret: boolean`. `github_app` connections hold no secret at all
 * (`secret_ref` is always null) — the App's credentials are platform-wide
 * env/Key Vault configuration, not something an org admin provides.
 */
import { Router, Request, Response } from "express";
import { Errors } from "../../middleware/errorHandler";
import { logger } from "../../utils/logger";
import { isOrgAdmin, getUserOrgId } from "../../services/teams/authorization";
import {
  listConnections,
  getConnectionForOrg,
  createConnection,
  updateConnectionFields,
  updateConnectionTestResult,
  isConnectionInUse,
  deleteConnection,
  IntegrationConnectionRow,
} from "../../services/integrations/connectionRepository";
import { getSecretStore } from "../../services/integrations/secretStore";
import {
  getGitHubAppStatus,
  isValidGitHubLogin,
  verifyGitHubOwnersHaveRepositories,
} from "../../services/integrations/providers/githubApp";
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
 * organization's own connections: `github_app` (owner scope for onboarding
 * import) and Azure DevOps.
 */
router.get("/", async (req: Request, res: Response) => {
  const orgId = await requireOrgAdmin(req);

  const [githubApp, connections] = await Promise.all([
    getGitHubAppStatus(),
    listConnections(orgId),
  ]);

  const githubAppConnections = connections
    .filter((c) => c.provider === "github_app")
    .map(maskConnection);
  const azureDevOps = connections
    .filter((c) => c.provider === "azure_devops")
    .map(maskConnection);

  return res.json({ githubApp, githubAppConnections, azureDevOps });
});

const MAX_GITHUB_OWNERS = 50;

/**
 * Validates a `github_app` connection's `owners` list: required, non-empty,
 * at most {@link MAX_GITHUB_OWNERS}, each a syntactically valid GitHub
 * login. Returns the normalized (trimmed, lowercased, de-duplicated) list.
 */
function normalizeAndValidateOwners(rawOwners: unknown): string[] {
  if (!Array.isArray(rawOwners) || rawOwners.length === 0) {
    throw Errors.validation({ owners: "required: at least one GitHub user or organization login" });
  }
  if (rawOwners.length > MAX_GITHUB_OWNERS) {
    throw Errors.validation({ owners: `at most ${MAX_GITHUB_OWNERS} owners are allowed` });
  }

  const normalized = rawOwners.map((owner) => (typeof owner === "string" ? owner.trim().toLowerCase() : owner));
  for (const owner of normalized) {
    if (!isValidGitHubLogin(owner)) {
      throw Errors.validation({ owners: `"${owner}" is not a valid GitHub login` });
    }
  }

  return Array.from(new Set(normalized as string[]));
}

interface CreateGitHubAppBody {
  provider: "github_app";
  displayName?: string;
  owners?: unknown;
}

interface CreateAzureDevOpsBody {
  provider?: "azure_devops";
  displayName?: string;
  organizationUrl?: string;
  authType?: "pat" | "service_connection";
  projects?: string[];
  patValue?: string;
  serviceConnectionId?: string;
}

/**
 * POST /admin/integrations
 * `{ provider: "github_app", displayName, owners: string[] }` adds/updates
 * which GitHub owners this organization's onboarding import may draw from —
 * no secret involved, the App's credentials are platform-wide. Anything
 * else (or an omitted `provider`, for backward compatibility) adds an Azure
 * DevOps connection; `patValue` (when authType is `pat`) is written to Key
 * Vault and never persisted anywhere else, only the returned secret name
 * goes to the database.
 */
router.post("/", async (req: Request, res: Response) => {
  const orgId = await requireOrgAdmin(req);
  const body = (req.body ?? {}) as Partial<CreateGitHubAppBody> & Partial<CreateAzureDevOpsBody>;

  if (!body.displayName || typeof body.displayName !== "string") {
    throw Errors.validation({ displayName: "required" });
  }

  if (body.provider === "github_app") {
    const owners = normalizeAndValidateOwners(body.owners);

    const connection = await createConnection({
      organizationId: orgId,
      provider: "github_app",
      authType: "app_installation",
      displayName: body.displayName,
      secretRef: null,
      scope: { owners },
    });

    logger.info(
      `[admin/integrations] GitHub App connection created (id=${connection.id}, org=${orgId}, owners=${owners.length})`
    );

    return res.status(201).json(maskConnection(connection));
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
 * PATCH /admin/integrations/:id
 * Update a connection's display name and/or (github_app only) owners.
 * Nothing else is editable here — an Azure DevOps connection's org URL,
 * auth type or secret are recreated via delete + POST, matching how they
 * were validated together at creation time.
 */
router.patch("/:id", async (req: Request, res: Response) => {
  const orgId = await requireOrgAdmin(req);
  const { id } = req.params;
  const body = (req.body ?? {}) as { displayName?: unknown; owners?: unknown };

  const connection = await getConnectionForOrg(id, orgId);
  if (!connection) throw Errors.notFound("Integration connection");

  if (body.displayName === undefined && body.owners === undefined) {
    throw Errors.validation({ body: "provide displayName and/or owners to update" });
  }

  const fields: { displayName?: string; scope?: Record<string, unknown> } = {};

  if (body.displayName !== undefined) {
    if (typeof body.displayName !== "string" || !body.displayName.trim()) {
      throw Errors.validation({ displayName: "must be a non-empty string" });
    }
    fields.displayName = body.displayName;
  }

  if (body.owners !== undefined) {
    if (connection.provider !== "github_app") {
      throw Errors.badRequest("owners can only be set on a github_app connection");
    }
    const owners = normalizeAndValidateOwners(body.owners);
    fields.scope = { ...connection.scope, owners };
  }

  const updated = await updateConnectionFields(id, fields);

  logger.info(`[admin/integrations] Connection updated (id=${id}, org=${orgId})`);

  return res.json(maskConnection(updated));
});

/**
 * POST /admin/integrations/:id/test
 * Re-run the provider test call and persist the resulting status. For a
 * `github_app` connection, confirms the platform's shared installation can
 * see at least one repository under every configured owner.
 */
router.post("/:id/test", async (req: Request, res: Response) => {
  const orgId = await requireOrgAdmin(req);
  const { id } = req.params;

  const connection = await getConnectionForOrg(id, orgId);
  if (!connection) throw Errors.notFound("Integration connection");

  if (connection.provider === "github_app") {
    const owners = (connection.scope as { owners?: string[] })?.owners ?? [];
    if (owners.length === 0) throw Errors.badRequest("Connection has no owners configured");

    const results = await verifyGitHubOwnersHaveRepositories(owners);
    const failing = results.filter((r) => !r.ok);
    const ok = failing.length === 0;

    const updated = await updateConnectionTestResult(id, ok ? "ok" : "failing");

    logger.info(`[admin/integrations] GitHub App connection tested (id=${id}, org=${orgId}, result=${ok ? "ok" : "failing"})`);

    return res.json({
      ...maskConnection(updated),
      testError: ok ? undefined : failing.map((f) => `${f.owner}: ${f.error}`).join("; "),
    });
  }

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
