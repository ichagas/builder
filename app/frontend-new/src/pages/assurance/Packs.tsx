import { useTranslation } from "react-i18next";
import { PageHeader } from "@/components/shell/PageHeader";
import { EmptyState } from "@/components/shell/atoms";
import { useUrlState } from "@/lib/state/useUrlState";
import { useTeamsMine, useTeamPortfolio } from "@/features/assurance/api";
import { usePacks } from "@/features/assurance/governance.api";
import { PackCard } from "@/features/assurance/governance/PackCard";

/**
 * Packs (T133, WP-A4, NA-06): the published Standards packs, newest first
 * (GET /packs), with how many of the selected team's repositories are pinned
 * to each (from the team portfolio; there is no organization-wide adoption
 * endpoint). Read-only: packs are published from `goa-standards/assurance-mesh`.
 */
export function Packs() {
  const { t } = useTranslation();
  const { data: teams = [] } = useTeamsMine();
  const [teamParam, setTeam] = useUrlState("team", "");
  const teamId = teams.some((tm) => tm.id === teamParam) ? teamParam : (teams[0]?.id ?? "");
  const { data: portfolio } = useTeamPortfolio(teamId || undefined);
  const { data: packs, isLoading, isError } = usePacks();

  const counts = new Map<string, number>();
  for (const app of portfolio?.applications ?? []) {
    for (const repo of app.repositories) {
      if (repo.pinned_pack) counts.set(repo.pinned_pack, (counts.get(repo.pinned_pack) ?? 0) + 1);
    }
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <PageHeader crumb={t("assurance.governance.crumb")} title={t("assurance.governance.packs.title")} />
      <p className="text-sm text-muted-foreground">{t("assurance.governance.packs.intro")}</p>

      {teams.length > 1 ? (
        <label className="grid max-w-xs gap-1 text-xs font-medium text-muted-foreground">
          {t("assurance.governance.packs.team")}
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

      {isLoading ? (
        <div role="status" className="p-9 text-center text-muted-foreground">
          {t("assurance.governance.packs.loading")}
        </div>
      ) : isError || !packs ? (
        <EmptyState title={t("assurance.governance.packs.error.title")} description={t("assurance.governance.packs.error.description")} />
      ) : packs.length === 0 ? (
        <EmptyState title={t("assurance.governance.packs.empty.title")} description={t("assurance.governance.packs.empty.description")} />
      ) : (
        packs.map((pack, i) => (
          <PackCard key={pack.version} pack={pack} latest={i === 0} repoCount={teamId ? (counts.get(pack.version) ?? 0) : null} />
        ))
      )}
    </div>
  );
}

export default Packs;
