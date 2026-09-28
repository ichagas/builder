import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import Repository from "../Repository";

/**
 * T049 (WP-B2): Repository's tabs (Repositories / Sync / Upload / Manage)
 * move into the URL via useUrlState (plan.md "the move and restyle
 * recipe" step 3), replacing the page's old uncontrolled
 * `<Tabs defaultValue="repos">`. This covers what's specific to Repository
 * -- the initial tab is read back from the URL, and switching tabs writes
 * `?tab=...` with no param for the default -- rather than re-testing
 * useUrlState itself, which already has its own unit tests at
 * src/lib/state/__tests__/useUrlState.test.tsx.
 */

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { id: "user-1" }, loading: false }),
}));

vi.mock("@/contexts/AdminContext", () => ({
  useAdmin: () => ({ isAdmin: false, isSuperAdmin: false, role: "user", loading: false }),
}));

vi.mock("@/hooks/useShareToken", () => ({
  useShareToken: () => ({ token: null, isTokenSet: true, tokenMissing: false }),
}));

vi.mock("@/hooks/useRealtimeRepos", () => ({
  useRealtimeRepos: () => ({ repos: [], loading: false, refetch: vi.fn() }),
}));

// GitHubConnectBanner's useGitHubAuth hook hits the real network in jsdom
// otherwise (no fetch mock), which can time out the click test below.
vi.mock("@/hooks/useGitHubAuth", () => ({
  useGitHubAuth: () => ({
    connected: false,
    githubUsername: null,
    loading: false,
    error: null,
    connect: vi.fn(),
    disconnect: vi.fn(),
  }),
}));

vi.mock("@/integrations/pronghorn-api/client", () => ({
  pronghornApi: {
    rpc: vi.fn().mockResolvedValue({ data: [], error: null }),
    functions: { invoke: vi.fn().mockResolvedValue({ data: null, error: null }) },
  },
}));

function LocationProbe() {
  const location = useLocation();
  return <span data-testid="search">{location.search}</span>;
}

function renderRepository(initialEntries: string[]) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <LocationProbe />
      <Routes>
        <Route path="/p/:projectId/repository" element={<Repository />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("Repository tabs in the URL", () => {
  afterEach(() => vi.clearAllMocks());

  it("defaults to the Repositories tab with no ?tab= param when none is in the URL", async () => {
    renderRepository(["/p/proj-1/repository"]);
    expect(await screen.findByRole("tab", { name: "Repositories" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByTestId("search").textContent).toBe("");
  });

  it("reads the initial tab from the URL", async () => {
    renderRepository(["/p/proj-1/repository?tab=sync"]);
    expect(await screen.findByRole("tab", { name: "Sync" })).toHaveAttribute("aria-selected", "true");
  });

  it("switching tabs writes ?tab= into the URL (replace, not push)", async () => {
    const user = userEvent.setup();
    renderRepository(["/p/proj-1/repository"]);
    const uploadTab = await screen.findByRole("tab", { name: "Upload" });
    await act(async () => {
      await user.click(uploadTab);
    });
    expect(screen.getByTestId("search").textContent).toBe("?tab=upload");
    expect(uploadTab).toHaveAttribute("aria-selected", "true");
  });
});
