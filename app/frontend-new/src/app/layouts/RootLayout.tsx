import { AppShell } from "@/components/shell/AppShell";
import { GlobalBar } from "@/components/shell/GlobalBar";
import { StatusCenter } from "@/components/shell/StatusCenter";
import { UndoBar } from "@/components/shell/UndoBar";
import { usePublishCommandPaletteItems } from "@/components/shell/CommandPaletteItemsContext";
import { useOpenCommandPalette } from "@/app/CommandPaletteOpenContext";
import { useAdmin } from "@/contexts/AdminContext";
import { LIBRARY_ROUTES } from "@/app/routes/library";
import type { CommandPaletteItem } from "@/components/shell/CommandPalette";
import i18n from "@/i18n";

const LIBRARY_PALETTE_ITEMS: CommandPaletteItem[] = LIBRARY_ROUTES.filter((route) => !route.path.includes(":")).map((route) => ({
  id: `library-${route.path}`,
  label: route.title,
  group: "library",
  href: `/library/${route.path}`,
}));

const ROOT_PALETTE_ITEMS: CommandPaletteItem[] = [
  { id: "projects-home", get label() { return i18n.t("shell.nav.projects"); }, group: "projects", href: "/projects" },
  ...LIBRARY_PALETTE_ITEMS,
];

// T136, WP-A6: Admin -> Integrations is org-admin-only (FR-013, NA-08) and
// isn't in any rail (RootLayout has none), so the palette is its only nav
// surface -- gated on `useAdmin().isAdmin` the same way TeamSwitcher gates
// "All teams" (T130), so a non-admin never even sees the entry.
const ADMIN_INTEGRATIONS_PALETTE_ITEM: CommandPaletteItem = {
  id: "admin-integrations",
  get label() { return i18n.t("shell.nav.integrations"); },
  group: "projects",
  href: "/admin/integrations",
};

/**
 * RootLayout (T033). See contracts/routes.md §1, "Layout: Root": /projects,
 * /library/*, /settings/*, /admin/integrations, and NotFound. No Rail —
 * that's project/assurance-specific — just the GlobalBar chrome.
 */
export function RootLayout() {
  const openPalette = useOpenCommandPalette();
  const { isAdmin } = useAdmin();
  usePublishCommandPaletteItems(isAdmin ? [...ROOT_PALETTE_ITEMS, ADMIN_INTEGRATIONS_PALETTE_ITEM] : ROOT_PALETTE_ITEMS);

  return (
    <AppShell
      globalBar={<GlobalBar onSearch={openPalette} statusPill={<StatusCenter />} />}
      undoBar={<UndoBar />}
    />
  );
}

export default RootLayout;
