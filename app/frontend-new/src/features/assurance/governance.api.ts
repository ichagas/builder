import { z } from "zod";
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import apiClient from "@/lib/apiClient";
import { meshExceptionSchema, type MeshException, type MeshPolicyMode } from "@/features/assurance/api";

/**
 * Governance API (T133, WP-A4, NA-06): Standards packs, and the exceptions
 * list per application. Mesh policy itself reuses `useMeshPolicy` /
 * `useSetMeshPolicy` / `MESH_AGENTS` from `./api` (WP-A6), and requesting an
 * exception reuses `useCreateException` (WP-A2) -- neither is duplicated here.
 * Shapes match `app/backend/src/routes/packs.ts` and `routes/mesh.ts`.
 */

/** GET /packs row (standards_packs). `changes` is free-form jsonb; see `normalizePackChanges`. */
export const standardsPackSchema = z.object({
  version: z.string(),
  published_at: z.string(),
  notes: z.string().nullable(),
  changes: z.array(z.unknown()).nullable().transform((v) => v ?? []),
  workflow_ref: z.string().nullable(),
});
export type StandardsPack = z.infer<typeof standardsPackSchema>;

export interface PackChange {
  kind: "new" | "changed";
  text: string;
}

/**
 * `changes` is `jsonb DEFAULT '[]'`: accept a string, `[kind, text]`, or an
 * object with `kind`/`type`/`label` and `text`/`description`, so a pack
 * published by any of the tools that fill it still renders.
 */
export function normalizePackChanges(changes: unknown[]): PackChange[] {
  const out: PackChange[] = [];
  for (const c of changes) {
    if (typeof c === "string") {
      out.push({ kind: "changed", text: c });
    } else if (Array.isArray(c) && typeof c[1] === "string") {
      out.push({ kind: String(c[0]).toLowerCase() === "new" ? "new" : "changed", text: c[1] });
    } else if (c && typeof c === "object") {
      const o = c as Record<string, unknown>;
      const text = [o.text, o.description, o.summary, o.title].find((v): v is string => typeof v === "string");
      const kind = String(o.kind ?? o.type ?? o.label ?? "").toLowerCase();
      if (text) out.push({ kind: kind === "new" || kind === "added" ? "new" : "changed", text });
    }
  }
  return out;
}

export const governanceKeys = {
  packs: ["assurance", "packs"] as const,
  exceptions: (applicationId: string) => ["assurance", "exceptions", applicationId] as const,
};

/** GET /packs -- published Standards packs, newest first. */
export function usePacks(): UseQueryResult<StandardsPack[]> {
  return useQuery({
    queryKey: governanceKeys.packs,
    queryFn: async () => {
      const data = await apiClient.get<unknown>("/api/v1/packs");
      return z.array(standardsPackSchema).parse(data);
    },
  });
}

/** GET /mesh/exceptions?applicationId= -- soonest expiry first. */
export function useMeshExceptions(applicationId: string | undefined): UseQueryResult<MeshException[]> {
  return useQuery({
    queryKey: governanceKeys.exceptions(applicationId ?? ""),
    queryFn: async () => {
      const data = await apiClient.get<unknown>(`/api/v1/mesh/exceptions?applicationId=${applicationId}`);
      return z.array(meshExceptionSchema).parse(data);
    },
    enabled: !!applicationId,
  });
}

/** off < notify < issue < block -- mirrors `services/mesh/policy.ts` MODE_RANK. */
export const MODE_RANK: Record<MeshPolicyMode, number> = { off: 0, notify: 1, issue: 2, block: 3 };
export const POLICY_MODES: MeshPolicyMode[] = ["off", "notify", "issue", "block"];

/** Whether a non-admin owner may move a check from `current` to `next` (tighten or keep only). */
export function canSetMode(current: MeshPolicyMode, next: MeshPolicyMode, isOrgAdmin: boolean): boolean {
  return isOrgAdmin || MODE_RANK[next] >= MODE_RANK[current];
}

/** An exception is expired once `expires_at` is in the past. */
export function isExceptionExpired(exception: Pick<MeshException, "expires_at">, now = Date.now()): boolean {
  return new Date(exception.expires_at).getTime() < now;
}
