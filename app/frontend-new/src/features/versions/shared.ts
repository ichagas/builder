import { z } from "zod";
import { versionsKeys } from "./api";

/**
 * Shared home for the versions schemas, query keys and helpers that more than
 * one hook file uses (scope.api, change.api, release.api). The same query key
 * must always be parsed by the same zod schema: otherwise whichever hook
 * fills the cache first decides what shape the other one reads back.
 */

/** Append the share token to a path, respecting an existing query string. */
export function withToken(path: string, shareToken?: string | null): string {
  return shareToken ? `${path}${path.includes("?") ? "&" : "?"}token=${encodeURIComponent(shareToken)}` : path;
}

export const requirementChangeKindSchema = z.enum(["new", "changed", "regression"]);
export type RequirementChangeKind = z.infer<typeof requirementChangeKindSchema>;

/** A row from GET /work-items/:id/requirement-changes. */
export const requirementChangeSchema = z.object({
  id: z.string(),
  work_item_id: z.string(),
  requirement_id: z.string().nullable(),
  kind: requirementChangeKindSchema,
  title: z.string(),
  criterion: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});
export type RequirementChange = z.infer<typeof requirementChangeSchema>;

export const requirementChangesSchema = z.array(requirementChangeSchema);

/** Query key of one work item's requirement deltas (under versionsKeys, so realtime invalidation reaches it). */
export const requirementChangesKey = (projectId: string, workItemId: string) =>
  [...versionsKeys.all(projectId), "requirement-changes", workItemId] as const;

export const releaseCheckSchema = z.object({
  id: z.string(),
  label: z.string(),
  passed: z.boolean(),
  detail: z.string().optional().nullable(),
});
export type ReleaseCheck = z.infer<typeof releaseCheckSchema>;

export const releaseChecksSchema = z.object({
  projectId: z.string().optional(),
  checks: z.array(releaseCheckSchema),
  canRelease: z.boolean(),
});
export type ReleaseChecks = z.infer<typeof releaseChecksSchema>;

/** Query key of a version's release checks; omit `versionId` for the first release. */
export const releaseChecksKey = (projectId: string, versionId: string | null | undefined) =>
  [...versionsKeys.all(projectId), "release-checks", versionId || "first"] as const;
