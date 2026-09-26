/**
 * Unit tests for Admin: Integrations routes (spec 007, D-18, WP-BE8).
 *
 * Security-critical: covers the authorization matrix (admin / non-admin /
 * other-org admin), that secret values never appear in a response or a log
 * line, SSRF validation on the organization URL, DELETE being blocked while
 * a connection is in use, and test-connection success/failure with mocked
 * providers.
 */
import express from "express";
import "express-async-errors";
import request from "supertest";
import integrationsRouter from "../../../routes/admin/integrations";
import { errorHandler } from "../../../middleware/errorHandler";

jest.mock("../../../utils/logger", () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

// Force the in-memory secret store regardless of the host environment.
process.env.INTEGRATIONS_SECRET_STORE = "memory";
process.env.KEY_VAULT_URL = "";

jest.mock("../../../services/integrations/providers/githubApp", () => ({
  getGitHubAppStatus: jest.fn(async () => ({
    configured: true,
    installationId: "12345",
    accountLogin: "goa-standards",
    permissions: { pull_requests: "write", issues: "write" },
    ok: true,
  })),
}));

jest.mock("../../../utils/database", () => {
  const queryFn = jest.fn();
  return {
    __esModule: true,
    default: { query: queryFn, healthCheck: jest.fn(), getActiveDbPort: jest.fn() },
  };
});

import db from "../../../utils/database";
import { logger } from "../../../utils/logger";
const mockDbQuery = db.query as jest.Mock;

function fakeAuth(userId?: string) {
  return (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    if (userId) req.user = { id: userId, email: "test@test.com" };
    next();
  };
}

function createApp(userId?: string) {
  const app = express();
  app.use(express.json());
  app.use(fakeAuth(userId));
  app.use("/admin/integrations", integrationsRouter);
  app.use(errorHandler);
  return app;
}

const ORG_ID = "org-1";
const OTHER_ORG_ID = "org-2";
const ADMIN_USER_ID = "user-admin";
const ADMIN_PROFILE_ORG = ORG_ID;
const OTHER_ORG_ADMIN_USER_ID = "user-other-org-admin";
const NON_ADMIN_USER_ID = "user-member";

let connections: any[];
let inUseIds: Set<string>;
let onboardingRunsTableExists: boolean;

function profileOrgFor(userId: string): string | undefined {
  if (userId === ADMIN_USER_ID) return ADMIN_PROFILE_ORG;
  if (userId === OTHER_ORG_ADMIN_USER_ID) return OTHER_ORG_ID;
  if (userId === NON_ADMIN_USER_ID) return ORG_ID;
  return undefined;
}
function isAdminUser(userId: string): boolean {
  return userId === ADMIN_USER_ID || userId === OTHER_ORG_ADMIN_USER_ID;
}

function installFixtureDb() {
  mockDbQuery.mockImplementation(async (sql: string, params: any[] = []) => {
    // --- authorization (services/teams/authorization.ts, unmocked) ---
    if (sql.includes("SELECT org_id FROM public.profiles")) {
      const org = profileOrgFor(params[0]);
      return { rows: org ? [{ org_id: org }] : [] };
    }
    if (sql.includes("FROM public.user_roles WHERE user_id")) {
      return { rows: isAdminUser(params[0]) ? [{ "?column?": 1 }] : [] };
    }

    // --- connectionRepository ---
    if (sql.includes("INSERT INTO public.integration_connections")) {
      const [organizationId, provider, authType, displayName, secretRef, scope] = params;
      const row = {
        id: `conn-${connections.length + 1}`,
        organization_id: organizationId,
        provider,
        auth_type: authType,
        display_name: displayName,
        secret_ref: secretRef,
        scope: JSON.parse(scope),
        last_tested_at: null,
        status: "untested",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      connections.push(row);
      return { rows: [row] };
    }
    if (sql.includes("UPDATE public.integration_connections")) {
      const [id, status] = params;
      const row = connections.find((c) => c.id === id);
      if (row) {
        row.status = status;
        row.last_tested_at = new Date().toISOString();
      }
      return { rows: row ? [row] : [] };
    }
    if (sql.includes("DELETE FROM public.integration_connections")) {
      connections = connections.filter((c) => c.id !== params[0]);
      return { rows: [] };
    }
    if (sql.includes("SELECT to_regclass('public.onboarding_runs')")) {
      return { rows: [{ exists: onboardingRunsTableExists }] };
    }
    if (sql.includes("FROM public.onboarding_runs WHERE connection_id")) {
      return { rows: inUseIds.has(params[0]) ? [{ "?column?": 1 }] : [] };
    }
    if (sql.includes("FROM public.application_repositories WHERE connection_id")) {
      return { rows: inUseIds.has(params[0]) ? [{ "?column?": 1 }] : [] };
    }
    if (sql.includes("WHERE id = $1 AND organization_id = $2")) {
      const row = connections.find((c) => c.id === params[0] && c.organization_id === params[1]);
      return { rows: row ? [row] : [] };
    }
    if (sql.includes("FROM public.integration_connections") && sql.includes("WHERE organization_id = $1")) {
      return { rows: connections.filter((c) => c.organization_id === params[0]) };
    }

    throw new Error(`Unexpected query in test: ${sql}`);
  });
}

beforeEach(() => {
  connections = [];
  inUseIds = new Set();
  onboardingRunsTableExists = false;
  mockDbQuery.mockReset();
  installFixtureDb();
});

describe("GET /admin/integrations — authorization", () => {
  it("401s when unauthenticated", async () => {
    const res = await request(createApp()).get("/admin/integrations");
    expect(res.status).toBe(401);
  });

  it("403s for a non-admin", async () => {
    const res = await request(createApp(NON_ADMIN_USER_ID)).get("/admin/integrations");
    expect(res.status).toBe(403);
  });

  it("200s for an org admin and includes GitHub App status", async () => {
    const res = await request(createApp(ADMIN_USER_ID)).get("/admin/integrations");
    expect(res.status).toBe(200);
    expect(res.body.githubApp.configured).toBe(true);
    expect(res.body.githubApp.permissions).toEqual({ pull_requests: "write", issues: "write" });
    expect(res.body.azureDevOps).toEqual([]);
  });

  it("lists the created connection with hasSecret=true but never a secret_ref/secretRef field or the secret value", async () => {
    await request(createApp(ADMIN_USER_ID))
      .post("/admin/integrations")
      .send({
        displayName: "Main Azure DevOps",
        organizationUrl: "https://dev.azure.com/goa-standards",
        authType: "pat",
        patValue: "list-canary-secret-value",
      });

    const res = await request(createApp(ADMIN_USER_ID)).get("/admin/integrations");
    expect(res.status).toBe(200);
    expect(res.body.azureDevOps).toHaveLength(1);
    expect(res.body.azureDevOps[0].hasSecret).toBe(true);
    expect(res.body.azureDevOps[0].secretRef).toBeUndefined();
    expect(res.body.azureDevOps[0].secret_ref).toBeUndefined();
    expect(JSON.stringify(res.body)).not.toContain("list-canary-secret-value");
  });

  it("only lists connections for the admin's own organization", async () => {
    await request(createApp(ADMIN_USER_ID))
      .post("/admin/integrations")
      .send({
        displayName: "Org 1 conn",
        organizationUrl: "https://dev.azure.com/org1",
        authType: "pat",
        patValue: "pat-value-1",
      });

    const res = await request(createApp(OTHER_ORG_ADMIN_USER_ID)).get("/admin/integrations");
    expect(res.status).toBe(200);
    expect(res.body.azureDevOps).toEqual([]);
  });
});

describe("POST /admin/integrations — create + SSRF validation + secret handling", () => {
  it("403s for a non-admin", async () => {
    const res = await request(createApp(NON_ADMIN_USER_ID))
      .post("/admin/integrations")
      .send({ displayName: "x", organizationUrl: "https://dev.azure.com/org1", authType: "pat", patValue: "p" });
    expect(res.status).toBe(403);
  });

  it("rejects a non-Azure-DevOps organization URL (SSRF guard)", async () => {
    const res = await request(createApp(ADMIN_USER_ID))
      .post("/admin/integrations")
      .send({
        displayName: "Evil",
        organizationUrl: "https://internal-metadata.example.com/latest",
        authType: "pat",
        patValue: "pat-value",
      });
    expect(res.status).toBe(422);
    expect(connections).toHaveLength(0);
  });

  it("rejects a dev.azure.com URL with extra path segments (SSRF guard)", async () => {
    const res = await request(createApp(ADMIN_USER_ID))
      .post("/admin/integrations")
      .send({
        displayName: "Evil",
        organizationUrl: "https://dev.azure.com/org1/some-extra-segment",
        authType: "pat",
        patValue: "pat-value",
      });
    expect(res.status).toBe(422);
  });

  it("requires patValue when authType is pat", async () => {
    const res = await request(createApp(ADMIN_USER_ID))
      .post("/admin/integrations")
      .send({ displayName: "x", organizationUrl: "https://dev.azure.com/org1", authType: "pat" });
    expect(res.status).toBe(422);
  });

  it("creates a PAT connection: secret is never returned in the response", async () => {
    const res = await request(createApp(ADMIN_USER_ID))
      .post("/admin/integrations")
      .send({
        displayName: "Main Azure DevOps",
        organizationUrl: "https://dev.azure.com/goa-standards",
        authType: "pat",
        patValue: "super-secret-pat-value",
      });

    expect(res.status).toBe(201);
    expect(JSON.stringify(res.body)).not.toContain("super-secret-pat-value");
    expect(res.body.hasSecret).toBe(true);
    expect(res.body.secretRef).toBeUndefined();
    expect(res.body.secret_ref).toBeUndefined();
  });

  it("never logs the secret value", async () => {
    await request(createApp(ADMIN_USER_ID))
      .post("/admin/integrations")
      .send({
        displayName: "Main Azure DevOps",
        organizationUrl: "https://dev.azure.com/goa-standards",
        authType: "pat",
        patValue: "log-canary-secret-value",
      });

    const allLogCalls = [
      ...(logger.info as jest.Mock).mock.calls,
      ...(logger.warn as jest.Mock).mock.calls,
      ...(logger.error as jest.Mock).mock.calls,
      ...(logger.debug as jest.Mock).mock.calls,
    ].flat();
    for (const call of allLogCalls) {
      expect(String(call)).not.toContain("log-canary-secret-value");
    }
  });

  it("never persists the secret value in the database — only a secret_ref name", async () => {
    await request(createApp(ADMIN_USER_ID))
      .post("/admin/integrations")
      .send({
        displayName: "Main Azure DevOps",
        organizationUrl: "https://dev.azure.com/goa-standards",
        authType: "pat",
        patValue: "db-canary-secret-value",
      });

    expect(connections).toHaveLength(1);
    expect(connections[0].secret_ref).not.toContain("db-canary-secret-value");
    expect(JSON.stringify(connections[0])).not.toContain("db-canary-secret-value");
  });

  it("creates a service_connection connection without requiring a secret", async () => {
    const res = await request(createApp(ADMIN_USER_ID))
      .post("/admin/integrations")
      .send({
        displayName: "Pipelines service connection",
        organizationUrl: "https://dev.azure.com/goa-standards",
        authType: "service_connection",
        serviceConnectionId: "sc-123",
      });
    expect(res.status).toBe(201);
    expect(res.body.hasSecret).toBe(false);
  });
});

describe("POST /admin/integrations/:id/test", () => {
  async function seedConnection(authType: "pat" | "service_connection" = "pat") {
    const res = await request(createApp(ADMIN_USER_ID))
      .post("/admin/integrations")
      .send({
        displayName: "Test conn",
        organizationUrl: "https://dev.azure.com/goa-standards",
        authType,
        patValue: authType === "pat" ? "pat-value" : undefined,
        serviceConnectionId: authType === "service_connection" ? "sc-1" : undefined,
      });
    return res.body.id as string;
  }

  it("403s for a non-admin", async () => {
    const id = await seedConnection();
    const res = await request(createApp(NON_ADMIN_USER_ID)).post(`/admin/integrations/${id}/test`);
    expect(res.status).toBe(403);
  });

  it("404s for a connection belonging to another organization", async () => {
    const id = await seedConnection();
    const res = await request(createApp(OTHER_ORG_ADMIN_USER_ID)).post(`/admin/integrations/${id}/test`);
    expect(res.status).toBe(404);
  });

  it("marks the connection 'ok' when the provider test succeeds", async () => {
    const originalFetch = global.fetch;
    global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200 }) as unknown as typeof fetch;

    const id = await seedConnection();
    const res = await request(createApp(ADMIN_USER_ID)).post(`/admin/integrations/${id}/test`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
    expect(JSON.stringify(res.body)).not.toContain("pat-value");

    global.fetch = originalFetch;
  });

  it("marks the connection 'failing' when the provider test fails", async () => {
    const originalFetch = global.fetch;
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 401 }) as unknown as typeof fetch;

    const id = await seedConnection();
    const res = await request(createApp(ADMIN_USER_ID)).post(`/admin/integrations/${id}/test`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("failing");
    expect(res.body.testError).toContain("401");

    global.fetch = originalFetch;
  });
});

describe("DELETE /admin/integrations/:id", () => {
  async function seedConnection() {
    const res = await request(createApp(ADMIN_USER_ID))
      .post("/admin/integrations")
      .send({
        displayName: "Test conn",
        organizationUrl: "https://dev.azure.com/goa-standards",
        authType: "pat",
        patValue: "pat-value",
      });
    return res.body.id as string;
  }

  it("403s for a non-admin", async () => {
    const id = await seedConnection();
    const res = await request(createApp(NON_ADMIN_USER_ID)).delete(`/admin/integrations/${id}`);
    expect(res.status).toBe(403);
  });

  it("404s for a connection belonging to another organization", async () => {
    const id = await seedConnection();
    const res = await request(createApp(OTHER_ORG_ADMIN_USER_ID)).delete(`/admin/integrations/${id}`);
    expect(res.status).toBe(404);
  });

  it("409s while a repository still references the connection", async () => {
    const id = await seedConnection();
    inUseIds.add(id);

    const res = await request(createApp(ADMIN_USER_ID)).delete(`/admin/integrations/${id}`);
    expect(res.status).toBe(409);
    expect(connections.find((c) => c.id === id)).toBeDefined();
  });

  it("409s while an onboarding run still references the connection (when the table exists)", async () => {
    onboardingRunsTableExists = true;
    const id = await seedConnection();
    inUseIds.add(id);

    const res = await request(createApp(ADMIN_USER_ID)).delete(`/admin/integrations/${id}`);
    expect(res.status).toBe(409);
  });

  it("204s and removes the connection when it is not in use", async () => {
    const id = await seedConnection();
    const res = await request(createApp(ADMIN_USER_ID)).delete(`/admin/integrations/${id}`);
    expect(res.status).toBe(204);
    expect(connections.find((c) => c.id === id)).toBeUndefined();
  });

  it("deletes the Key Vault secret (via the secret store) and the secret is actually gone afterwards", async () => {
    const { getSecretStore } = await import("../../../services/integrations/secretStore");
    const store = getSecretStore();
    const deleteSecretSpy = jest.spyOn(store, "deleteSecret");

    const id = await seedConnection();
    const secretRef = connections.find((c) => c.id === id)?.secret_ref;
    expect(secretRef).toBeTruthy();

    // Sanity: the secret exists in the store before delete.
    await expect(store.getSecret(secretRef)).resolves.toBe("pat-value");

    const res = await request(createApp(ADMIN_USER_ID)).delete(`/admin/integrations/${id}`);
    expect(res.status).toBe(204);

    expect(deleteSecretSpy).toHaveBeenCalledWith(secretRef);
    // The secret store no longer has the secret after the connection is deleted.
    await expect(store.getSecret(secretRef)).rejects.toThrow();

    deleteSecretSpy.mockRestore();
  });
});
