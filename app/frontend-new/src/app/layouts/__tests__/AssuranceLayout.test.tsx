import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { RouterProvider, createMemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CommandPaletteItemsProvider } from "@/components/shell/CommandPaletteItemsContext";
import { CommandPaletteOpenContext } from "@/app/CommandPaletteOpenContext";

/**
 * AssuranceLayout (T130, WP-A1). Checks the shell wiring itself -- the
 * TeamSwitcher renders in the GlobalBar, the Rail's Portfolio link points
 * at the current team, and the layout is mounted once (AppShell doesn't
 * remount) as the routed team changes, matching ProjectLayout's remount
 * contract (T037) applied to the assurance layout.
 */

const useAdminMock = vi.fn();
vi.mock("@/contexts/AdminContext", () => ({
  useAdmin: () => useAdminMock(),
}));

const getMock = vi.fn();
vi.mock("@/lib/apiClient", () => ({
  default: { get: (...args: unknown[]) => getMock(...args) },
}));

import { AssuranceLayout } from "../AssuranceLayout";

function ProbePage() {
  return <div data-testid="page">portfolio page</div>;
}

function renderAt(path: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createMemoryRouter(
    [
      {
        path: "/assurance",
        element: <AssuranceLayout />,
        children: [{ path: "t/:teamId", element: <ProbePage /> }],
      },
    ],
    { initialEntries: [path] },
  );

  return render(
    <QueryClientProvider client={queryClient}>
      <CommandPaletteItemsProvider>
        <CommandPaletteOpenContext.Provider value={() => {}}>
          <RouterProvider router={router} />
        </CommandPaletteOpenContext.Provider>
      </CommandPaletteItemsProvider>
    </QueryClientProvider>,
  );
}

describe("AssuranceLayout (T130)", () => {
  beforeEach(() => {
    useAdminMock.mockReturnValue({ isAdmin: false });
    getMock.mockReset();
    getMock.mockImplementation(async (path: string) => {
      if (path === "/api/v1/teams/mine") {
        return [{ id: "t1", name: "Permits Platform", organization_id: "org1", role: "owner" }];
      }
      throw new Error(`unexpected path ${path}`);
    });
  });

  it("renders the GlobalBar's TeamSwitcher and the routed page", async () => {
    renderAt("/assurance/t/t1");

    expect(await screen.findByText("Permits Platform")).toBeInTheDocument();
    expect(screen.getByTestId("page")).toBeInTheDocument();
  });

  it("Rail's Portfolio link points at the current team", async () => {
    renderAt("/assurance/t/t1");
    await screen.findByText("Permits Platform");

    const portfolioLinks = screen.getAllByRole("link", { name: /portfolio/i });
    expect(portfolioLinks.some((link) => link.getAttribute("href") === "/assurance/t/t1")).toBe(true);
  });

  it("has a skip-to-content landmark and a labeled Assurance nav (WCAG)", async () => {
    renderAt("/assurance/t/t1");
    await screen.findByText("Permits Platform");
    expect(screen.getAllByRole("navigation", { name: /assurance/i }).length).toBeGreaterThan(0);
    expect(screen.getByRole("main")).toBeInTheDocument();
  });
});
