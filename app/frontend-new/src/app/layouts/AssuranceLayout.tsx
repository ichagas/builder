import { Outlet, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { AppShell } from "@/components/shell/AppShell";
import { GlobalBar } from "@/components/shell/GlobalBar";
import { Rail } from "@/components/shell/Rail";
import { MobileTabBar } from "@/components/shell/MobileTabBar";
import { StatusCenter } from "@/components/shell/StatusCenter";
import { UndoBar } from "@/components/shell/UndoBar";
import { ShellProvider } from "@/components/shell/ShellContext";
import { usePublishCommandPaletteItems } from "@/components/shell/CommandPaletteItemsContext";
import { useOpenCommandPalette } from "@/app/CommandPaletteOpenContext";
import { TeamSwitcher } from "@/components/assurance/TeamSwitcher";
import { useTeamsMine } from "@/features/assurance/api";
import type { CommandPaletteItem } from "@/components/shell/CommandPalette";

/**
 * AssuranceLayout (T130, WP-A1). See contracts/routes.md §1 ("Layout:
 * Assurance" for `/assurance/t/:teamId`, `/apps/:appId`, `/onboard/:step`,
 * `/all`, `/packs`, `/policy`) and contracts/design-system.md §2:
 * GlobalBar carries `TeamSwitcher` (the only team control); Rail is
 * "Portfolio, Onboard, Applications list (count + worst status dot),
 * Organization."
 *
 * Only the Portfolio route is wired here (WP-A1's scope, NA-01/NA-02) --
 * Onboard/Applications-list/Organization (Packs, Policy) sections belong to
 * WP-A2..A6/O1 and are left off the Rail rather than linking to routes that
 * don't exist yet (contracts/routes.md's WP-A1..A6/O1..O2 own those in
 * later work packages).
 */
export function AssuranceLayout() {
  const { t } = useTranslation();
  const openPalette = useOpenCommandPalette();
  const { teamId } = useParams<{ teamId?: string }>();
  const { data: teams = [] } = useTeamsMine();

  const paletteItems: CommandPaletteItem[] = teams.map((team) => ({
    id: `assurance-team-${team.id}`,
    label: team.name,
    group: "projects" as const,
    href: `/assurance/t/${team.id}`,
    hint: "Team",
  }));
  usePublishCommandPaletteItems(paletteItems);

  const portfolioHref = teamId ? `/assurance/t/${teamId}` : teams[0] ? `/assurance/t/${teams[0].id}` : "/assurance";

  return (
    <ShellProvider embedded={false}>
      <AppShell
        globalBar={
          <GlobalBar
            switcher={<TeamSwitcher />}
            mode={{ kind: "standards", label: t("assurance.mode.label") }}
            onSearch={openPalette}
            statusPill={<StatusCenter />}
          />
        }
        rail={
          <Rail
            ariaLabel={t("assurance.rail.ariaLabel")}
            sections={[{ id: "portfolio", label: t("assurance.rail.portfolio"), href: portfolioHref }]}
          />
        }
        mobileTabBar={
          <MobileTabBar
            ariaLabel={t("assurance.rail.ariaLabel")}
            items={[{ id: "portfolio", label: t("assurance.rail.portfolio"), href: portfolioHref }]}
          />
        }
        undoBar={<UndoBar />}
      >
        <Outlet />
      </AppShell>
    </ShellProvider>
  );
}

export default AssuranceLayout;
