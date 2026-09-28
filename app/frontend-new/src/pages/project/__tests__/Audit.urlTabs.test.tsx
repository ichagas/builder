import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import Audit from "../Audit";

/**
 * T052 (WP-S2): Audit's tabs (Activity / Graph / Tesseract / Results) move
 * into the URL via useUrlState (plan.md "the move and restyle recipe" step
 * 3), replacing the page's old `defaultValue="activity"`. This covers
 * what's specific to Audit -- the initial tab is read back from the URL,
 * with no `?tab=` param written for the default -- rather than re-testing
 * useUrlState itself, which already has its own unit tests at
 * src/lib/state/__tests__/useUrlState.test.tsx. The tab content only
 * renders once a session is loaded, so this mocks useRealtimeAudit to
 * return a loaded session rather than driving the real data hooks.
 */

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { id: "user-1" }, loading: false }),
}));

vi.mock("@/contexts/AdminContext", () => ({
  useAdmin: () => ({ isAdmin: false, isSuperAdmin: false, role: "user", loading: false }),
}));

vi.mock("@/hooks/useShareToken", () => ({
  useShareToken: () => ({ token: "share-token", isTokenSet: true, tokenMissing: false }),
}));

vi.mock("@/hooks/useRealtimeAudit", () => ({
  useRealtimeAudit: () => ({
    session: {
      id: "session-1",
      name: "Test session",
      status: "completed",
      current_iteration: 1,
      max_iterations: 100,
      dataset_1_type: "requirements",
      dataset_2_type: "artifacts",
      dataset_2_ids: ["a1"],
      consensus_reached: false,
      venn_result: null,
      phase: null,
    },
    tesseractCells: [],
    graphNodes: [],
    graphEdges: [],
    activityStream: [],
    isLoading: false,
    error: null,
    createSession: vi.fn(),
    updateSessionStatus: vi.fn(),
    refreshSession: vi.fn(),
    pruneOrphanNodes: vi.fn(),
    setLocalSession: vi.fn(),
    saveAuditData: vi.fn(),
  }),
}));

vi.mock("@/hooks/useAuditPipeline", () => ({
  useAuditPipeline: () => ({
    runPipeline: vi.fn(),
    isRunning: false,
    progress: { phase: "idle", message: "", progress: 0 },
    steps: [],
    error: null,
    results: null,
    clearResults: vi.fn(),
    restartStep: vi.fn(),
    reconstructStepsFromActivity: vi.fn(),
    stepMode: false,
    setStepMode: vi.fn(),
    pausedAfterStep: undefined,
    continueToNextStep: vi.fn(),
  }),
}));

vi.mock("@/lib/apiClient", () => ({
  default: {
    post: vi.fn().mockResolvedValue({ data: [], error: null }),
    get: vi.fn().mockResolvedValue({ data: [], error: null }),
  },
  getAccessToken: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/integrations/pronghorn-api/client", () => ({
  pronghornApi: {
    rpc: vi.fn().mockResolvedValue({ data: [], error: null }),
    functions: { invoke: vi.fn() },
  },
}));

function LocationProbe() {
  const location = useLocation();
  return <span data-testid="search">{location.search}</span>;
}

function renderAudit(initialEntries: string[]) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <LocationProbe />
      <Routes>
        <Route path="/p/:projectId/audit" element={<Audit />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("Audit tabs in the URL", () => {
  afterEach(() => vi.clearAllMocks());

  it("defaults to the Activity tab with no ?tab= param when none is in the URL", async () => {
    renderAudit(["/p/proj-1/audit"]);
    expect(await screen.findByRole("tab", { name: /Activity/i })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByTestId("search").textContent).toBe("");
  });

  it("reads the initial tab from the URL", async () => {
    renderAudit(["/p/proj-1/audit?tab=results"]);
    expect(await screen.findByRole("tab", { name: /Results/i })).toHaveAttribute("aria-selected", "true");
  });
});
