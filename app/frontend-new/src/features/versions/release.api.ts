import { z } from "zod";
import { useMutation, useQuery, useQueryClient, type UseMutationResult, type UseQueryResult } from "@tanstack/react-query";
import apiClient from "@/lib/apiClient";
import { versionSchema, versionsKeys } from "./api";
import { releaseChecksKey, releaseChecksSchema, withToken, type ReleaseChecks } from "./shared";

/**
 * Release API (T112, WP-V3, NV-05). Typed TanStack Query hooks over the
 * B1 release endpoints (contracts/api.md "B1: Versions and changes"):
 * `GET /projects/:id/release-checks`, `POST /projects/:id/first-release`
 * and `POST /projects/:id/versions/:versionId/release`. Response shapes
 * match `services/versions/releaseService.ts`. Kept in its own file (not
 * `api.ts`) so the parallel V2/V4 WPs don't conflict on it.
 */

/** The released version row, plus the best-effort deploy outcome. */
export const releasedVersionSchema = versionSchema
  .omit({ work_item_count: true, active_work_item_count: true })
  .extend({ deployTriggered: z.boolean().optional(), deployReason: z.string().optional() });

export const releaseResultSchema = z.object({
  version: releasedVersionSchema,
  carriedOverWorkItemIds: z.array(z.string()),
});
export type ReleaseResult = z.infer<typeof releaseResultSchema>;

export const firstReleaseResultSchema = z.object({
  version: releasedVersionSchema,
  project: z.record(z.string(), z.unknown()),
});
export type FirstReleaseResult = z.infer<typeof firstReleaseResultSchema>;

export const releaseKeys = {
  // Nested under versionsKeys.all so realtime `version_released` (and every
  // mutation below) refreshes the checks together with the timeline.
  checks: (projectId: string, versionId: string | undefined) =>
    releaseChecksKey(projectId, versionId),
};

/**
 * GET /projects/:projectId/release-checks. Omit `versionId` for the first
 * release (the backend then checks the implicit v1.0.0); pass it to check a
 * specific open version after the first release.
 */
export function useReleaseChecks(
  projectId: string | undefined,
  versionId: string | undefined,
  shareToken?: string | null,
  enabled = true,
): UseQueryResult<ReleaseChecks> {
  return useQuery({
    queryKey: releaseKeys.checks(projectId ?? "", versionId),
    queryFn: async () => {
      const search = new URLSearchParams();
      if (versionId) search.set("versionId", versionId);
      if (shareToken) search.set("token", shareToken);
      const qs = search.toString();
      const data = await apiClient.get<unknown>(`/api/v1/projects/${projectId}/release-checks${qs ? `?${qs}` : ""}`);
      return releaseChecksSchema.parse(data);
    },
    enabled: !!projectId && enabled,
  });
}

/** POST /projects/:projectId/first-release -- checks, tag v1.0.0, lock the baseline. */
export function useFirstRelease(
  projectId: string | undefined,
  shareToken?: string | null,
): UseMutationResult<FirstReleaseResult, unknown, void> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const data = await apiClient.post<unknown>(withToken(`/api/v1/projects/${projectId}/first-release`, shareToken), {});
      return firstReleaseResultSchema.parse(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: versionsKeys.all(projectId ?? "") });
    },
  });
}

/** POST /projects/:projectId/versions/:versionId/release -- in order, with carry-over. */
export function useReleaseVersion(
  projectId: string | undefined,
  shareToken?: string | null,
): UseMutationResult<ReleaseResult, unknown, { versionId: string }> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ versionId }: { versionId: string }) => {
      const data = await apiClient.post<unknown>(
        withToken(`/api/v1/projects/${projectId}/versions/${versionId}/release`, shareToken),
        {},
      );
      return releaseResultSchema.parse(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: versionsKeys.all(projectId ?? "") });
    },
  });
}
