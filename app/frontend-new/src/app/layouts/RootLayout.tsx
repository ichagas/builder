import { AppShell } from "@/components/shell/AppShell";
import { GlobalBar } from "@/components/shell/GlobalBar";
import { StatusCenter } from "@/components/shell/StatusCenter";
import { UndoBar } from "@/components/shell/UndoBar";
import { ShellProvider } from "@/components/shell/ShellContext";
import { usePublishCommandPaletteItems } from "@/components/shell/CommandPaletteItemsContext";
import { useOpenCommandPalette } from "@/app/CommandPaletteOpenContext";
import { LIBRARY_ROUTES } from "@/app/routes/library";
import type { CommandPaletteItem } from "@/components/shell/CommandPalette";

const LIBRARY_PALETTE_ITEMS: CommandPaletteItem[] = LIBRARY_ROUTES.filter((route) => !route.path.includes(":")).map((route) => ({
  id: `library-${route.path}`,
  label: route.title,
  group: "library",
  href: `/library/${route.path}`,
}));

const ROOT_PALETTE_ITEMS: CommandPaletteItem[] = [
  { id: "projects-home", label: "Projects", group: "projects", href: "/projects" },
  ...LIBRARY_PALETTE_ITEMS,
];

/**
 * RootLayout (T033). See contracts/routes.md §1, "Layout: Root": /projects,
 * /library/*, /settings/*, /admin/integrations, and NotFound. No Rail —
 * that's project/assurance-specific — just the GlobalBar chrome.
 */
export function RootLayout() {
  const openPalette = useOpenCommandPalette();
  usePublishCommandPaletteItems(ROOT_PALETTE_ITEMS);

  return (
    <ShellProvider embedded>
      <AppShell
        globalBar={<GlobalBar onSearch={openPalette} statusPill={<StatusCenter />} />}
        undoBar={<UndoBar />}
      />
    </ShellProvider>
  );
}

export default RootLayout;
