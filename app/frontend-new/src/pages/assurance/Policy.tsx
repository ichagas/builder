import { useTranslation } from "react-i18next";
import { PageHeader } from "@/components/shell/PageHeader";
import { EmptyState } from "@/components/shell/atoms";
import { useAdmin } from "@/contexts/AdminContext";
import { useUrlState } from "@/lib/state/useUrlState";
import { useTeamsAll, useTeamsMine, useTeamPortfolio, type MeshPolicyScope } from "@/features/assurance/api";
import { PolicyEditor } from "@/features/assurance/governance/PolicyEditor";
import { ExceptionsPanel } from "@/features/assurance/governance/ExceptionsPanel";
import { cn } from "@/lib/utils";

type Tab = "policy" | "exceptions";
type Scope = Extract<MeshPolicyScope, "organization" | "team" | "application">;

/**
 * Policy (T133, WP-A4, NA-06): the mesh policy per check (issue, notify,
 * block, off) at organization, team or application scope, and the
 * exceptions granted per application. Organization admins set any mode
 * (organization scope is admin-only on the backend); team owners may only
 * tighten (FR-012) so looser options are disabled, and members read.
 * Hooks are the A6 `useMeshPolicy`/`useSetMeshPolicy`.
 * Tab, scope, team and application are held in the URL.
 */
export function Policy() {
  const { t } = useTranslation();
  const { isAdmin } = useAdmin();
  const { data: mine = [] } = useTeamsMine();
  const { data: allTeams } = useTeamsAll(isAdmin);
  const teams = isAdmin && allTeams ? allTeams : mine;
  const [tabRaw, setTab] = useUrlState("tab", "policy");
  const tab: Tab = tabRaw === "exceptions" ? "exceptions" : "policy";
  const [scopeRaw, setScope] = useUrlState("scope", "");
  const scope: Scope =
    scopeRaw === "organization" && isAdmin ? "organization" : scopeRaw === "application" ? "application" : scopeRaw === "team" ? "team" : isAdmin ? "organization" : "team";
  const [teamParam, setTeam] = useUrlState("team", "");
  const teamId = teams.some((tm) => tm.id === teamParam) ? teamParam : (teams[0]?.id ?? "");
  const [appParam, setApp] = useUrlState("app", "");
  const { data: portfolio } = useTeamPortfolio(teamId || undefined);
  const applications = portfolio?.applications ?? [];
  const appId = applications.some((a) => a.id === appParam) ? appParam : (applications[0]?.id ?? "");

  const orgId = allTeams?.[0]?.organization_id ?? mine[0]?.organization_id;
  const isOwner = isAdmin || mine.some((tm) => tm.id === teamId && tm.role === "owner");
  const scopeId = scope === "organization" ? orgId : scope === "team" ? teamId : appId;

  const scopes: Scope[] = isAdmin ? ["organization", "team", "application"] : ["team", "application"];

  return (
    <div className="flex flex-col gap-4 p-4">
      <PageHeader crumb={t("assurance.governance.crumb")} title={t("assurance.governance.policy.title")} />

      <div role="tablist" aria-label={t("assurance.governance.tabsAria")} className="flex gap-1.5">
        {(["policy", "exceptions"] as const).map((id) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={cn(
              "flex h-11 items-center rounded-full border px-4 text-sm font-medium sm:h-9",
              tab === id ? "border-primary bg-primary-soft text-primary" : "border-line bg-surface text-muted-foreground",
            )}
          >
            {t(`assurance.governance.tabs.${id}`)}
          </button>
        ))}
      </div>

      {teams.length === 0 && !orgId ? (
        <EmptyState title={t("assurance.governance.noTeams.title")} description={t("assurance.governance.noTeams.description")} />
      ) : tab === "policy" ? (
        <section className="rounded-xs border border-line bg-surface" data-testid="governance-policy">
          <div className="flex flex-wrap items-end gap-3 border-b border-line px-pad py-3">
            <div className="grid flex-1 gap-1">
              <h2 className="text-sm font-semibold text-ink">{t("assurance.governance.policy.heading")}</h2>
              <span className="text-xs text-muted-foreground">
                {isAdmin ? t("assurance.governance.policy.adminHint") : t("assurance.governance.policy.ownerHint")}
              </span>
            </div>
            <label className="grid gap-1 text-xs font-medium text-muted-foreground">
              {t("assurance.governance.policy.scope")}
              <select
                value={scope}
                onChange={(e) => setScope(e.target.value)}
                className="h-11 rounded-xs border border-line bg-surface px-2 text-sm text-ink sm:h-9"
              >
                {scopes.map((s) => (
                  <option key={s} value={s}>
                    {t(`assurance.governance.policy.scopes.${s}`)}
                  </option>
                ))}
              </select>
            </label>
            {scope !== "organization" ? (
              <label className="grid gap-1 text-xs font-medium text-muted-foreground">
                {t("assurance.governance.policy.team")}
                <select
                  value={teamId}
                  onChange={(e) => setTeam(e.target.value)}
                  className="h-11 rounded-xs border border-line bg-surface px-2 text-sm text-ink sm:h-9"
                >
                  {teams.map((tm) => (
                    <option key={tm.id} value={tm.id}>
                      {tm.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            {scope === "application" ? (
              <label className="grid gap-1 text-xs font-medium text-muted-foreground">
                {t("assurance.governance.policy.application")}
                <select
                  value={appId}
                  onChange={(e) => setApp(e.target.value)}
                  className="h-11 rounded-xs border border-line bg-surface px-2 text-sm text-ink sm:h-9"
                >
                  {applications.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
          </div>
          {scopeId ? (
            <PolicyEditor key={`${scope}:${scopeId}`} scope={scope} scopeId={scopeId} isOrgAdmin={isAdmin} canWrite={isOwner} />
          ) : (
            <EmptyState size="small" title={t("assurance.governance.policy.noScope")} />
          )}
        </section>
      ) : (
        <section className="rounded-xs border border-line bg-surface" data-testid="governance-exceptions">
          <div className="border-b border-line px-pad py-3">
            <h2 className="text-sm font-semibold text-ink">{t("assurance.governance.exceptions.heading")}</h2>
            <p className="text-xs text-muted-foreground">{t("assurance.governance.exceptions.hint")}</p>
            {teams.length > 1 ? (
              <label className="mt-2 grid max-w-xs gap-1 text-xs font-medium text-muted-foreground">
                {t("assurance.governance.policy.team")}
                <select
                  value={teamId}
                  onChange={(e) => setTeam(e.target.value)}
                  className="h-11 rounded-xs border border-line bg-surface px-2 text-sm text-ink sm:h-9"
                >
                  {teams.map((tm) => (
                    <option key={tm.id} value={tm.id}>
                      {tm.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
          </div>
          <ExceptionsPanel teamId={teamId} applicationId={appId} onApplicationChange={setApp} />
        </section>
      )}
    </div>
  );
}

export default Policy;
