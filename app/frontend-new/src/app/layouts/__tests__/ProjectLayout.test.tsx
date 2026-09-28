import * as React from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { RouterProvider, createMemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CommandPaletteItemsProvider } from "@/components/shell/CommandPaletteItemsContext";
import { CommandPaletteOpenContext } from "@/app/CommandPaletteOpenContext";

/**
 * ProjectLayout loader tests (T041, WP-P3). See plan.md "the move and
 * restyle recipe" and the ProjectLayoutData doc comment in ../ProjectLayout:
 * project, role and the current (D-7 "building") version are loaded once
 * by ProjectLayout and exposed through `useProjectLayoutData` so a project
 * route *can* read them without running its own copy of the fetch.
 */

const { mockRpc, mockChannelOn, mockChannelSubscribe, mockRemoveChannel } = vi.hoisted(() => ({
  mockRpc: vi.fn(),
  mockChannelOn: vi.fn(),
  mockChannelSubscribe: vi.fn(),
  mockRemoveChannel: vi.fn(),
}));

vi.mock("@/integrations/pronghorn-api/client", () => ({
  pronghornApi: {
    rpc: mockRpc,
    channel: () => {
      const chan = {
        on: (...args: unknown[]) => {
          mockChannelOn(...args);
          return chan;
        },
        subscribe: (...args: unknown[]) => {
          mockChannelSubscribe(...args);
          return chan;
        },
        send: vi.fn(),
      };
      return chan;
    },
    removeChannel: mockRemoveChannel,
  },
}));

// `useVersions` (T110, WP-V1) goes through `apiClient`, not `pronghornApi` --
// mocked separately so these loader tests stay deterministic (no real
// fetch) and exercise the "no versions yet" fallback (D-7 "Building").
const { mockApiGet } = vi.hoisted(() => ({ mockApiGet: vi.fn() }));
vi.mock("@/lib/apiClient", () => ({
  default: { get: (...args: unknown[]) => mockApiGet(...args) },
}));

import { ProjectLayout, useProjectLayoutData, CURRENT_VERSION } from "../ProjectLayout";

function ProbePage() {
  const data = useProjectLayoutData();
  return (
    <div>
      <div data-testid="project-name">{data.project?.name ?? "loading"}</div>
      <div data-testid="role">{data.role ?? "none"}</div>
      <div data-testid="is-owner">{String(data.isOwner)}</div>
      <div data-testid="version">{data.currentVersion.id}</div>
    </div>
  );
}

function renderAt(path: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createMemoryRouter(
    [
      {
        path: "/p/:projectId",
        element: <ProjectLayout />,
        children: [{ path: "v/current/define/requirements", element: <ProbePage /> }],
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

describe("ProjectLayout loader (T041)", () => {
  beforeEach(() => {
    mockRpc.mockReset();
    mockChannelOn.mockReset();
    mockChannelSubscribe.mockReset();
    mockRemoveChannel.mockReset();
    mockApiGet.mockReset();
    mockApiGet.mockResolvedValue([]); // no versions yet -> falls back to the single "Building" node (D-7)
  });

  it("loads the project and role once and exposes them via useProjectLayoutData", async () => {
    mockRpc.mockImplementation(async (fn: string) => {
      if (fn === "get_project_with_token") {
        return { data: { id: "proj-1", name: "Acme project" }, error: null };
      }
      if (fn === "authorize_project_access") {
        return { data: "owner", error: null };
      }
      return { data: null, error: null };
    });

    renderAt("/p/proj-1/v/current/define/requirements");

    await waitFor(() => expect(screen.getByTestId("project-name").textContent).toBe("Acme project"));
    expect(screen.getByTestId("role").textContent).toBe("owner");
    expect(screen.getByTestId("is-owner").textContent).toBe("true");
    expect(screen.getByTestId("version").textContent).toBe(CURRENT_VERSION.id);
  });

  it("shows a read-only access banner for a viewer share token but not for an owner", async () => {
    mockRpc.mockImplementation(async (fn: string) => {
      if (fn === "get_project_with_token") {
        return { data: { id: "proj-1", name: "Acme project" }, error: null };
      }
      if (fn === "authorize_project_access") {
        return { data: "viewer", error: null };
      }
      return { data: null, error: null };
    });

    renderAt("/p/proj-1/v/current/define/requirements?t=viewer-token-123");

    await waitFor(() => expect(screen.getByTestId("role").textContent).toBe("viewer"));
    expect(await screen.findByText("Read-only access")).toBeInTheDocument();
  });

  it("scopes to the real current version once GET /versions resolves (T110, WP-V1)", async () => {
    mockRpc.mockImplementation(async (fn: string) => {
      if (fn === "get_project_with_token") {
        return { data: { id: "proj-1", name: "Acme project" }, error: null };
      }
      if (fn === "authorize_project_access") {
        return { data: "owner", error: null };
      }
      return { data: null, error: null };
    });
    mockApiGet.mockResolvedValue([
      {
        id: "ver-1",
        project_id: "proj-1",
        name: "v1.4.2",
        kind: "released",
        is_current: true,
        is_first_release: false,
        released_at: "2026-08-01T00:00:00Z",
        released_by: null,
        release_notes: null,
        git_tag: "v1.4.2",
        created_at: "2026-08-01T00:00:00Z",
        updated_at: "2026-08-01T00:00:00Z",
        work_item_count: 0,
        active_work_item_count: 0,
      },
    ]);

    renderAt("/p/proj-1/v/current/define/requirements");

    await waitFor(() => expect(screen.getByTestId("version").textContent).toBe("ver-1"));
  });

  it("throws a clear error if useProjectLayoutData is used outside ProjectLayout", () => {
    function Bare() {
      useProjectLayoutData();
      return null;
    }
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<Bare />)).toThrow(/useProjectLayoutData must be used within/);
    spy.mockRestore();
  });
});
