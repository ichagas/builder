import * as React from "react";
import { useLocation, useParams } from "react-router-dom";
import { AppShell } from "@/components/shell/AppShell";
import { GlobalBar } from "@/components/shell/GlobalBar";
import { Rail } from "@/components/shell/Rail";
import { TimelineStrip } from "@/components/shell/TimelineStrip";
import { MobileTabBar } from "@/components/shell/MobileTabBar";
import { StatusCenter } from "@/components/shell/StatusCenter";
import { UndoBar } from "@/components/shell/UndoBar";
import { ShellProvider } from "@/components/shell/ShellContext";
import { usePublishCommandPaletteItems } from "@/components/shell/CommandPaletteItemsContext";
import { useOpenCommandPalette } from "@/app/CommandPaletteOpenContext";
import { PHASE_ORDER, PROJECT_TOOL_ROUTES } from "@/app/routes/project";
import type { RailPhase } from "@/components/shell/types";
import type { CommandPaletteItem } from "@/components/shell/CommandPalette";

/**
 * ProjectLayout (T033). See contracts/routes.md §1, "Layout: Project":
 * `/p/:projectId/v/current/<phase>/<tool>` and `/p/:projectId/settings`.
 *
 * Per D-7 there is a single "Building" version until B1 ships the versions
 * feature (T110+), so the Rail/TimelineStrip here show one building node
 * and phase state is just "active" (matches the current URL) vs "todo" —
 * done/skipped only become meaningful once versions carry real change
 * tracking.
 */
export function ProjectLayout() {
  const { projectId = "" } = useParams<{ projectId: string }>();
  const location = useLocation();
  const openPalette = useOpenCommandPalette();

  const phases: RailPhase[] = PHASE_ORDER.map(({ id, label }) => {
    const firstTool = PROJECT_TOOL_ROUTES.find((route) => route.phase === id)?.tool ?? "";
    const href = `/p/${projectId}/v/current/${id}/${firstTool}`;
    const active = location.pathname.startsWith(`/p/${projectId}/v/current/${id}/`);
    return { id, label, state: active ? "active" : "todo", href };
  });

  const paletteItems: CommandPaletteItem[] = React.useMemo(
    () =>
      PROJECT_TOOL_ROUTES.map((route) => ({
        id: `tool-${projectId}-${route.tool}`,
        label: route.title,
        group: "tools" as const,
        href: `/p/${projectId}/v/current/${route.phase}/${route.tool}`,
        hint: route.phase,
      })),
    [projectId],
  );
  usePublishCommandPaletteItems(paletteItems);

  return (
    <ShellProvider embedded>
      <AppShell
        globalBar={<GlobalBar onSearch={openPalette} mode={{ kind: "building", label: "Building" }} statusPill={<StatusCenter />} />}
        rail={
          <Rail
            sections={[{ id: "versions", label: "All versions", href: `/p/${projectId}/versions` }]}
            phases={phases}
            versionCard={<span className="text-xs text-rail-muted">One building version — versions ship in a later milestone.</span>}
          />
        }
        timeline={
          <TimelineStrip
            nodes={[{ id: "building", label: "Building", kind: "building" }]}
            selectedId="building"
            onSelect={() => {}}
          />
        }
        mobileTabBar={
          <MobileTabBar
            items={[
              { id: "versions", label: "Versions", href: `/p/${projectId}/versions` },
              ...phases.map((phase) => ({ id: phase.id, label: phase.label, href: phase.href })),
            ]}
          />
        }
        undoBar={<UndoBar />}
      />
    </ShellProvider>
  );
}

export default ProjectLayout;
