import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AppRuns } from "@/pages/assurance/AppRuns";
import { appRunsSchema, meshRunEvidenceSchema } from "../runs.api";

vi.mock("@/contexts/AdminContext", () => ({ useAdmin: () => ({ isAdmin: false }) }));

const getMock = vi.fn();
const postMock = vi.fn();
vi.mock("@/lib/apiClient", () => ({
  default: { get: (...a: unknown[]) => getMock(...a), post: (...a: unknown[]) => postMock(...a) },
}));

const channelMock = { on: vi.fn(), subscribe: vi.fn() };
channelMock.on.mockReturnValue(channelMock);
channelMock.subscribe.mockReturnValue(channelMock);
const removeChannel = vi.fn();
vi.mock("@/integrations/pronghorn-api/client", () => ({
  pronghornApi: { channel: () => channelMock, removeChannel: (...a: unknown[]) => removeChannel(...a) },
}));

const TEAM_ID = "00000000-0000-4000-8000-000000000801";
const APP_ID = "00000000-0000-4000-8000-000000000811";

function run(overrides: Record<string, unknown>) {
  return {
    id: "run-1",
    repository_id: "r1",
    repository_full_name: "e2e-goa/permits-api",
    commit_sha: "abcdef1234567890",
    pr_number: 210,
    pr_state: "open",
    trigger: "pull_request",
    pack_version: "2026.2",
    verdicts: { green: "pass", yellow: "warn", red: "pass", blue: "skip" },
    new_findings: 1,
    asvs_passed: 285,
    alberta_passed: 62,
    report_url: "https://example.test/report.json",
    received_at: "2026-09-28T15:00:00Z",
    ...overrides,
  };
}

const RUNS = {
  appId: APP_ID,
  days: 7,
  runsByDay: [
    { day: "2026-09-28", runs: [run({ id: "run-1" }), run({ id: "run-2", repository_full_name: "e2e-goa/permits-worker", pr_number: 211, pr_state: "merged", new_findings: 0 })] },
    { day: "2026-09-26", runs: [run({ id: "run-3", pr_number: 205, pr_state: "merged", new_findings: 0 })] },
  ],
};

function LocationProbe() {
  const loc = useLocation();
  return <div data-testid="loc">{loc.search}</div>;
}

function renderPage(search = "") {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/assurance/t/${TEAM_ID}/apps/${APP_ID}/runs${search}`]}>
        <Routes>
          <Route path="/assurance/t/:teamId/apps/:appId/runs" element={<><AppRuns /><LocationProbe /></>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function mockApi(runs: unknown = RUNS) {
  getMock.mockImplementation(async (path: string) => {
    if (path === "/api/v1/teams/mine") return [{ id: TEAM_ID, name: "Permits Platform", organization_id: "o", role: "owner" }];
    if (path === `/api/v1/applications/${APP_ID}`) return { id: APP_ID, name: "Permits API" };
    if (path.startsWith(`/api/v1/applications/${APP_ID}/runs`)) return runs;
    if (path === "/api/v1/mesh/runs/run-1") return { ...run({ id: "run-1" }), application_id: APP_ID, base_branch: "main" };
    throw new Error(`unexpected path ${path}`);
  });
}

describe("runs schemas", () => {
  it("parses the runs-by-day and evidence payloads", () => {
    expect(appRunsSchema.parse(RUNS).runsByDay).toHaveLength(2);
    expect(meshRunEvidenceSchema.parse({ ...run({}), application_id: APP_ID }).id).toBe("run-1");
  });
});

describe("AppRuns (NA-05)", () => {
  beforeEach(() => {
    getMock.mockReset();
    postMock.mockReset();
    removeChannel.mockReset();
  });

  it("groups runs by day, defaults to 7 days and shows PR state", async () => {
    mockApi();
    renderPage();
    expect(await screen.findAllByTestId("assurance-runs-day")).toHaveLength(2);
    expect(screen.getAllByTestId("assurance-run-row")).toHaveLength(3);
    expect(screen.getByText("PR #211 · merged")).toBeInTheDocument();
    expect(getMock).toHaveBeenCalledWith(`/api/v1/applications/${APP_ID}/runs?days=7`);
  });

  it("switching the window is URL-held and refetches", async () => {
    mockApi();
    renderPage();
    await screen.findAllByTestId("assurance-run-row");
    await userEvent.click(screen.getByRole("button", { name: "Last 30 days" }));
    expect(screen.getByTestId("loc").textContent).toContain("days=30");
    await waitFor(() => expect(getMock).toHaveBeenCalledWith(`/api/v1/applications/${APP_ID}/runs?days=30`));
  });

  it("expands a run's evidence, and opens an issue after confirmation", async () => {
    mockApi();
    postMock.mockResolvedValue({ created: true, issueRef: "#42" });
    renderPage();
    const rows = await screen.findAllByTestId("assurance-run-row");
    await userEvent.click(rows[0]);
    expect(screen.getByTestId("loc").textContent).toContain("run=run-1");
    const evidence = await screen.findByTestId("assurance-run-evidence");
    expect(within(evidence).getByTestId("assurance-run-verdict-yellow")).toHaveTextContent("Warning");
    expect(within(evidence).getByRole("link", { name: "Open the full report" })).toHaveAttribute("href", "https://example.test/report.json");

    await userEvent.click(within(evidence).getByRole("button", { name: "Open an issue" }));
    expect(postMock).not.toHaveBeenCalled();
    await userEvent.click(within(evidence).getByRole("button", { name: /open an issue for the new findings/i }));
    await waitFor(() => expect(postMock).toHaveBeenCalledWith("/api/v1/mesh/runs/run-1/issue", {}));
    expect(await screen.findByTestId("assurance-run-issue-result")).toHaveTextContent("Issue opened: #42");
  });

  it("explains a ?run outside the window, and can widen the window or clear it", async () => {
    mockApi();
    renderPage("?run=run-old");
    expect(await screen.findByTestId("assurance-run-missing")).toHaveTextContent("not in the last 7 days");
    await userEvent.click(screen.getByRole("button", { name: "Show the last 14 days" }));
    expect(screen.getByTestId("loc").textContent).toContain("days=14");
    expect(screen.getByTestId("loc").textContent).toContain("run=run-old");
    await userEvent.click(await screen.findByRole("button", { name: "Clear selection" }));
    await waitFor(() => expect(screen.queryByTestId("assurance-run-missing")).not.toBeInTheDocument());
    expect(screen.getByTestId("loc").textContent).not.toContain("run=");
  });

  it("shows an empty state when there are no runs", async () => {
    mockApi({ appId: APP_ID, days: 7, runsByDay: [] });
    renderPage();
    expect(await screen.findByText("No mesh runs in the last 7 days")).toBeInTheDocument();
  });

  it("shows an error state and unsubscribes on unmount", async () => {
    getMock.mockImplementation(async (path: string) => {
      if (path.includes("/runs")) throw new Error("boom");
      return path === "/api/v1/teams/mine" ? [] : { id: APP_ID, name: "Permits API" };
    });
    const { unmount } = renderPage();
    expect(await screen.findByText("Couldn't load mesh runs")).toBeInTheDocument();
    unmount();
    expect(removeChannel).toHaveBeenCalled();
  });
});
