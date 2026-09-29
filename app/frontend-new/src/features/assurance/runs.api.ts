import { z } from "zod";
import { useMutation, useQuery, useQueryClient, type UseMutationResult, type UseQueryResult } from "@tanstack/react-query";
import apiClient from "@/lib/apiClient";
import { meshVerdictsSchema } from "./api";

/**
 * Mesh runs by day and evidence (T132, WP-A3, NA-05). Hooks over
 * `GET /applications/:appId/runs?days=` (runs on PRs to the default branch,
 * open and merged, grouped by day), `GET /mesh/runs/:runId` (evidence) and
 * `POST /mesh/runs/:runId/issue` (contracts/api.md; `routes/applications.ts`
 * and `routes/mesh.ts`). Kept apart from `api.ts` so parallel WPs don't
 * collide; the shared verdict schema is imported from there.
 */

/** One run in GET /applications/:appId/runs (runsByDay[].runs[]). */
export const appRunSchema = z.object({
  id: z.string(),
  repository_id: z.string(),
  repository_full_name: z.string(),
  commit_sha: z.string(),
  pr_number: z.number().nullable(),
  pr_state: z.string().nullable(),
  trigger: z.string(),
  pack_version: z.string().nullable(),
  verdicts: meshVerdictsSchema,
  new_findings: z.coerce.number(),
  asvs_passed: z.number().nullable(),
  alberta_passed: z.number().nullable(),
  report_url: z.string().nullable(),
  received_at: z.string(),
});
export type AppRun = z.infer<typeof appRunSchema>;

export const appRunsSchema = z.object({
  appId: z.string(),
  days: z.coerce.number(),
  runsByDay: z.array(z.object({ day: z.string(), runs: z.array(appRunSchema) })),
});
export type AppRuns = z.infer<typeof appRunsSchema>;

/** GET /mesh/runs/:runId: the run row plus its repository. */
export const meshRunEvidenceSchema = appRunSchema.extend({
  application_id: z.string(),
  base_branch: z.string().nullable().optional(),
});
export type MeshRunEvidence = z.infer<typeof meshRunEvidenceSchema>;

/** POST /mesh/runs/:runId/issue result. */
export const openIssueResultSchema = z.object({
  created: z.boolean(),
  issueRef: z.string().nullable(),
  message: z.string().optional(),
});
export type OpenIssueResult = z.infer<typeof openIssueResultSchema>;

export const runsKeys = {
  all: (appId: string) => ["assurance", "applications", appId, "runs"] as const,
  byDays: (appId: string, days: number) => ["assurance", "applications", appId, "runs", days] as const,
  run: (runId: string) => ["assurance", "meshRuns", runId] as const,
};

export const RUN_DAY_OPTIONS = [7, 14, 30] as const;

/** GET /applications/:appId/runs?days= (NA-05). */
export function useAppRuns(appId: string | undefined, days: number): UseQueryResult<AppRuns> {
  return useQuery({
    queryKey: runsKeys.byDays(appId ?? "", days),
    queryFn: async () => {
      const data = await apiClient.get<unknown>(`/api/v1/applications/${appId}/runs?days=${days}`);
      return appRunsSchema.parse(data);
    },
    enabled: !!appId,
  });
}

/** GET /mesh/runs/:runId: the evidence for one run. */
export function useMeshRun(runId: string | undefined): UseQueryResult<MeshRunEvidence> {
  return useQuery({
    queryKey: runsKeys.run(runId ?? ""),
    queryFn: async () => {
      const data = await apiClient.get<unknown>(`/api/v1/mesh/runs/${runId}`);
      return meshRunEvidenceSchema.parse(data);
    },
    enabled: !!runId,
  });
}

/** POST /mesh/runs/:runId/issue: open an issue / work item for the run's new findings. */
export function useOpenRunIssue(appId: string | undefined): UseMutationResult<OpenIssueResult, unknown, string> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (runId: string) => {
      const data = await apiClient.post<unknown>(`/api/v1/mesh/runs/${runId}/issue`, {});
      return openIssueResultSchema.parse(data);
    },
    onSuccess: () => {
      if (appId) void queryClient.invalidateQueries({ queryKey: runsKeys.all(appId) });
    },
  });
}
