import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import Build from "../Build";

/**
 * T048 (WP-B1): Build's desktop workspace tabs (Chat/Staging/History) and
 * mobile tabs (Files/Editor/Chat/Stage) move into the URL via useUrlState
 * (plan.md "the move and restyle recipe" step 3), replacing the page's old
 * `useState("chat")`/`useState("files")`. This covers what's specific to
 * Build -- the initial tab is read back from the URL, with no `?tab=`
 * param written for the default -- rather than re-testing useUrlState
 * itself, which already has its own unit tests at
 * src/lib/state/__tests__/useUrlState.test.tsx.
 *
 * Everything Build loads over the network (repos, files, staged changes,
 * realtime channels) is mocked out so the page renders deterministically
 * with no repo/files yet -- the same "no build activity yet" state
 * e2e/regression/pr-10.spec.ts exercises against a live stack.
 */

vi.mock("@/integrations/pronghorn-api/client", () => {
  const chain = {
    on: vi.fn(() => chain),
    subscribe: vi.fn((cb?: (status: string) => void) => {
      cb?.("SUBSCRIBED");
      return chain;
    }),
    send: vi.fn().mockResolvedValue(undefined),
  };
  return {
    pronghornApi: {
      rpc: vi.fn().mockResolvedValue({ data: [], error: null }),
      channel: vi.fn(() => chain),
      removeChannel: vi.fn(),
    },
  };
});

// UnifiedAgentInterface (Build's Chat tab) is exercised on its own terms
// elsewhere (it isn't specific to tabs-in-the-URL); its full dependency
// tree (ProjectSelector -> DocsViewer -> ResourceManager -> AdminContext ->
// AuthContext -> msalConfig, a real fetch to /data/*.json for prompt
// templates, IntersectionObserver, ...) has nothing to do with what this
// file covers, so it's stubbed out to a minimal placeholder that still
// participates in Tabs like the real component does.
vi.mock("@/components/build/UnifiedAgentInterface", () => ({
  UnifiedAgentInterface: () => <div>Agent chat</div>,
}));

function LocationProbe() {
  const location = useLocation();
  return <span data-testid="search">{location.search}</span>;
}

function renderBuild(initialEntries: string[]) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <LocationProbe />
      <Routes>
        <Route path="/p/:projectId/v/current/build/agent" element={<Build />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("Build tabs in the URL", () => {
  afterEach(() => vi.clearAllMocks());

  it("defaults to the Chat workspace tab with no ?tab= param when none is in the URL", async () => {
    renderBuild(["/p/proj-1/v/current/build/agent"]);
    expect(await screen.findByRole("tab", { name: "Chat" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByTestId("search").textContent).toBe("");
  });

  it("reads the initial desktop tab from the URL", async () => {
    renderBuild(["/p/proj-1/v/current/build/agent?tab=history"]);
    expect(await screen.findByRole("tab", { name: "History" })).toHaveAttribute("aria-selected", "true");
  });
});
