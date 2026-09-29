import { z } from "zod";
import { useMutation, useQuery, useQueryClient, type UseMutationResult, type UseQueryResult } from "@tanstack/react-query";
import apiClient from "@/lib/apiClient";

/**
 * Versions API (T110, WP-V1). Typed TanStack Query hooks over the B1
 * endpoints (contracts/api.md "B1: Versions and changes"), validated with
 * zod per contracts/api.md §1 "New-capability WPs call the new endpoints
 * below through typed TanStack Query hooks in features/<domain>/api.ts,
 * validated with zod, and never with fetch in components." Response
 * shapes match `app/backend/src/routes/versions.ts` and `workItems.ts`.
 *
 * Every route also accepts `?token=` for share-token access (same
 * `authorize_project_access` rule the RPCs use) -- `shareToken` here mirrors
 * how `useRealtimeProject`/`ProjectLayout` already thread it through.
 */

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

export const versionKindSchema = z.enum(["building", "hotfix", "next", "planned", "released"]);
export type VersionKind = z.infer<typeof versionKindSchema>;

/** A row from GET /projects/:projectId/versions (the timeline). */
export const versionSchema = z.object({
  id: z.string(),
  project_id: z.string(),
  name: z.string(),
  kind: versionKindSchema,
  is_current: z.boolean(),
  is_first_release: z.boolean(),
  released_at: z.string().nullable(),
  released_by: z.string().nullable(),
  release_notes: z.string().nullable(),
  git_tag: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
  // COUNT(...) FILTER(...) comes back as a numeric-looking string over the
  // wire from some drivers; coerce defensively either way.
  work_item_count: z.coerce.number(),
  active_work_item_count: z.coerce.number(),
});
export type Version = z.infer<typeof versionSchema>;

export const workItemTypeSchema = z.enum(["bug", "enhancement", "feature"]);
export type WorkItemType = z.infer<typeof workItemTypeSchema>;

export const workItemSeveritySchema = z.enum(["high", "medium", "low"]);
export type WorkItemSeverity = z.infer<typeof workItemSeveritySchema>;

export const workItemStatusSchema = z.enum(["triage", "active", "shipped", "declined"]);
export type WorkItemStatus = z.infer<typeof workItemStatusSchema>;

/** A row from GET /projects/:projectId/work-items (changes list and triage). */
export const workItemSchema = z.object({
  id: z.string(),
  project_id: z.string(),
  key: z.string(),
  version_id: z.string().nullable(),
  type: workItemTypeSchema,
  severity: workItemSeveritySchema.nullable(),
  title: z.string(),
  source: z.string().nullable(),
  evidence: z.string().nullable(),
  status: workItemStatusSchema,
  phase_state: z.record(z.string(), z.string()).nullable().optional(),
  phase_notes: z.record(z.string(), z.string()).nullable().optional(),
  branch: z.string().nullable(),
  preview_url: z.string().nullable(),
  bug_report: z.unknown().nullable().optional(),
  components: z.array(z.string()),
  agent_session_id: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});
export type WorkItem = z.infer<typeof workItemSchema>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function withQuery(path: string, params: Record<string, string | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) search.set(key, value);
  }
  const qs = search.toString();
  return qs ? `${path}?${qs}` : path;
}

export const versionsKeys = {
  all: (projectId: string) => ["versions", projectId] as const,
  list: (projectId: string) => ["versions", projectId, "list"] as const,
  workItems: (projectId: string, params: { status?: string; versionId?: string }) =>
    ["versions", projectId, "work-items", params] as const,
};

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/** GET /projects/:projectId/versions -- the timeline (NV-01), with counts. */
export function useVersions(projectId: string | undefined, shareToken?: string | null): UseQueryResult<Version[]> {
  return useQuery({
    queryKey: versionsKeys.list(projectId ?? ""),
    queryFn: async () => {
      const data = await apiClient.get<unknown>(
        withQuery(`/api/v1/projects/${projectId}/versions`, { token: shareToken ?? undefined }),
      );
      return z.array(versionSchema).parse(data);
    },
    enabled: !!projectId,
  });
}

/** GET /projects/:projectId/work-items?status=&versionId= -- changes list and triage (NV-02). */
export function useWorkItems(
  projectId: string | undefined,
  params: { status?: WorkItemStatus; versionId?: string } = {},
  shareToken?: string | null,
): UseQueryResult<WorkItem[]> {
  return useQuery({
    queryKey: versionsKeys.workItems(projectId ?? "", params),
    queryFn: async () => {
      const data = await apiClient.get<unknown>(
        withQuery(`/api/v1/projects/${projectId}/work-items`, {
          status: params.status,
          versionId: params.versionId,
          token: shareToken ?? undefined,
        }),
      );
      return z.array(workItemSchema).parse(data);
    },
    enabled: !!projectId,
  });
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export interface CreateVersionInput {
  name: string;
  kind: "hotfix" | "planned";
}

/** POST /projects/:projectId/versions -- create a hotfix or planned version. */
export function useCreateVersion(
  projectId: string | undefined,
  shareToken?: string | null,
): UseMutationResult<Version, unknown, CreateVersionInput> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateVersionInput) => {
      const data = await apiClient.post<unknown>(
        withQuery(`/api/v1/projects/${projectId}/versions`, { token: shareToken ?? undefined }),
        input,
      );
      return versionSchema.parse(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: versionsKeys.list(projectId ?? "") });
    },
  });
}

export interface UpdateWorkItemInput {
  id: string;
  /** Schedule into (or clear from, `null`) a version -- triage (NV-02). */
  versionId?: string | null;
  status?: WorkItemStatus;
  title?: string;
  source?: string | null;
  evidence?: string | null;
  severity?: WorkItemSeverity | null;
  components?: string[];
}

/** PATCH /work-items/:id -- schedule/move version, edit, decline (NV-02 triage actions). */
export function useUpdateWorkItem(
  projectId: string | undefined,
  shareToken?: string | null,
): UseMutationResult<WorkItem, unknown, UpdateWorkItemInput> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...patch }: UpdateWorkItemInput) => {
      const data = await apiClient.patch<unknown>(withQuery(`/api/v1/work-items/${id}`, { token: shareToken ?? undefined }), patch);
      return workItemSchema.parse(data);
    },
    onSuccess: () => {
      // A schedule/decline changes both the triage inbox and the target
      // version's counts, so invalidate every versions/work-items query for
      // this project rather than trying to enumerate exactly which changed.
      queryClient.invalidateQueries({ queryKey: versionsKeys.all(projectId ?? "") });
    },
  });
}
