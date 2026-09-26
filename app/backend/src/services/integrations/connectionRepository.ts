/**
 * Repository for `public.integration_connections` (spec 007, D-18).
 *
 * Every row-shaped type here EXCLUDES the secret value (only `secret_ref`,
 * the Key Vault secret name, is ever read from or written to the database).
 * Callers that need the secret value go through {@link getSecretStore} with
 * the `secret_ref` returned here.
 */
import db from "../../utils/database";

export type IntegrationProvider = "github_app" | "azure_devops";
export type IntegrationAuthType = "app_installation" | "service_connection" | "pat";
export type IntegrationStatus = "ok" | "failing" | "untested";

export interface IntegrationConnectionRow {
  id: string;
  organization_id: string;
  provider: IntegrationProvider;
  auth_type: IntegrationAuthType;
  display_name: string;
  secret_ref: string | null;
  scope: Record<string, unknown>;
  last_tested_at: string | null;
  status: IntegrationStatus;
  created_at: string;
  updated_at: string;
}

const SELECT_COLUMNS = `
  id, organization_id, provider, auth_type, display_name, secret_ref,
  scope, last_tested_at, status, created_at, updated_at
`;

/** All connections for an organization, newest first. */
export async function listConnections(organizationId: string): Promise<IntegrationConnectionRow[]> {
  const { rows } = await db.query(
    `SELECT ${SELECT_COLUMNS} FROM public.integration_connections
     WHERE organization_id = $1
     ORDER BY created_at DESC`,
    [organizationId]
  );
  return rows;
}

/** A single connection by id, or null. Does not check organization scope. */
export async function getConnectionById(id: string): Promise<IntegrationConnectionRow | null> {
  const { rows } = await db.query(
    `SELECT ${SELECT_COLUMNS} FROM public.integration_connections WHERE id = $1`,
    [id]
  );
  return rows[0] ?? null;
}

/**
 * A connection scoped to an organization: returns null both when the
 * connection doesn't exist and when it belongs to a different organization,
 * so callers can't distinguish "not found" from "not yours" (avoids leaking
 * existence across organizations).
 */
export async function getConnectionForOrg(
  id: string,
  organizationId: string
): Promise<IntegrationConnectionRow | null> {
  const { rows } = await db.query(
    `SELECT ${SELECT_COLUMNS} FROM public.integration_connections
     WHERE id = $1 AND organization_id = $2`,
    [id, organizationId]
  );
  return rows[0] ?? null;
}

/**
 * The single connection to use for a provider within an organization, when a
 * specific connection id isn't given (e.g. the sole Azure DevOps connection,
 * or the org's GitHub App installation). Used by {@link getAzureDevOpsClient}
 * and similar helpers consumed by other work packages.
 */
export async function getDefaultConnectionForProvider(
  organizationId: string,
  provider: IntegrationProvider
): Promise<IntegrationConnectionRow | null> {
  const { rows } = await db.query(
    `SELECT ${SELECT_COLUMNS} FROM public.integration_connections
     WHERE organization_id = $1 AND provider = $2
     ORDER BY created_at ASC
     LIMIT 1`,
    [organizationId, provider]
  );
  return rows[0] ?? null;
}

export interface CreateConnectionInput {
  organizationId: string;
  provider: IntegrationProvider;
  authType: IntegrationAuthType;
  displayName: string;
  secretRef: string | null;
  scope: Record<string, unknown>;
}

export async function createConnection(input: CreateConnectionInput): Promise<IntegrationConnectionRow> {
  const { rows } = await db.query(
    `INSERT INTO public.integration_connections
       (organization_id, provider, auth_type, display_name, secret_ref, scope, status)
     VALUES ($1, $2, $3, $4, $5, $6, 'untested')
     RETURNING ${SELECT_COLUMNS}`,
    [
      input.organizationId,
      input.provider,
      input.authType,
      input.displayName,
      input.secretRef,
      JSON.stringify(input.scope ?? {}),
    ]
  );
  return rows[0];
}

export async function updateConnectionTestResult(
  id: string,
  status: IntegrationStatus
): Promise<IntegrationConnectionRow> {
  const { rows } = await db.query(
    `UPDATE public.integration_connections
     SET status = $2, last_tested_at = now(), updated_at = now()
     WHERE id = $1
     RETURNING ${SELECT_COLUMNS}`,
    [id, status]
  );
  return rows[0];
}

/** Whether any application_repositories row still references this connection. */
export async function isConnectionInUse(id: string): Promise<boolean> {
  const { rows } = await db.query(
    `SELECT 1 FROM public.application_repositories WHERE connection_id = $1 LIMIT 1`,
    [id]
  );
  if (rows.length > 0) return true;

  // onboarding_runs may not exist in every environment yet (WP-BE5, migration
  // 015). Guard the lookup so this repository doesn't hard-depend on it.
  const { rows: tableRows } = await db.query(
    `SELECT to_regclass('public.onboarding_runs') IS NOT NULL AS exists`
  );
  if (!tableRows[0]?.exists) return false;

  const { rows: onboardingRows } = await db.query(
    `SELECT 1 FROM public.onboarding_runs WHERE connection_id = $1 LIMIT 1`,
    [id]
  );
  return onboardingRows.length > 0;
}

export async function deleteConnection(id: string): Promise<void> {
  await db.query(`DELETE FROM public.integration_connections WHERE id = $1`, [id]);
}
