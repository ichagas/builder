import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import Dashboard from "../Dashboard";

/**
 * T040 (WP-P2): Dashboard's tabs (My Projects / Shared / Gallery) move
 * into the URL via useUrlState (plan.md "the move and restyle recipe"
 * step 3), replacing the page's old `useState("my-projects")`. This test
 * covers what's specific to Dashboard -- that switching tabs writes
 * `?tab=...` and that the initial tab is read back from the URL --
 * rather than re-testing useUrlState itself, which already has its own
 * unit tests at src/lib/state/__tests__/useUrlState.test.tsx.
 */

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { id: "user-1" }, loading: false }),
}));

vi.mock("@/hooks/useAnonymousProjects", () => ({
  useAnonymousProjects: () => ({ projects: [], removeProject: vi.fn() }),
}));

vi.mock("@/lib/apiClient", () => ({
  default: {
    get: vi.fn().mockResolvedValue([]),
    post: vi.fn().mockResolvedValue({ data: [], error: null }),
  },
}));

vi.mock("@/integrations/pronghorn-api/client", () => ({
  pronghornApi: { rpc: vi.fn(), from: vi.fn() },
}));

function LocationProbe() {
  const location = useLocation();
  return <span data-testid="search">{location.search}</span>;
}

function renderDashboard(initialEntries: string[]) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={initialEntries}>
        <LocationProbe />
        <Dashboard />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("Dashboard tabs in the URL", () => {
  afterEach(() => vi.clearAllMocks());

  it("defaults to My Projects with no ?tab= param when none is in the URL", async () => {
    renderDashboard(["/projects"]);
    expect(await screen.findByRole("tab", { name: /My Projects/i })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByTestId("search").textContent).toBe("");
  });

  it("reads the initial tab from the URL", async () => {
    renderDashboard(["/projects?tab=gallery"]);
    expect(await screen.findByRole("tab", { name: /Gallery/i })).toHaveAttribute("aria-selected", "true");
  });

  it("switching tabs writes ?tab= into the URL (replace, not push)", async () => {
    const user = userEvent.setup();
    renderDashboard(["/projects"]);
    const sharedTab = await screen.findByRole("tab", { name: /Shared Projects/i });
    await act(async () => {
      await user.click(sharedTab);
    });
    expect(screen.getByTestId("search").textContent).toBe("?tab=shared-projects");
    expect(sharedTab).toHaveAttribute("aria-selected", "true");
  });
});
