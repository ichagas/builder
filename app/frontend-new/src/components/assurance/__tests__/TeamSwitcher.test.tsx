import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TeamSwitcher } from "../TeamSwitcher";

const useAdminMock = vi.fn();
vi.mock("@/contexts/AdminContext", () => ({
  useAdmin: () => useAdminMock(),
}));

const getMock = vi.fn();
vi.mock("@/lib/apiClient", () => ({
  default: { get: (...args: unknown[]) => getMock(...args) },
}));

function Location() {
  return <span data-testid="path">{useLocation().pathname}</span>;
}

function renderSwitcher(initialPath = "/assurance/t/t1") {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialPath]}>
        <Routes>
          <Route path="/assurance/t/:teamId" element={<><TeamSwitcher /><Location /></>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("TeamSwitcher", () => {
  beforeEach(() => {
    getMock.mockReset();
    useAdminMock.mockReturnValue({ isAdmin: false });
  });

  it("lists the caller's teams and switches on selection (NA-01)", async () => {
    getMock.mockImplementation(async (path: string) => {
      if (path === "/api/v1/teams/mine") {
        return [
          { id: "t1", name: "Permits Platform", organization_id: "org1", role: "owner" },
          { id: "t2", name: "Licensing", organization_id: "org1", role: "member" },
        ];
      }
      throw new Error(`unexpected path ${path}`);
    });

    const user = userEvent.setup();
    renderSwitcher();

    await screen.findByText("Permits Platform");
    await user.click(screen.getByRole("button", { name: /switch team/i }));
    expect(await screen.findByRole("menuitem", { name: /licensing/i })).toBeInTheDocument();

    await user.click(screen.getByRole("menuitem", { name: /licensing/i }));
    await waitFor(() => expect(screen.getByTestId("path").textContent).toBe("/assurance/t/t2"));
  });

  it("shows every organization team for org admins (D-8), not just the caller's own", async () => {
    useAdminMock.mockReturnValue({ isAdmin: true });
    getMock.mockImplementation(async (path: string) => {
      if (path === "/api/v1/teams/mine") {
        return [{ id: "t1", name: "Permits Platform", organization_id: "org1", role: "owner" }];
      }
      if (path === "/api/v1/teams") {
        return [
          { id: "t1", name: "Permits Platform", organization_id: "org1", member_count: "2", application_count: "2" },
          { id: "t2", name: "Licensing", organization_id: "org1", member_count: "1", application_count: "1" },
        ];
      }
      throw new Error(`unexpected path ${path}`);
    });

    const user = userEvent.setup();
    renderSwitcher();

    await screen.findByText("Permits Platform");
    await user.click(screen.getByRole("button", { name: /switch team/i }));

    // t1 is already in "your teams"; t2 is org-admin-only visibility via /teams.
    expect(await screen.findByText(/all teams/i)).toBeInTheDocument();
    const menuItems = screen.getAllByRole("menuitem");
    expect(menuItems.some((el) => /licensing/i.test(el.textContent ?? ""))).toBe(true);
    // t1 shouldn't be duplicated under "All teams".
    expect(menuItems.filter((el) => /permits platform/i.test(el.textContent ?? ""))).toHaveLength(1);
  });

  it("doesn't show All teams for non-admins", async () => {
    getMock.mockImplementation(async (path: string) => {
      if (path === "/api/v1/teams/mine") {
        return [{ id: "t1", name: "Permits Platform", organization_id: "org1", role: "owner" }];
      }
      throw new Error(`unexpected path ${path}`);
    });

    const user = userEvent.setup();
    renderSwitcher();

    await screen.findByText("Permits Platform");
    await user.click(screen.getByRole("button", { name: /switch team/i }));
    expect(screen.queryByText(/all teams/i)).not.toBeInTheDocument();
    expect(getMock).not.toHaveBeenCalledWith("/api/v1/teams");
  });
});
