import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import type { TeamOverviewRow } from "../teams.api";

/**
 * AllTeamsTable (T134, WP-A5, NA-07). One row per team in the organization:
 * members, applications, repositories, repositories on the latest Standards
 * pack and "not reporting" repositories, following the prototype's
 * `allTeamsView()` (docs/design/frontend-redesign/option-a-styles/shared/
 * onboard-b.js). Column headers that sort are buttons with `aria-sort`.
 */
export type TeamSortKey = "name" | "repos" | "notReporting";

export interface AllTeamsTableProps {
  rows: TeamOverviewRow[];
  latestPack: string | null;
  sort: TeamSortKey;
  onSort: (key: TeamSortKey) => void;
}

function SortHeader({
  label,
  sortKey,
  sort,
  onSort,
  align = "left",
}: {
  label: string;
  sortKey: TeamSortKey;
  sort: TeamSortKey;
  onSort: (k: TeamSortKey) => void;
  align?: "left" | "right";
}) {
  const active = sort === sortKey;
  return (
    <th scope="col" aria-sort={active ? (sortKey === "name" ? "ascending" : "descending") : "none"} className={cn("px-pad py-1.5", align === "right" && "text-right")}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={cn("min-h-[44px] text-xs font-semibold uppercase tracking-wide md:min-h-0", active ? "text-ink" : "text-muted-foreground")}
      >
        {label}
      </button>
    </th>
  );
}

export function AllTeamsTable({ rows, latestPack, sort, onSort }: AllTeamsTableProps) {
  const { t } = useTranslation();
  const dash = "–";
  return (
    <div
      role="region"
      tabIndex={0}
      aria-label={t("assurance.teams.table.ariaLabel")}
      className="overflow-x-auto rounded-xs border border-line bg-surface"
    >
      <table className="w-full min-w-[560px] text-sm" data-testid="assurance-all-teams-table">
        <thead>
          <tr className="border-b border-line">
            <SortHeader label={t("assurance.teams.table.team")} sortKey="name" sort={sort} onSort={onSort} />
            <th scope="col" className="px-pad py-1.5 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t("assurance.teams.table.members")}
            </th>
            <th scope="col" className="px-pad py-1.5 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t("assurance.teams.table.apps")}
            </th>
            <SortHeader label={t("assurance.teams.table.repos")} sortKey="repos" sort={sort} onSort={onSort} align="right" />
            <th scope="col" className="px-pad py-1.5 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {latestPack ? t("assurance.teams.table.onLatest", { pack: latestPack }) : t("assurance.teams.table.onLatestNone")}
            </th>
            <SortHeader label={t("assurance.teams.table.notReporting")} sortKey="notReporting" sort={sort} onSort={onSort} align="right" />
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((row) => {
            const behind = row.repositories !== null && row.onLatest !== null && row.onLatest < row.repositories;
            return (
              <tr key={row.team.id} data-testid="assurance-team-row">
                <th scope="row" className="px-pad py-2 text-left font-semibold">
                  <Link to={`/assurance/t/${row.team.id}`} className="inline-flex min-h-[44px] items-center text-primary hover:underline md:min-h-0">
                    {row.team.name}
                  </Link>
                </th>
                <td className="px-pad py-2 text-right tabular-nums">{row.team.member_count}</td>
                <td className="px-pad py-2 text-right tabular-nums">{row.team.application_count}</td>
                <td className="px-pad py-2 text-right tabular-nums">{row.repositories ?? dash}</td>
                <td className={cn("px-pad py-2 text-right tabular-nums", behind && "font-semibold text-warn")}>
                  {row.repositories === null || row.onLatest === null ? dash : `${row.onLatest}/${row.repositories}`}
                </td>
                <td className="px-pad py-2 text-right tabular-nums">
                  {row.notReporting === null ? (
                    dash
                  ) : row.notReporting > 0 ? (
                    <span className="rounded-full bg-warn-soft px-2 py-0.5 text-xs font-semibold text-warn">{row.notReporting}</span>
                  ) : (
                    0
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default AllTeamsTable;
