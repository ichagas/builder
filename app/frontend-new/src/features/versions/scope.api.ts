import { z } from "zod";
import { useQueries, type UseQueryResult } from "@tanstack/react-query";
import apiClient from "@/lib/apiClient";
import { useVersions, useWorkItems, versionsKeys, type Version, type WorkItem } from "./api";

/**
 * Version scoping (T113, WP-V4, NV-06). Hooks behind `VersionScope`: which
 * version a `/p/:id/v/:versionId/<phase>/<tool>` URL names, and (for an open
 * version) its changes plus their requirement deltas. Kept out of `api.ts`
 * so it merges cleanly with WP-V2/V3's additions.
 */

export const requirementChangeKindSchema = z.enum(["new", "changed", "regression"]);
export type RequirementChangeKind = z.infer<typeof requirementChangeKindSchema>;

/** A row from GET /work-items/:id/requirement-changes. */
export const requirementChangeSchema = z.object({
  work_item_id: z.string(),
  requirement_id: z.string().nullable(),
  kind: requirementChangeKindSchema,
  title: z.string(),
  criterion: z.string().nullable(),
});
export type RequirementChange = z.infer<typeof requirementChangeSchema>;

export type ScopeMode = "none" | "released" | "open";

export interface ResolvedScope {
  mode: ScopeMode;
  version: Version | null;
  /** True while a non-"current" version segment is still waiting on the versions list. */
  isResolving: boolean;
  /** A `:versionId` was given but matches no version of this project. */
  isUnknown: boolean;
}

const NO_SCOPE: ResolvedScope = { mode: "none", version: null, isResolving: false, isUnknown: false };

/** `v/current` (and the D-7 synthetic "building" id) never scope: the tool renders untouched. */
export function isUnscopedSegment(segment: string | undefined): boolean {
  return !segment || segment === "current" || segment === "building";
}

/** Pure resolver: `versionParam` is a version id or its name (e.g. `v1.0.1`). */
export function resolveScope(versions: Version[] | undefined, versionParam: string | undefined): ResolvedScope {
  if (isUnscopedSegment(versionParam)) return NO_SCOPE;
  if (!versions) return { mode: "none", version: null, isResolving: true, isUnknown: false };
  const version = versions.find((v) => v.id === versionParam || v.name === versionParam);
  if (!version) return { mode: "none", version: null, isResolving: false, isUnknown: true };
  // The unreleased "building" version is what v/current is: nothing to scope.
  if (version.kind === "building") return NO_SCOPE;
  return { mode: version.kind === "released" ? "released" : "open", version, isResolving: false, isUnknown: false };
}

export function useVersionScope(projectId: string | undefined, versionParam: string | undefined, shareToken?: string | null): ResolvedScope {
  const skip = isUnscopedSegment(versionParam);
  const { data: versions, isError } = useVersions(skip ? undefined : projectId, shareToken);
  const resolved = resolveScope(versions, versionParam);
  if (isError && !versions) return { ...NO_SCOPE };
  return resolved;
}

export interface VersionChangeDeltas {
  item: WorkItem;
  deltas: RequirementChange[];
  isLoadingDeltas: boolean;
}

export interface OpenVersionChanges {
  isLoading: boolean;
  isError: boolean;
  changes: VersionChangeDeltas[];
}

function withToken(path: string, token?: string | null): string {
  return token ? `${path}?token=${encodeURIComponent(token)}` : path;
}

/** The open version's changes (declined ones left out) with each one's requirement deltas. */
export function useOpenVersionChanges(
  projectId: string | undefined,
  versionId: string | undefined,
  shareToken?: string | null,
): OpenVersionChanges {
  const items = useWorkItems(projectId, { versionId }, shareToken);
  const visible = (items.data ?? []).filter((item) => item.status !== "declined");
  const deltaQueries = useQueries({
    queries: visible.map((item) => ({
      queryKey: [...versionsKeys.all(projectId ?? ""), "requirement-changes", item.id] as const,
      queryFn: async () => {
        const data = await apiClient.get<unknown>(withToken(`/api/v1/work-items/${item.id}/requirement-changes`, shareToken));
        return z.array(requirementChangeSchema).parse(data);
      },
      enabled: !!versionId,
    })),
  }) as UseQueryResult<RequirementChange[]>[];

  return {
    isLoading: items.isLoading,
    isError: items.isError,
    changes: visible.map((item, index) => ({
      item,
      deltas: deltaQueries[index]?.data ?? [],
      isLoadingDeltas: deltaQueries[index]?.isLoading ?? false,
    })),
  };
}
