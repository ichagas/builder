/**
 * Short-lived, repo-scoped clone credentials for the onboarding sandbox
 * (spec 007, epic B3, WP-BE6, T141).
 *
 * The sandbox job clones each selected repository read-only. It never
 * receives a long-lived secret baked into the image — the dispatcher resolves
 * a fresh, narrowly-scoped credential per repository right before dispatch
 * and hands it to the job as an environment variable of that one job
 * execution, exactly like `pullRequests.ts` does for PR opening (which this
 * module deliberately mirrors, minted with read-only scope instead).
 *
 * The credential is returned as an HTTP `Authorization` header **value**,
 * never embedded in a URL: the caller (the job) injects it via
 * `GIT_CONFIG_KEY_*`/`GIT_CONFIG_VALUE_*` environment variables
 * (`infra/onboarding-sandbox/src/clone.ts`), so it never appears in a
 * process's argv (visible to `ps`) or in a URL that a proxy/log line might
 * capture. Callers must never log the returned `authorizationHeader`.
 */
import { getInstallationTokenForRepo } from "../../../utils/githubAppAuth";
import { getConnection } from "../../integrations";
import { getSecretStore } from "../../integrations/secretStore";
import { parseRepositoryFullName, RepositoryProvider } from "../../repositories/fullName";
import { assertRepositoryInOrgScope } from "../repositoryScope";

export interface CloneCredential {
  provider: RepositoryProvider;
  /** Plain HTTPS clone URL — no credential embedded. */
  cloneUrl: string;
  /** `Authorization` header value (e.g. `"Basic <base64>"`). Never log this. */
  authorizationHeader: string;
}

/**
 * Resolves a read-only clone credential for one repository, having already
 * re-checked it's within the organization's configured scope (defense in
 * depth — the same check `openPullRequests`/`setRunRepositories` already ran,
 * repeated here since minting any provider credential is a separate,
 * independently-guarded action, per `repositoryScope.ts`'s docstring).
 *
 * GitHub: a fresh installation access token scoped to this one repository
 * with `contents: read` only (never `write` — the sandbox writes nothing
 * back; PR opening, which does write, mints its own separate token later).
 *
 * Azure Repos: only supported for a `pat`-type connection — Pronghorn holds
 * no credential at all for a `service_connection`-type connection (its
 * credential lives inside Azure DevOps/Pipelines, D-18); such a repository
 * cannot be cloned by the sandbox and the caller should surface a clear
 * per-repository review note instead of failing the whole run (documented
 * gap; see `infra/onboarding-sandbox/README.md`).
 */
export async function resolveCloneCredential(
  organizationId: string,
  connectionId: string | null | undefined,
  fullName: string
): Promise<CloneCredential> {
  await assertRepositoryInOrgScope(organizationId, connectionId, fullName);

  const provider: RepositoryProvider = parseRepositoryFullName(
    fullName.split("/").length === 2 ? "github" : "azure_devops",
    fullName
  ).provider;

  if (provider === "github") {
    const { owner, repo } = parseRepositoryFullName("github", fullName);
    const token = await getInstallationTokenForRepo({ fullName, permissions: { contents: "read" } });
    return {
      provider,
      cloneUrl: `https://github.com/${owner}/${repo}.git`,
      authorizationHeader: `Basic ${Buffer.from(`x-access-token:${token}`).toString("base64")}`,
    };
  }

  const { adoOrg, project, repo } = parseRepositoryFullName("azure_devops", fullName);
  const connection = await getConnection(organizationId, "azure_devops", connectionId ?? undefined);
  if (connection.auth_type !== "pat") {
    throw new Error(
      `Azure DevOps connection "${connection.id}" uses a service connection — Pronghorn holds no credential to clone "${fullName}" with (D-18 gap; see infra/onboarding-sandbox/README.md)`
    );
  }
  if (!connection.secret_ref) {
    throw new Error(`Azure DevOps connection "${connection.id}" has no stored secret`);
  }
  const pat = await getSecretStore().getSecret(connection.secret_ref);
  return {
    provider,
    cloneUrl: `https://dev.azure.com/${encodeURIComponent(adoOrg)}/${encodeURIComponent(project)}/_git/${encodeURIComponent(repo)}`,
    authorizationHeader: `Basic ${Buffer.from(`:${pat}`).toString("base64")}`,
  };
}
