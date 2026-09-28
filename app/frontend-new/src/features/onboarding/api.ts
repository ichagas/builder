import { z } from "zod";
import { useMutation, useQuery, useQueryClient, type UseQueryResult } from "@tanstack/react-query";
import apiClient from "@/lib/apiClient";

/**
 * Onboarding API (T150, WP-O1). Typed TanStack Query hooks over the B3
 * endpoints (contracts/api.md "B3: Onboarding"), validated with zod per
 * contracts/api.md §1. Covers steps 1-2 of the five-step wizard (team & app,
 * connect repos) -- `app/backend/src/routes/onboarding.ts` /
 * `services/onboarding/**` (WP-BE5, merged). Steps 3-5 (sandbox, output,
 * pull requests) and the `onboarding-{runId}` realtime channel are WP-O2
 * (T151).
 *
 * Response shapes match `services/onboarding/repository.ts`'s
 * `OnboardingRunRow`/`OnboardingRunRepositoryRow` (snake_case, as returned
 * verbatim by `routes/onboarding.ts`) and `services/onboarding/index.ts`'s
 * `OnboardingRunView` (adds `repositories`/`warnings`), plus
 * `githubImport.ts#ImportableRepository` / `azureImport.ts#ImportableAzureRepository`.
 */

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

export const onboardingStatusSchema = z.enum([
  "draft",
  "running",
  "ready",
  "prs_open",
  "completed",
  "failed",
  "cancelled",
]);
export type OnboardingStatus = z.infer<typeof onboardingStatusSchema>;

export const onboardingStepSchema = z.enum(["team", "connect", "sandbox", "output", "prs"]);
export type OnboardingStep = z.infer<typeof onboardingStepSchema>;

/** One `onboarding_run_repositories` row (data-model.md §3). */
export const onboardingRunRepositorySchema = z.object({
  id: z.string(),
  run_id: z.string(),
  full_name: z.string(),
  selected: z.boolean(),
  detected_profile: z.string().nullable(),
  detected_stack: z.string().nullable(),
  detected_build: z.string().nullable(),
  detected_ci: z.string().nullable(),
  part: z.string().nullable(),
  review: z.record(z.unknown()),
  generated_manifest: z.array(z.unknown()),
  baseline_counts: z.record(z.unknown()),
  pr_number: z.number().nullable(),
  pr_state: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});
export type OnboardingRunRepository = z.infer<typeof onboardingRunRepositorySchema>;

/** GET/POST/PUT `.../runs[/:id]` -- `OnboardingRunView` (run + repositories + warnings). */
export const onboardingRunSchema = z.object({
  id: z.string(),
  team_id: z.string(),
  application_name: z.string(),
  application_id: z.string().nullable(),
  pack_version: z.string().nullable(),
  status: onboardingStatusSchema,
  step: onboardingStepSchema,
  job_execution_id: z.string().nullable(),
  log_blob: z.string().nullable(),
  connection_id: z.string().nullable(),
  sandbox_secret_names: z.array(z.string()),
  started_by: z.string(),
  pr_lease_until: z.string().nullable(),
  pr_lease_owner: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
  repositories: z.array(onboardingRunRepositorySchema),
  /** Fix round 1, item 10 (contracts/api.md): per-repository warnings, plus the "blocked" case. */
  warnings: z.array(z.string()),
});
export type OnboardingRun = z.infer<typeof onboardingRunSchema>;

/** GET /onboarding/github/repos row (`githubImport.ts#ImportableRepository`). */
export const importableGitHubRepositorySchema = z.object({
  fullName: z.string(),
  defaultBranch: z.string(),
  private: z.boolean(),
  archived: z.boolean(),
  htmlUrl: z.string(),
});
export type ImportableGitHubRepository = z.infer<typeof importableGitHubRepositorySchema>;

/** GET /onboarding/azure/repos row (`azureImport.ts#ImportableAzureRepository`). */
export const importableAzureRepositorySchema = z.object({
  fullName: z.string(),
  adoOrg: z.string(),
  project: z.string(),
  defaultBranch: z.string(),
  disabled: z.boolean(),
});
export type ImportableAzureRepository = z.infer<typeof importableAzureRepositorySchema>;

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export const onboardingKeys = {
  run: (runId: string) => ["onboarding", "runs", runId] as const,
  githubImport: (teamId: string, query: string) => ["onboarding", "github-repos", teamId, query] as const,
  azureImport: (teamId: string, query: string) => ["onboarding", "azure-repos", teamId, query] as const,
};

/** GET /onboarding/runs/:id -- wizard state (NO-01, NO-02). */
export function useOnboardingRun(runId: string | undefined): UseQueryResult<OnboardingRun> {
  return useQuery({
    queryKey: onboardingKeys.run(runId ?? ""),
    queryFn: async () => {
      const data = await apiClient.get<unknown>(`/api/v1/onboarding/runs/${runId}`);
      return onboardingRunSchema.parse(data);
    },
    enabled: !!runId,
  });
}

/**
 * GET /onboarding/github/repos?teamId=&q= -- import list (NO-02). Scoped
 * server-side to the team's organization's configured `github_app`
 * connection (contracts/api.md); an organization with none configured gets
 * `[]`, never every installation repository.
 */
export function useGitHubImportRepos(
  teamId: string | undefined,
  query: string,
  enabled: boolean,
): UseQueryResult<ImportableGitHubRepository[]> {
  return useQuery({
    queryKey: onboardingKeys.githubImport(teamId ?? "", query),
    queryFn: async () => {
      const params = new URLSearchParams({ teamId: teamId ?? "" });
      if (query) params.set("q", query);
      const data = await apiClient.get<unknown>(`/api/v1/onboarding/github/repos?${params.toString()}`);
      return z.array(importableGitHubRepositorySchema).parse((data as { repositories?: unknown }).repositories ?? []);
    },
    enabled: enabled && !!teamId,
    retry: false,
  });
}

/**
 * GET /onboarding/azure/repos?teamId=&q= -- import list (NO-02), via the
 * organization's default `azure_devops` connection.
 */
export function useAzureImportRepos(
  teamId: string | undefined,
  query: string,
  enabled: boolean,
): UseQueryResult<ImportableAzureRepository[]> {
  return useQuery({
    queryKey: onboardingKeys.azureImport(teamId ?? "", query),
    queryFn: async () => {
      const params = new URLSearchParams({ teamId: teamId ?? "" });
      if (query) params.set("q", query);
      const data = await apiClient.get<unknown>(`/api/v1/onboarding/azure/repos?${params.toString()}`);
      return z.array(importableAzureRepositorySchema).parse((data as { repositories?: unknown }).repositories ?? []);
    },
    enabled: enabled && !!teamId,
    retry: false,
  });
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export interface CreateOnboardingRunInput {
  teamId: string;
  applicationName: string;
}

/** POST /onboarding/runs -- create a draft (NO-01, step "team"). */
export function useCreateOnboardingRun() {
  return useMutation({
    mutationFn: async (input: CreateOnboardingRunInput) => {
      const data = await apiClient.post<unknown>("/api/v1/onboarding/runs", input);
      return onboardingRunSchema.parse(data);
    },
  });
}

export interface SetRunRepositoriesInput {
  runId: string;
  fullNames: string[];
}

/**
 * PUT /onboarding/runs/:id/repositories -- selected repos (NO-02). Full
 * replace: `fullNames` is the complete desired selection, not a delta. 403
 * for a repository outside the organization's configured scope, 422 for a
 * case-insensitive duplicate or malformed name (contracts/api.md).
 */
export function useSetRunRepositories() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ runId, fullNames }: SetRunRepositoriesInput) => {
      const data = await apiClient.put<unknown>(`/api/v1/onboarding/runs/${runId}/repositories`, {
        repositories: fullNames.map((fullName) => ({ fullName, selected: true })),
      });
      return onboardingRunSchema.parse(data);
    },
    onSuccess: (run) => {
      queryClient.setQueryData(onboardingKeys.run(run.id), run);
    },
  });
}

/** POST /onboarding/runs/:id/cancel -- cancel (NO-01/NO-02, any non-terminal step). */
export function useCancelOnboardingRun() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (runId: string) => {
      const data = await apiClient.post<unknown>(`/api/v1/onboarding/runs/${runId}/cancel`);
      return onboardingRunSchema.parse(data);
    },
    onSuccess: (run) => {
      queryClient.setQueryData(onboardingKeys.run(run.id), run);
    },
  });
}
