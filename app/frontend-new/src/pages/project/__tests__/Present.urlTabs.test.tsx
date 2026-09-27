import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import Present from "../Present";

/**
 * T053 (WP-S3): Present's tabs (Presentations / Editor / Blackboard) move
 * into the URL via useUrlState (plan.md "the move and restyle recipe" step
 * 3), replacing the page's old `useState("list")`. This covers what's
 * specific to Present -- the initial tab is read back from the URL, with no
 * `?tab=` param written for the default -- rather than re-testing
 * useUrlState itself, which already has its own unit tests at
 * src/lib/state/__tests__/useUrlState.test.tsx.
 */

vi.mock("@/lib/apiClient", () => ({
  default: {
    post: vi.fn().mockResolvedValue({ data: [], error: null }),
  },
  getAccessToken: vi.fn().mockResolvedValue(null),
}));

function LocationProbe() {
  const location = useLocation();
  return <span data-testid="search">{location.search}</span>;
}

function renderPresent(initialEntries: string[]) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <LocationProbe />
      <Routes>
        <Route path="/p/:projectId/present" element={<Present />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("Present tabs in the URL", () => {
  afterEach(() => vi.clearAllMocks());

  it("defaults to the Presentations tab with no ?tab= param when none is in the URL", async () => {
    renderPresent(["/p/proj-1/present"]);
    expect(await screen.findByRole("tab", { name: "Presentations" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByTestId("search").textContent).toBe("");
  });

  it("reads the initial tab from the URL", async () => {
    renderPresent(["/p/proj-1/present?tab=blackboard"]);
    expect(await screen.findByRole("tab", { name: "Blackboard" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("Select a presentation to view its blackboard")).toBeInTheDocument();
  });
});
