import { z } from "zod";
import { useMutation, useQuery, useQueryClient, type UseQueryResult } from "@tanstack/react-query";
import apiClient from "@/lib/apiClient";

/**
 * Admin: Integrations API (T136, WP-A6). Typed TanStack Query hooks over
 * `app/backend/src/routes/admin/integrations.ts` (contracts/api.md "Admin:
 * Integrations (D-18), organization admins only"), validated with zod per
 * contracts/api.md §1. Never `fetch` in components.
 *
 * SECURITY (per `.github/agents/security.agent.md` and BE8's own doc
 * comment): the backend never returns a secret value — a PAT is write-only
 * (sent once in the POST body, never echoed back) and a `github_app`
 * connection has no secret at all. These schemas mirror that: there is no
 * `patValue`/secret field anywhere in a *response* shape below, only
 * `hasSecret: boolean`. Components must never log or display a `patValue`
 * once submitted, and the form clears it from local state after a
 * successful POST (see `AdminIntegrations.tsx`).
 */

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

/** GET /admin/integrations's `githubApp` -- the platform's shared installation status. */
export const githubAppStatusSchema = z.object({
  configured: z.boolean(),
  installationId: z.string().optional(),
  accountLogin: z.string().optional(),
  permissions: z.record(z.string()).optional(),
  ok: z.boolean(),
  error: z.string().optional(),
});
export type GitHubAppStatus = z.infer<typeof githubAppStatusSchema>;

export const connectionProviderSchema = z.enum(["github_app", "azure_devops"]);
export const connectionStatusSchema = z.enum(["ok", "failing", "untested"]);

/**
 * A masked connection row -- `maskConnection()` in the backend route never
 * includes `secret_ref`, only `hasSecret`. `scope` shape depends on
 * `provider` (data-model.md §4): `{owners: string[]}` for `github_app`,
 * `{organizationUrl, projects, serviceConnectionId?}` for `azure_devops` --
 * kept loose here (`z.record(z.unknown())`) and narrowed with the helpers
 * below rather than a discriminated union, since the API itself doesn't tag
 * `scope`'s shape with `provider` beyond the row's own `provider` field.
 */
export const integrationConnectionSchema = z.object({
  id: z.string(),
  provider: connectionProviderSchema,
  authType: z.enum(["app_installation", "service_connection", "pat"]),
  displayName: z.string(),
  scope: z.record(z.unknown()),
  status: connectionStatusSchema,
  lastTestedAt: z.string().nullable(),
  createdAt: z.string(),
  hasSecret: z.boolean(),
});
export type IntegrationConnection = z.infer<typeof integrationConnectionSchema>;

/** POST/GET .../test's response: the updated connection plus an optional failure detail. */
export const testConnectionResultSchema = integrationConnectionSchema.extend({
  testError: z.string().optional(),
});
export type TestConnectionResult = z.infer<typeof testConnectionResultSchema>;

/** GET /admin/integrations. */
export const adminIntegrationsSchema = z.object({
  githubApp: githubAppStatusSchema,
  githubAppConnections: z.array(integrationConnectionSchema),
  azureDevOps: z.array(integrationConnectionSchema),
});
export type AdminIntegrations = z.infer<typeof adminIntegrationsSchema>;

/** `scope.owners` for a `github_app` connection. */
export function githubAppOwners(connection: IntegrationConnection): string[] {
  const owners = connection.scope.owners;
  return Array.isArray(owners) ? owners.filter((o): o is string => typeof o === "string") : [];
}

/** `scope.organizationUrl` for an `azure_devops` connection. */
export function azureDevOpsOrgUrl(connection: IntegrationConnection): string {
  const url = connection.scope.organizationUrl;
  return typeof url === "string" ? url : "";
}

// ---------------------------------------------------------------------------
// Query keys
// ---------------------------------------------------------------------------

export const integrationsKeys = {
  admin: ["integrations", "admin"] as const,
};

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/**
 * GET /admin/integrations -- platform GitHub App status + this org's
 * connections. `enabled` (default `true`) lets a non-admin caller skip the
 * request entirely rather than rely on the backend's 403 alone --
 * `AdminIntegrations.tsx` passes `useAdmin().isAdmin` here.
 */
export function useAdminIntegrations(enabled = true): UseQueryResult<AdminIntegrations> {
  return useQuery({
    queryKey: integrationsKeys.admin,
    queryFn: async () => {
      const data = await apiClient.get<unknown>("/api/v1/admin/integrations");
      return adminIntegrationsSchema.parse(data);
    },
    enabled,
  });
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

/**
 * POST /admin/integrations with `provider: "github_app"` -- configures the
 * organization's onboarding import scope (`owners`). No secret involved.
 */
export function useCreateGitHubAppConnection() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { displayName: string; owners: string[] }) => {
      const data = await apiClient.post<unknown>("/api/v1/admin/integrations", {
        provider: "github_app",
        displayName: input.displayName,
        owners: input.owners,
      });
      return integrationConnectionSchema.parse(data);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: integrationsKeys.admin });
    },
  });
}

/** PATCH /admin/integrations/:id -- displayName and/or (github_app only) owners. */
export function useUpdateConnection() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; displayName?: string; owners?: string[] }) => {
      const { id, ...body } = input;
      const data = await apiClient.patch<unknown>(`/api/v1/admin/integrations/${id}`, body);
      return integrationConnectionSchema.parse(data);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: integrationsKeys.admin });
    },
  });
}

/**
 * POST /admin/integrations (default/omitted `provider`) -- adds an Azure
 * DevOps connection. `patValue` is sent once in this request body and never
 * appears in any response; the caller must drop it from local state after
 * this resolves (success or failure) so it isn't kept around or logged.
 */
export function useCreateAzureDevOpsConnection() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      displayName: string;
      organizationUrl: string;
      authType: "pat" | "service_connection";
      projects?: string[];
      patValue?: string;
      serviceConnectionId?: string;
    }) => {
      const data = await apiClient.post<unknown>("/api/v1/admin/integrations", input);
      return integrationConnectionSchema.parse(data);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: integrationsKeys.admin });
    },
  });
}

/** POST /admin/integrations/:id/test -- re-run the provider test call. */
export function useTestConnection() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const data = await apiClient.post<unknown>(`/api/v1/admin/integrations/${id}/test`, undefined);
      return testConnectionResultSchema.parse(data);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: integrationsKeys.admin });
    },
  });
}

/** DELETE /admin/integrations/:id -- blocked (409) while a repository or run still uses it. */
export function useDeleteConnection() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await apiClient.delete<void>(`/api/v1/admin/integrations/${id}`);
      return id;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: integrationsKeys.admin });
    },
  });
}
