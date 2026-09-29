import { z } from "zod";
import { useMutation, useQuery, useQueryClient, type UseQueryResult } from "@tanstack/react-query";
import apiClient from "@/lib/apiClient";
import { onboardingKeys, onboardingRunSchema, type OnboardingRun, type OnboardingRunRepository } from "./api";

/**
 * Onboarding steps 3-5 API (T151, WP-O2): start the sandbox job, read the
 * output review, open the pull requests (contracts/api.md "B3: Onboarding").
 * The live log is the `onboarding-{runId}` realtime channel
 * (`useRealtimeOnboardingLog`); these are the REST calls around it.
 */

/** One generated file in a repository's `generated_manifest` (`{path, content?}`). */
export const generatedFileSchema = z
  .object({ path: z.string(), content: z.string().optional() })
  .passthrough();
export type GeneratedFile = z.infer<typeof generatedFileSchema>;

export interface BaselineCounts {
  green: number;
  yellow: number;
  red: number;
  blue: number;
}

const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);

/** Baseline verdict counts from the loosely-typed `baseline_counts` jsonb. */
export function readBaselineCounts(raw: Record<string, unknown>): BaselineCounts {
  return { green: num(raw.green), yellow: num(raw.yellow), red: num(raw.red), blue: num(raw.blue) };
}

/** Generated files from the loosely-typed `generated_manifest` jsonb; malformed entries are dropped. */
export function readGeneratedFiles(raw: unknown[]): GeneratedFile[] {
  return raw.flatMap((entry) => {
    const parsed = generatedFileSchema.safeParse(entry);
    return parsed.success ? [parsed.data] : [];
  });
}

/** A repository's sandbox failure reason (`review.sandboxError`), if the job reported one. */
export function readSandboxError(review: Record<string, unknown>): string | null {
  return typeof review.sandboxError === "string" && review.sandboxError ? review.sandboxError : null;
}

/** A repository's last PR failure (`review.prError`), if any. */
export function readPrError(review: Record<string, unknown>): string | null {
  return typeof review.prError === "string" && review.prError ? review.prError : null;
}

/** Whether a repository has something a PR can be built from. */
export function repositoryHasOutput(repo: OnboardingRunRepository): boolean {
  return repo.selected && !readSandboxError(repo.review) && readGeneratedFiles(repo.generated_manifest).length > 0;
}

/** One `{type:"log"|"step"|"done"}` event of the `onboarding-{runId}` channel (services/onboarding/jobDispatcher.ts). */
export const jobProgressEventSchema = z.object({
  type: z.enum(["log", "step", "done"]),
  message: z.string().optional(),
  step: z.string().optional(),
  at: z.string().optional(),
});
export type JobProgressEvent = z.infer<typeof jobProgressEventSchema>;

/** POST /onboarding/runs/:id/start -- start the sandbox job (NO-03). */
export function useStartOnboardingRun() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (runId: string) => {
      const data = await apiClient.post<unknown>(`/api/v1/onboarding/runs/${runId}/start`);
      return onboardingRunSchema.parse(data);
    },
    onSuccess: (run) => {
      queryClient.setQueryData(onboardingKeys.run(run.id), run);
    },
  });
}

/** GET /onboarding/runs/:id/output -- review, generated files, baselines per repo (NO-04). 409 until the run is ready. */
export function useOnboardingOutput(runId: string | undefined, enabled: boolean): UseQueryResult<OnboardingRun> {
  return useQuery({
    queryKey: onboardingKeys.output(runId ?? ""),
    queryFn: async () => {
      const data = await apiClient.get<unknown>(`/api/v1/onboarding/runs/${runId}/output`);
      return onboardingRunSchema.parse(data);
    },
    enabled: enabled && !!runId,
    retry: false,
  });
}

/**
 * POST /onboarding/runs/:id/pull-requests -- open one PR per repository
 * (NO-05). The backend only acts on an explicit `{ confirm: true }` and is
 * idempotent, so a retry after a partial failure is safe.
 */
export function useOpenPullRequests() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (runId: string) => {
      const data = await apiClient.post<unknown>(`/api/v1/onboarding/runs/${runId}/pull-requests`, { confirm: true });
      return onboardingRunSchema.parse(data);
    },
    onSuccess: (run) => {
      queryClient.setQueryData(onboardingKeys.run(run.id), run);
      queryClient.setQueryData(onboardingKeys.output(run.id), run);
    },
  });
}
