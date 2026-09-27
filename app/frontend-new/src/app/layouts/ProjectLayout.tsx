import * as React from "react";
import { Outlet, useLocation, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/shell/AppShell";
import { GlobalBar } from "@/components/shell/GlobalBar";
import { Rail } from "@/components/shell/Rail";
import { TimelineStrip } from "@/components/shell/TimelineStrip";
import { MobileTabBar } from "@/components/shell/MobileTabBar";
import { StatusCenter } from "@/components/shell/StatusCenter";
import { UndoBar } from "@/components/shell/UndoBar";
import { NextStepBanner } from "@/components/shell/NextStepBanner";
import { ShellProvider } from "@/components/shell/ShellContext";
import { usePublishCommandPaletteItems } from "@/components/shell/CommandPaletteItemsContext";
import { useOpenCommandPalette } from "@/app/CommandPaletteOpenContext";
import { PHASE_ORDER, PROJECT_TOOL_ROUTES } from "@/app/routes/project";
import type { RailPhase } from "@/components/shell/types";
import type { CommandPaletteItem } from "@/components/shell/CommandPalette";
import { pronghornApi } from "@/integrations/pronghorn-api/client";
import { useShareToken } from "@/hooks/useShareToken";
import { useRealtimeProject } from "@/hooks/useRealtimeProject";
import type { Database } from "@/integrations/pronghorn-api/types";

type Project = Database["public"]["Tables"]["projects"]["Row"];

/**
 * A single "Building" version until B1 ships the versions feature (D-7,
 * T110+) -- see the doc comment on ProjectLayout below.
 */
export const CURRENT_VERSION = { id: "building", label: "Building" } as const;

/**
 * ProjectLayoutData (T041). What `ProjectLayout` loads once for every
 * project route: the project row, the caller's role and the current
 * version (D-7: always "building" for now). Exposed through
 * `useProjectLayoutData` so a page *can* read it instead of running its
 * own copy of this fetch -- see plan.md "the move and restyle recipe":
 * moving pages onto this is Phase R, not this task, so nothing here
 * changes what an unmoved page renders today (`ShellProvider embedded`
 * still nulls its own `PrimaryNav`/`ProjectSidebar`/`ProjectPageHeader`).
 */
export interface ProjectLayoutData {
  projectId: string;
  project: Project | null;
  isProjectLoading: boolean;
  /** `owner | editor | viewer | null` -- null while loading or unauthorized (see `authorize_project_access`). */
  role: string | null;
  isRoleLoading: boolean;
  isOwner: boolean;
  shareToken: string | null;
  isTokenSet: boolean;
  tokenMissing: boolean;
  currentVersion: typeof CURRENT_VERSION;
  refreshProject: () => void;
}

const ProjectLayoutContext = React.createContext<ProjectLayoutData | undefined>(undefined);

/** Reads the project/role/version `ProjectLayout` already loaded for the current route. Must be used under `ProjectLayout` (a project route). */
export function useProjectLayoutData(): ProjectLayoutData {
  const ctx = React.useContext(ProjectLayoutContext);
  if (!ctx) {
    throw new Error("useProjectLayoutData must be used within a project route (ProjectLayout)");
  }
  return ctx;
}

/**
 * ProjectLayout (T033/T041). See contracts/routes.md §1, "Layout: Project":
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

  const { token: shareToken, isTokenSet, tokenMissing } = useShareToken(projectId);

  const { project, isLoading: isProjectLoading, refresh: refreshProject } = useRealtimeProject(
    projectId,
    shareToken,
    !!projectId && isTokenSet,
  );

  // Same RPC ProjectSettings has always used to gate its owner-only
  // sections (`authorize_project_access`) -- loaded once here so every
  // project route can read it via `useProjectLayoutData` instead of
  // re-fetching it per page.
  const { data: role = null, isLoading: isRoleLoading } = useQuery({
    queryKey: ["project-role", projectId, shareToken],
    queryFn: async () => {
      const { data, error } = await pronghornApi.rpc("authorize_project_access", {
        p_project_id: projectId,
        p_token: shareToken || null,
      });
      if (error) return null;
      return data as string | null;
    },
    enabled: !!projectId && isTokenSet,
  });
  const isOwner = role === "owner";

  const projectLayoutData: ProjectLayoutData = React.useMemo(
    () => ({
      projectId,
      project: (project as Project) ?? null,
      isProjectLoading,
      role,
      isRoleLoading,
      isOwner,
      shareToken,
      isTokenSet,
      tokenMissing,
      currentVersion: CURRENT_VERSION,
      refreshProject,
    }),
    [projectId, project, isProjectLoading, role, isRoleLoading, isOwner, shareToken, isTokenSet, tokenMissing, refreshProject],
  );

  // Read-only access banner (T041): informs viewer/editor share-token
  // access on every project route, not just Settings (where
  // `AccessLevelBanner` has shown it since before this WP). Purely
  // additive -- doesn't gate anything, the actual role limits stay
  // wherever each page already enforces them.
  const showAccessBanner = !tokenMissing && !isRoleLoading && !!shareToken && !!role && role !== "owner";
  const accessBanner = showAccessBanner ? (
    <div className="px-4 pt-3">
      <NextStepBanner
        tone={role === "viewer" ? "lock" : "info"}
        title={role === "viewer" ? "Read-only access" : "Editor access"}
        body={
          role === "viewer"
            ? "You're viewing this project with a shared viewer link. Changes aren't available."
            : "You're editing this project with a shared editor link."
        }
      />
    </div>
  ) : null;

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
      <ProjectLayoutContext.Provider value={projectLayoutData}>
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
        >
          {accessBanner}
          <Outlet />
        </AppShell>
      </ProjectLayoutContext.Provider>
    </ShellProvider>
  );
}

export default ProjectLayout;
