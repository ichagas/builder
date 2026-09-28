import * as React from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ChevronDown, Users } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { useAdmin } from "@/contexts/AdminContext";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useTeamsAll, useTeamsMine, type OrgTeamSummary, type TeamSummary } from "@/features/assurance/api";

/**
 * TeamSwitcher (T130, WP-A1). See contracts/design-system.md §2, GlobalBar:
 * "TeamSwitcher (assurance layout, the only team control)" and NA-01: lists
 * the caller's teams, plus every team in the organization for organization
 * admins (research D-8). Selecting a team navigates to its portfolio
 * (`/assurance/t/:teamId`) — there is no separate team-scoped state to
 * carry, the URL *is* the selection (contracts/design-system.md §3).
 */
export interface TeamSwitcherProps {
  className?: string;
}

function dedupeAllTeams(mine: TeamSummary[], all: OrgTeamSummary[] | undefined): OrgTeamSummary[] {
  if (!all) return [];
  const mineIds = new Set(mine.map((t) => t.id));
  return all.filter((t) => !mineIds.has(t.id));
}

export function TeamSwitcher({ className }: TeamSwitcherProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { teamId } = useParams<{ teamId: string }>();
  const { isAdmin } = useAdmin();

  const { data: mine = [], isLoading: isMineLoading } = useTeamsMine();
  const { data: allTeams } = useTeamsAll(isAdmin);

  const otherTeams = React.useMemo(() => dedupeAllTeams(mine, allTeams), [mine, allTeams]);
  const currentTeam = React.useMemo(
    () => mine.find((tm) => tm.id === teamId) ?? otherTeams.find((tm) => tm.id === teamId),
    [mine, otherTeams, teamId],
  );

  const selectTeam = (id: string) => navigate(`/assurance/t/${id}`);

  const label = currentTeam?.name ?? (isMineLoading ? t("assurance.switcher.loading") : t("assurance.switcher.choose"));

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={t("assurance.switcher.ariaLabel")}
          className={cn(
            "flex h-9 min-w-0 max-w-[220px] items-center gap-1.5 rounded-xs border border-line bg-surface px-2.5 text-sm font-medium text-ink",
            className,
          )}
        >
          <Users aria-hidden="true" className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1 truncate text-left">{label}</span>
          <ChevronDown aria-hidden="true" className="h-4 w-4 shrink-0 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel>{t("assurance.switcher.yourTeams")}</DropdownMenuLabel>
        {mine.length === 0 ? (
          <div className="px-2 py-1.5 text-sm text-muted-foreground">{t("assurance.switcher.noTeams")}</div>
        ) : (
          mine.map((tm) => (
            <DropdownMenuItem key={tm.id} onSelect={() => selectTeam(tm.id)} aria-current={tm.id === teamId || undefined}>
              {tm.name}
            </DropdownMenuItem>
          ))
        )}
        {otherTeams.length > 0 ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>{t("assurance.switcher.allTeams")}</DropdownMenuLabel>
            {otherTeams.map((tm) => (
              <DropdownMenuItem key={tm.id} onSelect={() => selectTeam(tm.id)} aria-current={tm.id === teamId || undefined}>
                <span className="min-w-0 flex-1 truncate">{tm.name}</span>
                <span className="ml-2 shrink-0 text-xs text-muted-foreground">
                  {t("assurance.switcher.appCount", { count: tm.application_count })}
                </span>
              </DropdownMenuItem>
            ))}
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default TeamSwitcher;
