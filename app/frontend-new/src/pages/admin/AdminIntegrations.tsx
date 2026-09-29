import * as React from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { PageHeader } from "@/components/shell/PageHeader";
import { EmptyState } from "@/components/shell/atoms";
import { ActionButton } from "@/components/shell/ActionButton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAdmin } from "@/contexts/AdminContext";
import { useUrlState } from "@/lib/state/useUrlState";
import {
  useAdminIntegrations,
  useCreateGitHubAppConnection,
  useUpdateConnection,
  useCreateAzureDevOpsConnection,
  useTestConnection,
  useDeleteConnection,
  githubAppOwners,
  azureDevOpsOrgUrl,
  type GitHubAppStatus,
  type IntegrationConnection,
} from "@/features/integrations/api";
import {
  useTeamsAll,
  useTeamsMine,
  useTeamPortfolio,
  useOrganizationId,
  useMeshPolicy,
  useSetMeshPolicy,
  MESH_AGENTS,
  type MeshAgent,
  type MeshPolicyMode,
  type OrgTeamSummary,
  type TeamSummary,
} from "@/features/assurance/api";

/**
 * AdminIntegrations (T136, WP-A6, NA-08). Admin -> Integrations
 * (contracts/routes.md `/admin/integrations`, Root layout): platform GitHub
 * App status and this organization's `github_app`/Azure DevOps connections
 * (`app/backend/src/routes/admin/integrations.ts`, BE8), plus the
 * organization-wide mesh policy per check and the per-application Cyber
 * Risk sandbox toggle (`routes/mesh.ts`, BE4, D-15/D-17).
 *
 * Organization admins only (FR-013): the backend enforces this on every
 * request (`requireOrgAdmin`), and this page additionally hides itself
 * behind `useAdmin().isAdmin` -- the same organization-admin proxy
 * `TeamSwitcher`/`useTeamsAll` already use (T130, WP-A1; `user_roles.role =
 * 'admin'` is exactly `services/teams/authorization#isOrgAdmin`) -- so a
 * non-admin sees a no-access state instead of a flash of admin-only forms
 * before a 403 comes back. The route itself isn't linked from anywhere yet
 * (RootLayout has no rail); reaching it requires the URL, same as
 * /settings/organization.
 *
 * SECURITY: no secret value (a PAT) is ever requested from or displayed by
 * this page -- see `features/integrations/api.ts`'s doc comment. `hasSecret`
 * is the only signal shown for an Azure DevOps connection's credential.
 */
export function AdminIntegrations() {
  const { t } = useTranslation();
  const { isAdmin, loading: adminLoading } = useAdmin();

  const { data, isLoading, isError } = useAdminIntegrations(isAdmin);

  if (adminLoading) {
    return (
      <div className="flex flex-col gap-4 p-4">
        <PageHeader title={t("integrations.title")} />
        <div role="status" className="p-9 text-center text-muted-foreground">
          {t("integrations.loading")}
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="flex flex-col gap-4 p-4">
        <PageHeader title={t("integrations.title")} />
        <EmptyState title={t("integrations.noAccess.title")} description={t("integrations.noAccess.description")} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <PageHeader title={t("integrations.title")} />

      {isLoading ? (
        <div role="status" className="p-9 text-center text-muted-foreground">
          {t("integrations.loading")}
        </div>
      ) : isError || !data ? (
        <EmptyState title={t("integrations.error.title")} description={t("integrations.error.description")} />
      ) : (
        <>
          <GitHubAppSection status={data.githubApp} connection={data.githubAppConnections[0]} />
          <AzureDevOpsSection connections={data.azureDevOps} />
          <MeshPolicySection />
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared connection bits (status badge, test/remove)
// ---------------------------------------------------------------------------

function formatRelative(iso: string | null): string {
  if (!iso) return "";
  const ms = Date.now() - new Date(iso).getTime();
  const days = Math.floor(ms / (24 * 60 * 60 * 1000));
  if (days <= 0) return "today";
  if (days === 1) return "1 day ago";
  return `${days} days ago`;
}

function StatusBadge({ status }: { status: IntegrationConnection["status"] }) {
  const { t } = useTranslation();
  const variant = status === "ok" ? "default" : status === "failing" ? "destructive" : "secondary";
  return <Badge variant={variant}>{t(`integrations.connection.status.${status}`)}</Badge>;
}

function ConnectionFooter({ connection }: { connection: IntegrationConnection }) {
  const { t } = useTranslation();
  const testConnection = useTestConnection();
  const deleteConnection = useDeleteConnection();

  return (
    <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
      <StatusBadge status={connection.status} />
      <span>{connection.hasSecret ? t("integrations.connection.hasSecret") : t("integrations.connection.noSecret")}</span>
      <span>
        {connection.lastTestedAt
          ? t("integrations.connection.lastTested", { when: formatRelative(connection.lastTestedAt) })
          : t("integrations.connection.neverTested")}
      </span>
      <div className="ml-auto flex items-center gap-2">
        <ActionButton
          label={t("integrations.connection.test")}
          tone="ghost"
          onAction={async () => {
            try {
              const result = await testConnection.mutateAsync(connection.id);
              if (result.status === "ok") {
                toast.success(t("integrations.connection.testSucceeded"));
              } else {
                toast.error(result.testError ?? t("integrations.connection.testFailed"));
              }
            } catch {
              toast.error(t("integrations.connection.testFailed"));
            }
          }}
        />
        <ActionButton
          label={t("integrations.connection.remove")}
          tone="danger"
          confirm={t("integrations.connection.removeConfirm")}
          onAction={async () => {
            try {
              await deleteConnection.mutateAsync(connection.id);
              toast.success(t("integrations.connection.removed"));
            } catch {
              toast.error(t("integrations.connection.removeFailed"));
            }
          }}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// GitHub App
// ---------------------------------------------------------------------------

function GitHubAppSection({
  status,
  connection,
}: {
  status: GitHubAppStatus;
  connection: IntegrationConnection | undefined;
}) {
  const { t } = useTranslation();
  const [displayName, setDisplayName] = React.useState(connection?.displayName ?? "");
  const [ownersText, setOwnersText] = React.useState(connection ? githubAppOwners(connection).join(", ") : "");
  const create = useCreateGitHubAppConnection();
  const update = useUpdateConnection();

  React.useEffect(() => {
    if (connection) {
      setDisplayName(connection.displayName);
      setOwnersText(githubAppOwners(connection).join(", "));
    }
  }, [connection]);

  const owners = ownersText
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);

  const handleSave = async () => {
    try {
      if (connection) {
        await update.mutateAsync({ id: connection.id, displayName, owners });
      } else {
        await create.mutateAsync({ displayName, owners });
      }
      toast.success(t("integrations.githubApp.saved"));
    } catch {
      toast.error(t("integrations.githubApp.saveFailed"));
      throw new Error("save failed");
    }
  };

  return (
    <section className="rounded-xs border border-line bg-surface p-4" data-testid="integrations-github-app">
      <h2 className="text-sm font-semibold text-ink">{t("integrations.githubApp.heading")}</h2>

      <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted-foreground">{t("integrations.githubApp.platformStatus")}:</span>
        <Badge variant={status.configured ? "default" : "secondary"}>
          {status.configured ? t("integrations.githubApp.configured") : t("integrations.githubApp.notConfigured")}
        </Badge>
        {status.configured && status.accountLogin ? (
          <span className="text-muted-foreground">{t("integrations.githubApp.account", { account: status.accountLogin })}</span>
        ) : null}
      </div>

      <div className="mt-4 border-t border-line pt-4">
        <h3 className="text-sm font-semibold text-ink">{t("integrations.githubApp.connectionHeading")}</h3>
        <p className="mt-1 text-xs text-muted-foreground">{t("integrations.githubApp.connectionDescription")}</p>

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="gh-display-name">{t("integrations.githubApp.displayNameLabel")}</Label>
            <Input
              id="gh-display-name"
              value={displayName}
              placeholder={t("integrations.githubApp.displayNamePlaceholder")}
              onChange={(e) => setDisplayName(e.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="gh-owners">{t("integrations.githubApp.ownersLabel")}</Label>
            <Input
              id="gh-owners"
              value={ownersText}
              placeholder={t("integrations.githubApp.ownersPlaceholder")}
              onChange={(e) => setOwnersText(e.target.value)}
            />
          </div>
        </div>

        <div className="mt-3">
          <Button
            type="button"
            disabled={!displayName.trim() || owners.length === 0 || create.isPending || update.isPending}
            onClick={() => void handleSave()}
          >
            {t("integrations.githubApp.save")}
          </Button>
        </div>

        {connection ? (
          <ConnectionFooter connection={connection} />
        ) : (
          <p className="mt-3 text-xs text-muted-foreground">{t("integrations.githubApp.empty")}</p>
        )}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Azure DevOps
// ---------------------------------------------------------------------------

function AzureDevOpsConnectionCard({ connection }: { connection: IntegrationConnection }) {
  return (
    <div className="rounded-xs border border-line-2 p-3" data-testid="integrations-azure-connection">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-semibold text-ink">{connection.displayName}</span>
        <span className="text-xs text-muted-foreground">{azureDevOpsOrgUrl(connection)}</span>
      </div>
      <ConnectionFooter connection={connection} />
    </div>
  );
}

function AzureDevOpsSection({ connections }: { connections: IntegrationConnection[] }) {
  const { t } = useTranslation();
  const [displayName, setDisplayName] = React.useState("");
  const [organizationUrl, setOrganizationUrl] = React.useState("");
  const [authType, setAuthType] = React.useState<"service_connection" | "pat">("service_connection");
  const [serviceConnectionId, setServiceConnectionId] = React.useState("");
  const [patValue, setPatValue] = React.useState("");
  const [projectsText, setProjectsText] = React.useState("");
  const create = useCreateAzureDevOpsConnection();

  const canSubmit =
    displayName.trim() &&
    organizationUrl.trim() &&
    (authType === "service_connection" ? serviceConnectionId.trim() : patValue.trim());

  const handleAdd = async () => {
    const projects = projectsText
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean);
    try {
      await create.mutateAsync({
        displayName,
        organizationUrl,
        authType,
        projects,
        serviceConnectionId: authType === "service_connection" ? serviceConnectionId : undefined,
        patValue: authType === "pat" ? patValue : undefined,
      });
      toast.success(t("integrations.azureDevOps.added"));
      setDisplayName("");
      setOrganizationUrl("");
      setServiceConnectionId("");
      // Never keep a submitted PAT in state -- it's write-only (BE8).
      setPatValue("");
      setProjectsText("");
    } catch {
      toast.error(t("integrations.azureDevOps.addFailed"));
    }
  };

  return (
    <section className="rounded-xs border border-line bg-surface p-4" data-testid="integrations-azure-devops">
      <h2 className="text-sm font-semibold text-ink">{t("integrations.azureDevOps.heading")}</h2>
      <p className="mt-1 text-xs text-muted-foreground">{t("integrations.azureDevOps.description")}</p>

      <div className="mt-3 flex flex-col gap-2">
        {connections.length === 0 ? (
          <p className="text-xs text-muted-foreground">{t("integrations.azureDevOps.empty")}</p>
        ) : (
          connections.map((c) => <AzureDevOpsConnectionCard key={c.id} connection={c} />)
        )}
      </div>

      <div className="mt-4 border-t border-line pt-4">
        <h3 className="text-sm font-semibold text-ink">{t("integrations.azureDevOps.addHeading")}</h3>

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="ado-display-name">{t("integrations.azureDevOps.displayNameLabel")}</Label>
            <Input
              id="ado-display-name"
              value={displayName}
              placeholder={t("integrations.azureDevOps.displayNamePlaceholder")}
              onChange={(e) => setDisplayName(e.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="ado-org-url">{t("integrations.azureDevOps.orgUrlLabel")}</Label>
            <Input
              id="ado-org-url"
              value={organizationUrl}
              placeholder={t("integrations.azureDevOps.orgUrlPlaceholder")}
              onChange={(e) => setOrganizationUrl(e.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="ado-auth-type">{t("integrations.azureDevOps.authTypeLabel")}</Label>
            <Select value={authType} onValueChange={(v) => setAuthType(v as "service_connection" | "pat")}>
              <SelectTrigger id="ado-auth-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="service_connection">{t("integrations.azureDevOps.authType.service_connection")}</SelectItem>
                <SelectItem value="pat">{t("integrations.azureDevOps.authType.pat")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {authType === "service_connection" ? (
            <div className="grid gap-1.5">
              <Label htmlFor="ado-service-connection-id">{t("integrations.azureDevOps.serviceConnectionIdLabel")}</Label>
              <Input
                id="ado-service-connection-id"
                value={serviceConnectionId}
                onChange={(e) => setServiceConnectionId(e.target.value)}
              />
            </div>
          ) : (
            <div className="grid gap-1.5">
              <Label htmlFor="ado-pat">{t("integrations.azureDevOps.patLabel")}</Label>
              <Input id="ado-pat" type="password" autoComplete="off" value={patValue} onChange={(e) => setPatValue(e.target.value)} />
              <span className="text-xs text-muted-foreground">{t("integrations.azureDevOps.patHint")}</span>
            </div>
          )}
          <div className="grid gap-1.5 sm:col-span-2">
            <Label htmlFor="ado-projects">{t("integrations.azureDevOps.projectsLabel")}</Label>
            <Input
              id="ado-projects"
              value={projectsText}
              placeholder={t("integrations.azureDevOps.projectsPlaceholder")}
              onChange={(e) => setProjectsText(e.target.value)}
            />
          </div>
        </div>

        <div className="mt-3">
          <Button type="button" disabled={!canSubmit || create.isPending} onClick={() => void handleAdd()}>
            {t("integrations.azureDevOps.add")}
          </Button>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Mesh policy (organization scope) + Cyber Risk sandbox (application scope)
// ---------------------------------------------------------------------------

const MODE_ORDER: MeshPolicyMode[] = ["off", "notify", "issue", "block"];

function MeshPolicySection() {
  const { t } = useTranslation();
  const { isAdmin } = useAdmin();
  const { data: mine } = useTeamsMine();
  const { data: allTeams } = useTeamsAll(isAdmin);
  const orgId = useOrganizationId(isAdmin);

  const { data: policy, isLoading } = useMeshPolicy("organization", orgId);
  const setPolicy = useSetMeshPolicy();

  const handleModeChange = async (agent: MeshAgent, mode: MeshPolicyMode) => {
    if (!orgId) return;
    try {
      await setPolicy.mutateAsync({ scope: "organization", scopeId: orgId, agent, mode });
      toast.success(t("integrations.meshPolicy.saved"));
    } catch {
      toast.error(t("integrations.meshPolicy.saveFailed"));
    }
  };

  return (
    <section className="rounded-xs border border-line bg-surface p-4" data-testid="integrations-mesh-policy">
      <h2 className="text-sm font-semibold text-ink">{t("integrations.meshPolicy.heading")}</h2>
      <p className="mt-1 text-xs text-muted-foreground">{t("integrations.meshPolicy.description")}</p>

      {!orgId || isLoading ? (
        <div role="status" className="p-4 text-center text-xs text-muted-foreground">
          {t("integrations.meshPolicy.loading")}
        </div>
      ) : (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {MESH_AGENTS.map((agent) => (
            <div key={agent} className="grid gap-1.5">
              <Label htmlFor={`mesh-policy-${agent}`}>{t(`integrations.meshPolicy.checks.${agent}`)}</Label>
              <Select
                value={policy?.effective[agent] ?? "issue"}
                onValueChange={(mode) => void handleModeChange(agent, mode as MeshPolicyMode)}
              >
                <SelectTrigger id={`mesh-policy-${agent}`} data-testid={`mesh-policy-select-${agent}`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MODE_ORDER.map((mode) => (
                    <SelectItem key={mode} value={mode}>
                      {t(`integrations.meshPolicy.mode.${mode}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ))}
        </div>
      )}

      <div className="mt-4 border-t border-line pt-4">
        <CyberRiskSandbox orgAdminTeams={allTeams} mine={mine} />
      </div>
    </section>
  );
}

function CyberRiskSandbox({
  orgAdminTeams,
  mine,
}: {
  orgAdminTeams: OrgTeamSummary[] | undefined;
  mine: TeamSummary[] | undefined;
}) {
  const { t } = useTranslation();
  const [teamId, setTeamId] = useUrlState("sbTeam", "");
  const [appId, setAppId] = useUrlState("sbApp", "");
  const teams = orgAdminTeams ?? mine ?? [];

  const { data: portfolio } = useTeamPortfolio(teamId || undefined);
  const applications = portfolio?.applications ?? [];
  const app = applications.find((a) => a.id === appId);

  const { data: appPolicy } = useMeshPolicy("application", appId || undefined);
  const setPolicy = useSetMeshPolicy();

  const handleToggle = async (checked: boolean) => {
    if (!appId) return;
    try {
      await setPolicy.mutateAsync({ scope: "application", scopeId: appId, cyberRiskSandbox: checked });
      toast.success(t("integrations.meshPolicy.sandbox.saved"));
    } catch {
      toast.error(t("integrations.meshPolicy.sandbox.saveFailed"));
    }
  };

  return (
    <div data-testid="integrations-cyber-risk-sandbox">
      <h3 className="text-sm font-semibold text-ink">{t("integrations.meshPolicy.sandbox.heading")}</h3>
      <p className="mt-1 text-xs text-muted-foreground">{t("integrations.meshPolicy.sandbox.description")}</p>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="sandbox-team">{t("integrations.meshPolicy.sandbox.teamLabel")}</Label>
          <Select
            value={teamId}
            onValueChange={(v) => {
              setTeamId(v);
              setAppId("");
            }}
          >
            <SelectTrigger id="sandbox-team">
              <SelectValue placeholder={t("integrations.meshPolicy.sandbox.teamPlaceholder")} />
            </SelectTrigger>
            <SelectContent>
              {teams.map((tm) => (
                <SelectItem key={tm.id} value={tm.id}>
                  {tm.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="sandbox-app">{t("integrations.meshPolicy.sandbox.appLabel")}</Label>
          <Select value={appId} onValueChange={setAppId}>
            <SelectTrigger id="sandbox-app" disabled={!teamId}>
              <SelectValue placeholder={t("integrations.meshPolicy.sandbox.appPlaceholder")} />
            </SelectTrigger>
            <SelectContent>
              {applications.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {app ? (
        <div className="mt-3 flex items-center gap-2.5">
          <Switch
            id="sandbox-toggle"
            checked={appPolicy?.cyberRiskSandbox ?? false}
            onCheckedChange={(checked) => void handleToggle(checked)}
            aria-label={t("integrations.meshPolicy.sandbox.toggleLabel", { app: app.name })}
          />
          <Label htmlFor="sandbox-toggle">{t("integrations.meshPolicy.sandbox.toggleLabel", { app: app.name })}</Label>
        </div>
      ) : null}
    </div>
  );
}

export default AdminIntegrations;
