import type { OnboardingRun, OnboardingRunRepository } from "../api";

export function makeRepo(overrides: Partial<OnboardingRunRepository> = {}): OnboardingRunRepository {
  return {
    id: "r1",
    run_id: "run1",
    full_name: "e2e-goa/api",
    selected: true,
    detected_profile: "node",
    detected_stack: "Node.js",
    detected_build: "npm ci && npm run build",
    detected_ci: "github_actions",
    part: "APIs",
    review: {},
    generated_manifest: [{ path: ".github/workflows/mesh.yml", content: "name: mesh" }],
    baseline_counts: { green: 3, yellow: 1, red: 0, blue: 2 },
    pr_number: null,
    pr_state: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

export function makeRun(overrides: Partial<OnboardingRun> = {}): OnboardingRun {
  return {
    id: "run1",
    team_id: "t1",
    application_name: "Permits",
    application_id: null,
    pack_version: null,
    status: "draft",
    step: "sandbox",
    job_execution_id: null,
    log_blob: null,
    connection_id: null,
    sandbox_secret_names: [],
    started_by: "u1",
    pr_lease_until: null,
    pr_lease_owner: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    repositories: [makeRepo()],
    warnings: [],
    ...overrides,
  };
}
