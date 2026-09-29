import { Outlet, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { AppShell } from "@/components/shell/AppShell";
import { GlobalBar } from "@/components/shell/GlobalBar";
import { Rail } from "@/components/shell/Rail";
import { MobileTabBar } from "@/components/shell/MobileTabBar";
import { StatusCenter } from "@/components/shell/StatusCenter";
import { UndoBar } from "@/components/shell/UndoBar";
import { usePublishCommandPaletteItems } from "@/components/shell/CommandPaletteItemsContext";
import { useOpenCommandPalette } from "@/app/CommandPaletteOpenContext";
import { TeamSwitcher } from "@/components/assurance/TeamSwitcher";
import { useAdmin } from "@/contexts/AdminContext";
import { useTeamsMine } from "@/features/assurance/api";
import { useOnboardingRunTracker } from "@/features/onboarding/useOnboardingRunTracker";
import type { CommandPaletteItem } from "@/components/shell/CommandPalette";
import i18n from "@/i18n";

/**
 * AssuranceLayout (T130, WP-A1). See contracts/routes.md §1 ("Layout:
 * Assurance" for `/assurance/t/:teamId`, `/apps/:appId`, `/onboard/:step`,
 * `/all`, `/packs`, `/policy`) and contracts/design-system.md §2:
 * GlobalBar carries `TeamSwitcher` (the only team control); Rail is
 * "Portfolio, Onboard, Applications list (count + worst status dot),
 * Organization."
 *
 * The Rail and mobile tab bar carry Portfolio and Onboard (team-scoped, so
 * they follow the selected team), Packs and Policy (organization-wide,
 * WP-A4), and Organization for organization admins only (WP-A5). The layout
 * also mounts `useOnboardingRunTracker`, which keeps sandbox long tasks
 * honest after the onboarding wizard is left.
 */
export function AssuranceLayout() {
  const { t } = useTranslation();
  const openPalette = useOpenCommandPalette();
  const { teamId } = useParams<{ teamId?: string }>();
  const { data: teams = [] } = useTeamsMine();
  const { isAdmin } = useAdmin();

  const paletteItems: CommandPaletteItem[] = teams.map((team) => ({
    id: `assurance-team-${team.id}`,
    label: team.name,
    group: "projects" as const,
    href: `/assurance/t/${team.id}`,
    hint: t("assurance.paletteTeamHint"),
  }));
  usePublishCommandPaletteItems(paletteItems);
  useOnboardingRunTracker();

  const portfolioHref = teamId ? `/assurance/t/${teamId}` : teams[0] ? `/assurance/t/${teams[0].id}` : "/assurance";
  const onboardHref = teamId ? `/assurance/t/${teamId}/onboard` : teams[0] ? `/assurance/t/${teams[0].id}/onboard` : "/assurance";

  const railSections = [
    { id: "portfolio", label: t("assurance.rail.portfolio"), href: portfolioHref },
    { id: "onboard", label: t("assurance.rail.onboard"), href: onboardHref },
    { id: "packs", label: t("assurance.rail.packs"), href: "/assurance/packs" },
    { id: "policy", label: t("assurance.rail.policy"), href: "/assurance/policy" },
    // T134 (WP-A5, NA-07): the organization overview is for organization admins only.
    ...(isAdmin ? [{ id: "organization", label: t("assurance.rail.organization"), href: "/assurance/all" }] : []),
  ];

  // Five items must fit 390px: tab bar shows compact labels, accessible name stays the full label.
  const tabItems = railSections.map((section) => ({
    ...section,
    shortLabel: t(`assurance.rail.short.${section.id}`),
  }));

  return (
    <AppShell
      globalBar={
        <GlobalBar
          switcher={<TeamSwitcher />}
          mode={{ kind: "standards", label: t("assurance.mode.label") }}
          onSearch={openPalette}
          statusPill={<StatusCenter />}
        />
      }
      rail={<Rail ariaLabel={t("assurance.rail.ariaLabel")} sections={railSections} />}
      mobileTabBar={<MobileTabBar ariaLabel={t("assurance.rail.ariaLabel")} items={tabItems} />}
      undoBar={<UndoBar />}
    >
      <Outlet />
    </AppShell>
  );
}

export default AssuranceLayout;
