import * as React from "react";
import { Outlet, useLocation, useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/shell/AppShell";
import { GlobalBar } from "@/components/shell/GlobalBar";
import { Rail } from "@/components/shell/Rail";
import { TimelineStrip } from "@/components/shell/TimelineStrip";
import { MobileTabBar } from "@/components/shell/MobileTabBar";
import { StatusCenter } from "@/components/shell/StatusCenter";
import { UndoBar } from "@/components/shell/UndoBar";
import { NextStepBanner } from "@/components/shell/NextStepBanner";
import { usePublishCommandPaletteItems } from "@/components/shell/CommandPaletteItemsContext";
import { useOpenCommandPalette } from "@/app/CommandPaletteOpenContext";
import { PHASE_ORDER, PROJECT_TOOL_ROUTES } from "@/app/routes/project";
import type { RailPhase } from "@/components/shell/types";
import type { CommandPaletteItem } from "@/components/shell/CommandPalette";
import { pronghornApi } from "@/integrations/pronghorn-api/client";
import { useShareToken } from "@/hooks/useShareToken";
import { useRealtimeProject } from "@/hooks/useRealtimeProject";
import type { Database } from "@/integrations/pronghorn-api/types";
import { useVersions } from "@/features/versions/api";
import { useRealtimeVersions } from "@/features/versions/useRealtimeVersions";
import { buildTimeline, modeKindFor } from "@/features/versions/timeline";
import { SCOPED_TOOL_PATH, TOOL_PATH } from "./toolPaths";

type Project = Database["public"]["Tables"]["projects"]["Row"];

/**
 * The "current version" a project route is scoped to. Backed by real data
 * from `GET /projects/:projectId/versions` (T110, WP-V1) via
 * `buildTimeline` -- `id`/`label` fall back to a single synthetic
 * "Building" node (D-7) for a project with no `versions` rows yet (before
 * B1's first release, or before this migration ran for it).
 */
export interface CurrentVersionInfo {
  id: string;
  label: string;
}

/** Fallback used before the versions query resolves, and by tests/stories that don't stub it. */
export const CURRENT_VERSION: CurrentVersionInfo = { id: "building", label: "Building" };

/**
 * ProjectLayoutData (T041). What `ProjectLayout` loads once for every
 * project route: the project row, the caller's role and the current
 * version (D-7: always "building" for now). Exposed through
 * `useProjectLayoutData` so a page *can* read it instead of running its
 * own copy of this fetch -- see plan.md "the move and restyle recipe":
 * moving pages onto this is Phase R, not this task.
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
  currentVersion: CurrentVersionInfo;
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
 * ProjectLayout (T033/T041, versions wiring T110/WP-V1). See
 * contracts/routes.md §1, "Layout: Project": `/p/:projectId/v/current/
 * <phase>/<tool>`, `/p/:projectId/settings` and (new, US4) `/p/:projectId/
 * versions`. `v/current` always resolves to whichever version
 * `currentVersion` names (routes.md), so the phase/tool URLs don't change
 * even though the version they scope to is now real.
 *
 * The Rail/TimelineStrip below render the real version timeline (`GET
 * /projects/:projectId/versions`, NV-01) via `buildTimeline` -- a project
 * with no `versions` rows yet falls back to the single "Building" node
 * D-7 describes. Per-version scoping of the phase tools themselves (an
 * open version's changes shown above the existing tool, a released
 * version's read-only banner) is WP-V4 (T113-T114), not this task --
 * phase state here is still just "active" (matches the current URL) vs
 * "todo".
 */
export function ProjectLayout() {
  const { projectId = "" } = useParams<{ projectId: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const openPalette = useOpenCommandPalette();

  const { token: shareToken, isTokenSet, tokenMissing } = useShareToken(projectId);

  const { project, isLoading: isProjectLoading, refresh: refreshProject } = useRealtimeProject(
    projectId,
    shareToken,
    !!projectId && isTokenSet,
  );

  const { data: versions } = useVersions(projectId || undefined, shareToken);
  useRealtimeVersions(projectId || undefined);
  const timeline = React.useMemo(() => buildTimeline(versions ?? []), [versions]);

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

  const currentVersion: CurrentVersionInfo = React.useMemo(
    () => ({ id: timeline.currentId, label: timeline.currentLabel }),
    [timeline.currentId, timeline.currentLabel],
  );

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
      currentVersion,
      refreshProject,
    }),
    [projectId, project, isProjectLoading, role, isRoleLoading, isOwner, shareToken, isTokenSet, tokenMissing, currentVersion, refreshProject],
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

  // NV-06 (WP-V4): `/p/:id/v/<versionId>/<phase>/<tool>` is the same tool scoped to that version.
  const scopedToolMatch = SCOPED_TOOL_PATH.exec(location.pathname);
  const phases: RailPhase[] = PHASE_ORDER.map(({ id, label }) => {
    const firstTool = PROJECT_TOOL_ROUTES.find((route) => route.phase === id)?.tool ?? "";
    const href = `/p/${projectId}/v/current/${id}/${firstTool}`;
    const active = location.pathname.startsWith(`/p/${projectId}/v/current/${id}/`) || scopedToolMatch?.[1] === id;
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

  // No per-version phase/tool routes yet (WP-V4, T113-T114): selecting any
  // node on the strip takes you to the All versions page (NV-02), the one
  // place to see/triage a version other than the current one right now.
  const toolMatch = TOOL_PATH.exec(location.pathname);
  const goToVersions = React.useCallback(
    (nodeId?: string) => {
      // NV-06: on a phase tool, selecting another version reopens the same tool scoped to it.
      if (toolMatch && nodeId) {
        const segment = nodeId === timeline.currentId || nodeId === "building" ? "current" : nodeId;
        navigate(`/p/${projectId}/v/${segment}/${toolMatch[1]}/${toolMatch[2]}`);
        return;
      }
      navigate(`/p/${projectId}/versions`);
    },
    [navigate, projectId, toolMatch, timeline.currentId],
  );

  const versionCardText =
    timeline.currentKind === "building"
      ? `Everything you build now becomes ${timeline.currentLabel}.`
      : `Current release ${timeline.currentLabel}.`;

  return (
    <ProjectLayoutContext.Provider value={projectLayoutData}>
      <AppShell
        globalBar={
          <GlobalBar
            onSearch={openPalette}
            mode={{ kind: modeKindFor(timeline.currentKind), label: timeline.currentLabel }}
            statusPill={<StatusCenter />}
          />
        }
        rail={
          <Rail
            sections={[{ id: "versions", label: "All versions", href: `/p/${projectId}/versions` }]}
            phases={phases}
            versionCard={<span className="text-xs text-rail-muted">{versionCardText}</span>}
          />
        }
        timeline={
          <TimelineStrip nodes={timeline.nodes} flags={timeline.flags} selectedId={timeline.currentId} onSelect={goToVersions} />
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
  );
}

export default ProjectLayout;
