import { z } from "zod";
import { useMutation, useQuery, useQueryClient, type UseMutationResult, type UseQueryResult } from "@tanstack/react-query";
import apiClient from "@/lib/apiClient";
import { pronghornApi } from "@/integrations/pronghorn-api/client";
import { versionsKeys, workItemSchema, type WorkItem } from "./api";
import {
  releaseChecksKey,
  releaseChecksSchema,
  requirementChangeSchema,
  requirementChangesKey,
  requirementChangesSchema,
  withToken,
  type ReleaseChecks,
  type RequirementChange,
  type RequirementChangeKind,
} from "./shared";

/**
 * Change page API (T111, WP-V2, NV-03/NV-04). Hooks for one change
 * (`GET /work-items/:id`), its steps
 * (`POST /work-items/:id/steps/:step/complete`, `.../design/unskip`), its
 * requirement deltas (`GET/POST /work-items/:id/requirement-changes`), and
 * the read-only data the page shows next to them (scoped canvas nodes/edges,
 * the linked agent session, the version's release checks).
 *
 * Every key sits under `versionsKeys.all(projectId)`, so the invalidation
 * `useUpdateWorkItem` (api.ts) and `useRealtimeVersions` already do also
 * refreshes an open change page.
 */

export { PHASE_STEPS } from "./change/steps";
export type { PhaseStep, PhaseState } from "./change/steps";
import type { PhaseStep } from "./change/steps";

/** `work_items.bug_report` -- `{steps[], expected, actual, environment}` (data-model.md). Lenient: every field optional. */
export const bugReportSchema = z.object({
  steps: z.array(z.string()).optional(),
  expected: z.string().optional(),
  actual: z.string().optional(),
  environment: z.string().optional(),
});
export type BugReport = z.infer<typeof bugReportSchema>;

/** A canvas node reduced to what the scoped canvas shows. */
export const canvasNodeSchema = z.object({
  id: z.string(),
  type: z.string().nullable().optional(),
  data: z.record(z.string(), z.unknown()).nullable().optional(),
});
export type CanvasNodeLite = z.infer<typeof canvasNodeSchema>;

export const canvasEdgeSchema = z.object({ id: z.string(), source: z.string(), target: z.string() });
export type CanvasEdgeLite = z.infer<typeof canvasEdgeSchema>;

export const agentSessionSchema = z.object({
  id: z.string(),
  status: z.string(),
  task_description: z.string().nullable().optional(),
  completed_at: z.string().nullable().optional(),
});
export type AgentSession = z.infer<typeof agentSessionSchema>;

export const changeKeys = {
  item: (projectId: string, id: string) => [...versionsKeys.all(projectId), "work-item", id] as const,
  deltas: (projectId: string, id: string) => requirementChangesKey(projectId, id),
  canvas: (projectId: string) => [...versionsKeys.all(projectId), "canvas"] as const,
  agent: (projectId: string, sessionId: string) => [...versionsKeys.all(projectId), "agent-session", sessionId] as const,
  checks: (projectId: string, versionId: string) => releaseChecksKey(projectId, versionId),
};

/** GET /work-items/:id -- the change page (NV-03). */
export function useWorkItem(
  projectId: string | undefined,
  id: string | undefined,
  shareToken?: string | null,
): UseQueryResult<WorkItem> {
  return useQuery({
    queryKey: changeKeys.item(projectId ?? "", id ?? ""),
    queryFn: async () => workItemSchema.parse(await apiClient.get<unknown>(withToken(`/api/v1/work-items/${id}`, shareToken))),
    enabled: !!projectId && !!id,
  });
}

/** GET /work-items/:id/requirement-changes -- requirement deltas (NV-03). */
export function useRequirementChanges(
  projectId: string | undefined,
  id: string | undefined,
  shareToken?: string | null,
): UseQueryResult<RequirementChange[]> {
  return useQuery({
    queryKey: changeKeys.deltas(projectId ?? "", id ?? ""),
    queryFn: async () =>
      requirementChangesSchema.parse(await apiClient.get<unknown>(withToken(`/api/v1/work-items/${id}/requirement-changes`, shareToken))),
    enabled: !!projectId && !!id,
  });
}

export interface AddRequirementChangeInput {
  kind: RequirementChangeKind;
  title: string;
  criterion?: string | null;
  requirementId?: string | null;
}

/** POST /work-items/:id/requirement-changes -- record a delta. */
export function useAddRequirementChange(
  projectId: string | undefined,
  id: string | undefined,
  shareToken?: string | null,
): UseMutationResult<RequirementChange, unknown, AddRequirementChangeInput> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: AddRequirementChangeInput) =>
      requirementChangeSchema.parse(await apiClient.post<unknown>(withToken(`/api/v1/work-items/${id}/requirement-changes`, shareToken), input)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: changeKeys.deltas(projectId ?? "", id ?? "") });
    },
  });
}

/** POST /work-items/:id/steps/:step/complete -- mark ready, approve, send for review. */
export function useCompleteStep(
  projectId: string | undefined,
  id: string | undefined,
  shareToken?: string | null,
): UseMutationResult<WorkItem, unknown, PhaseStep> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (step: PhaseStep) =>
      workItemSchema.parse(await apiClient.post<unknown>(withToken(`/api/v1/work-items/${id}/steps/${step}/complete`, shareToken), {})),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: versionsKeys.all(projectId ?? "") });
    },
  });
}

/** POST /work-items/:id/steps/design/unskip -- add a design step to a bug. */
export function useUnskipDesign(
  projectId: string | undefined,
  id: string | undefined,
  shareToken?: string | null,
): UseMutationResult<WorkItem, unknown, void> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () =>
      workItemSchema.parse(await apiClient.post<unknown>(withToken(`/api/v1/work-items/${id}/steps/design/unskip`, shareToken), {})),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: versionsKeys.all(projectId ?? "") });
    },
  });
}

/**
 * Canvas nodes and edges for the scoped canvas (NV-03 design step), through
 * the same RPCs the Canvas page uses. Only fetched once the design step is
 * shown (`enabled`).
 */
export function useCanvasGraph(
  projectId: string | undefined,
  shareToken: string | null | undefined,
  enabled: boolean,
): UseQueryResult<{ nodes: CanvasNodeLite[]; edges: CanvasEdgeLite[] }> {
  return useQuery({
    queryKey: changeKeys.canvas(projectId ?? ""),
    queryFn: async () => {
      const args = { p_project_id: projectId, p_token: shareToken ?? null };
      const [nodes, edges] = await Promise.all([
        pronghornApi.rpc("get_canvas_nodes_with_token", args),
        pronghornApi.rpc("get_canvas_edges_with_token", args),
      ]);
      if (nodes.error) throw nodes.error;
      if (edges.error) throw edges.error;
      return {
        nodes: z.array(canvasNodeSchema).parse(nodes.data ?? []),
        edges: z.array(canvasEdgeSchema).parse(edges.data ?? []),
      };
    },
    enabled: !!projectId && enabled,
  });
}

/** The change's linked agent session (`work_items.agent_session_id`), for the build step's live state. */
export function useAgentSession(
  projectId: string | undefined,
  sessionId: string | null | undefined,
  shareToken?: string | null,
): UseQueryResult<AgentSession | null> {
  return useQuery({
    queryKey: changeKeys.agent(projectId ?? "", sessionId ?? ""),
    queryFn: async () => {
      const { data, error } = await pronghornApi.rpc("get_agent_sessions_with_token", {
        p_project_id: projectId,
        p_token: shareToken ?? null,
        p_agent_type: null,
      });
      if (error) throw error;
      const sessions = z.array(agentSessionSchema).parse(data ?? []);
      return sessions.find((s) => s.id === sessionId) ?? null;
    },
    enabled: !!projectId && !!sessionId,
    refetchInterval: (query) => (query.state.data?.status === "running" ? 5000 : false),
  });
}

/** GET /projects/:projectId/release-checks?versionId= -- the change's version's checks (ship step). */
export function useVersionChecks(
  projectId: string | undefined,
  versionId: string | null | undefined,
  shareToken?: string | null,
): UseQueryResult<ReleaseChecks> {
  return useQuery({
    queryKey: changeKeys.checks(projectId ?? "", versionId ?? ""),
    queryFn: async () =>
      releaseChecksSchema.parse(
        await apiClient.get<unknown>(withToken(`/api/v1/projects/${projectId}/release-checks?versionId=${versionId}`, shareToken)),
      ),
    enabled: !!projectId && !!versionId,
  });
}
