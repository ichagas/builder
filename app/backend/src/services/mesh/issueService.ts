/**
 * Open a GitHub issue or Azure DevOps work item for a mesh run's new
 * findings (spec 007, WP-BE4, T125; research D-15).
 *
 * Called two ways:
 *  - Automatically from `routes/mesh.ts` on ingest, when the effective
 *    policy for an agent with new findings is `issue` (the default mode).
 *  - Manually via `POST /mesh/runs/:runId/issue` (evidence page "file an
 *    issue" action, or a retry after a transient provider failure).
 *
 * Both paths call {@link openIssueForNewFindings}, which is idempotent per
 * run: `mesh_runs.issue_opened_at` (migration 017) is checked first, so a
 * run never gets two issues.
 *
 * Azure DevOps: the actual connection (service connection or PAT, endpoint
 * URL, project) is configured on the Admin -> Integrations page being built
 * in parallel by WP-BE8 (`integration_connections`, migration 016). Rather
 * than reach into that work in progress, this module takes a small injected
 * `AzureDevOpsClientProvider` interface. The default implementation is a
 * stub that throws a clear "not yet wired up" error; tests inject a mock.
 *
 * TODO(WP-BE8): once `services/integrations/**` exists, replace
 * `getDefaultAzureDevOpsClientProvider()` with one that resolves the
 * organization's `integration_connections` row (provider = 'azure_devops')
 * and authenticates with its configured service connection or PAT.
 */
import { logger } from "../../utils/logger";
import db from "../../utils/database";
import { getInstallationToken, isGitHubAppConfigured } from "../../utils/githubAppAuth";
import { MeshFinding } from "./ingest";

export interface OpenIssueResult {
  /** Whether a new issue/work item was opened by this call (false = already existed, or provider unavailable). */
  created: boolean;
  issueRef: string | null;
  message?: string;
}

/** One finding formatted for an issue body, independent of provider. */
interface FindingsByAgent {
  agent: string;
  findings: MeshFinding[];
}

// ---------------------------------------------------------------------------
// Azure DevOps client injection point (WP-BE8 wires the real one)
// ---------------------------------------------------------------------------

export interface AzureDevOpsWorkItem {
  id: number;
  url: string;
}

/** Minimal surface this service needs from an Azure DevOps connection. */
export interface AzureDevOpsClient {
  createWorkItem(input: { project: string; title: string; description: string }): Promise<AzureDevOpsWorkItem>;
}

/** Resolves the Azure DevOps client to use for a given organization. */
export interface AzureDevOpsClientProvider {
  getClient(organizationId: string): Promise<AzureDevOpsClient | null>;
}

class UnconfiguredAzureDevOpsClientProvider implements AzureDevOpsClientProvider {
  async getClient(): Promise<AzureDevOpsClient | null> {
    logger.warn(
      "[mesh-issue-service] Azure DevOps connection not wired up yet (TODO: WP-BE8 integration_connections / services/integrations). " +
        "Falling back to no-op — the run's new findings will not get a work item.",
    );
    return null;
  }
}

let azureDevOpsClientProvider: AzureDevOpsClientProvider = new UnconfiguredAzureDevOpsClientProvider();

/** Test/DI hook: inject a mock (or WP-BE8's real) Azure DevOps client provider. */
export function setAzureDevOpsClientProvider(provider: AzureDevOpsClientProvider): void {
  azureDevOpsClientProvider = provider;
}

/** Test-only: restore the default (unconfigured) provider. */
export function resetAzureDevOpsClientProviderForTests(): void {
  azureDevOpsClientProvider = new UnconfiguredAzureDevOpsClientProvider();
}

// ---------------------------------------------------------------------------
// GitHub issue creation (GitHub App installation token)
// ---------------------------------------------------------------------------

async function createGitHubIssue(fullName: string, title: string, body: string): Promise<{ number: number; htmlUrl: string } | null> {
  if (!isGitHubAppConfigured()) {
    logger.warn("[mesh-issue-service] GitHub App not configured; skipping issue creation");
    return null;
  }
  const token = await getInstallationToken();
  const res = await fetch(`https://api.github.com/repos/${fullName}/issues`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ title, body }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GitHub issue creation failed: ${res.status} ${text}`);
  }
  const data = (await res.json()) as { number: number; html_url: string };
  return { number: data.number, htmlUrl: data.html_url };
}

// ---------------------------------------------------------------------------
// Shared formatting
// ---------------------------------------------------------------------------

function groupByAgent(findings: MeshFinding[]): FindingsByAgent[] {
  const map = new Map<string, MeshFinding[]>();
  for (const finding of findings) {
    const list = map.get(finding.agent) || [];
    list.push(finding);
    map.set(finding.agent, list);
  }
  return [...map.entries()].map(([agent, list]) => ({ agent, findings: list }));
}

/**
 * Findings come from the CI report body — untrusted input as far as this
 * service is concerned (a compromised repository secret, or a bug on the CI
 * side, could put anything in `rule`/`file`/`location`/`message`). Escape
 * Markdown control characters and backticks before they go into an issue
 * body, so a finding can't break out of its list item, inject a fake
 * heading, or fence-escape a code block.
 */
export function escapeMarkdown(value: string): string {
  return value.replace(/[\\`*_{}[\]()#+.!|>~-]/g, (ch) => `\\${ch}`);
}

function formatIssueBody(runId: string, packVersion: string, reportUrl: string, groups: FindingsByAgent[]): string {
  const lines: string[] = [
    `The Assurance Mesh found new findings on run \`${runId}\` (pack ${packVersion}).`,
    "",
    `Full evidence: ${reportUrl}`,
    "",
  ];
  for (const group of groups) {
    lines.push(`### ${escapeMarkdown(group.agent)}`, "");
    for (const finding of group.findings) {
      const location = [finding.file, finding.location].filter(Boolean).join(":");
      const rule = escapeMarkdown(finding.rule || "");
      const message = escapeMarkdown(finding.message || "see report");
      lines.push(`- **${rule}**${location ? ` (${escapeMarkdown(location)})` : ""}: ${message}`);
    }
    lines.push("");
  }
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

/**
 * Open an issue (GitHub) or work item (Azure DevOps) covering a run's new
 * findings. Idempotent: if `mesh_runs.issue_opened_at` is already set, this
 * is a no-op that returns the existing reference.
 *
 * This only opens ONE issue per run (covering every agent with new
 * findings), not one per agent — simplest reading consistent with the spec,
 * which describes "open a GitHub issue... for new findings" per run.
 */
export async function openIssueForNewFindings(runId: string): Promise<OpenIssueResult> {
  const { rows } = await db.query(
    `SELECT mr.id, mr.pack_version, mr.report_url, mr.new_findings, mr.issue_ref, mr.issue_opened_at,
            ar.full_name, ar.provider, a.team_id, t.organization_id
     FROM public.mesh_runs mr
     JOIN public.application_repositories ar ON ar.id = mr.repository_id
     JOIN public.applications a ON a.id = ar.application_id
     JOIN public.teams t ON t.id = a.team_id
     WHERE mr.id = $1`,
    [runId],
  );
  const run = rows[0];
  if (!run) {
    return { created: false, issueRef: null, message: "Run not found" };
  }
  if (run.issue_opened_at) {
    return { created: false, issueRef: run.issue_ref, message: "Issue already opened for this run" };
  }
  if (!run.new_findings || run.new_findings === 0) {
    return { created: false, issueRef: null, message: "No new findings on this run" };
  }

  // Findings themselves are not persisted beyond mesh_baselines (only
  // fingerprints); the full finding detail lives in the report blob. This
  // service links out to it rather than re-fetching/parsing that blob here.
  const groups: FindingsByAgent[] = [];
  const title = `Assurance Mesh: ${run.new_findings} new finding${run.new_findings === 1 ? "" : "s"} (${run.full_name})`;
  const body = groups.length
    ? formatIssueBody(runId, run.pack_version, run.report_url, groups)
    : `The Assurance Mesh found ${run.new_findings} new finding(s) on run \`${runId}\`.\n\nFull evidence: ${run.report_url}`;

  let issueRef: string | null = null;
  try {
    if (run.provider === "github") {
      const issue = await createGitHubIssue(run.full_name, title, body);
      if (issue) issueRef = `github:${run.full_name}#${issue.number}`;
    } else if (run.provider === "azure_devops") {
      const client = await azureDevOpsClientProvider.getClient(run.organization_id);
      if (client) {
        const workItem = await client.createWorkItem({ project: run.full_name, title, description: body });
        issueRef = `azure_devops:${run.full_name}#${workItem.id}`;
      }
    }
  } catch (err: any) {
    logger.error(`[mesh-issue-service] Failed to open issue for run ${runId}: ${err?.message}`);
    return { created: false, issueRef: null, message: err?.message || "Issue creation failed" };
  }

  if (!issueRef) {
    return { created: false, issueRef: null, message: "Provider not configured; no issue opened" };
  }

  await db.query(`UPDATE public.mesh_runs SET issue_ref = $1, issue_opened_at = now() WHERE id = $2`, [issueRef, runId]);

  return { created: true, issueRef };
}
