import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Versions } from "../Versions";

/**
 * Versions page tests (T110, WP-V1, NV-02). Mirrors TeamPortfolio.test.tsx's
 * (WP-A1) pattern: mock `apiClient` and the realtime channel, mock the
 * layout hook this page reads from (`useProjectLayoutData`), then assert on
 * rendered triage suggestions and the lanes built from the versions list.
 */

const getMock = vi.fn();
const postMock = vi.fn();
const patchMock = vi.fn();
vi.mock("@/lib/apiClient", () => ({
  default: {
    get: (...args: unknown[]) => getMock(...args),
    post: (...args: unknown[]) => postMock(...args),
    patch: (...args: unknown[]) => patchMock(...args),
  },
}));

const channelMock = { on: vi.fn(), subscribe: vi.fn() };
channelMock.on.mockReturnValue(channelMock);
channelMock.subscribe.mockReturnValue(channelMock);
vi.mock("@/integrations/pronghorn-api/client", () => ({
  pronghornApi: { channel: () => channelMock, removeChannel: vi.fn() },
}));

vi.mock("@/app/layouts/ProjectLayout", () => ({
  useProjectLayoutData: () => ({ shareToken: null }),
}));

const PROJECT_ID = "p1";

function version(overrides: Record<string, unknown>) {
  return {
    id: "v1",
    project_id: PROJECT_ID,
    name: "v1.0.0",
    kind: "released",
    is_current: false,
    is_first_release: false,
    released_at: null,
    released_by: null,
    release_notes: null,
    git_tag: null,
    created_at: "2026-06-01T00:00:00Z",
    updated_at: "2026-06-01T00:00:00Z",
    work_item_count: 0,
    active_work_item_count: 0,
    ...overrides,
  };
}

function workItem(overrides: Record<string, unknown>) {
  return {
    id: "wi1",
    project_id: PROJECT_ID,
    key: "WI-1",
    version_id: null,
    type: "bug",
    severity: null,
    title: "Something broke",
    source: "Reported by QA",
    evidence: null,
    status: "triage",
    phase_state: {},
    phase_notes: {},
    branch: null,
    preview_url: null,
    bug_report: null,
    components: [],
    agent_session_id: null,
    created_at: "2026-09-01T00:00:00Z",
    updated_at: "2026-09-01T00:00:00Z",
    ...overrides,
  };
}

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/p/${PROJECT_ID}/versions`]}>
        <Routes>
          <Route path="/p/:projectId/versions" element={<Versions />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("Versions (NV-01/NV-02)", () => {
  beforeEach(() => {
    getMock.mockReset();
    postMock.mockReset();
    patchMock.mockReset();
  });

  it("suggests a hotfix for a high-severity bug and next release for everything else", async () => {
    getMock.mockImplementation(async (path: string) => {
      if (path === `/api/v1/projects/${PROJECT_ID}/versions`) {
        return [
          version({ id: "v1", name: "v1.4.2", kind: "released", is_current: true, is_first_release: true, released_at: "2026-06-01T00:00:00Z" }),
          version({ id: "v2", name: "v1.5.0", kind: "next" }),
        ];
      }
      if (path === `/api/v1/projects/${PROJECT_ID}/work-items?status=triage`) {
        return [
          workItem({ id: "wi1", key: "WI-47", type: "bug", severity: "high", title: "Upload fails on iPhone", version_id: null }),
          workItem({ id: "wi2", key: "WI-45", type: "enhancement", severity: null, title: "Speed up eligibility check", version_id: null }),
        ];
      }
      throw new Error(`unexpected path ${path}`);
    });

    const user = userEvent.setup();
    renderPage();

    await screen.findByText("Upload fails on iPhone");
    const bugRow = screen.getByText("Upload fails on iPhone").closest("details") as HTMLElement;
    await user.click(within(bugRow).getByText("Upload fails on iPhone"));
    expect(await within(bugRow).findByText(/suggested: hotfix/i)).toBeInTheDocument();
    expect(within(bugRow).getByRole("button", { name: /start a hotfix/i })).toBeInTheDocument();

    const enhRow = screen.getByText("Speed up eligibility check").closest("details") as HTMLElement;
    await user.click(within(enhRow).getByText("Speed up eligibility check"));
    expect(await within(enhRow).findByText(/suggested: next release/i)).toBeInTheDocument();
    expect(within(enhRow).getByRole("button", { name: "Schedule in v1.5.0" })).toBeInTheDocument();
  });

  it("schedules a change into the next open version on click", async () => {
    getMock.mockImplementation(async (path: string) => {
      if (path === `/api/v1/projects/${PROJECT_ID}/versions`) {
        return [
          version({ id: "v1", name: "v1.0.0", kind: "released", is_current: true, is_first_release: true, released_at: "2026-06-01T00:00:00Z" }),
          version({ id: "v2", name: "v1.1.0", kind: "next" }),
        ];
      }
      if (path === `/api/v1/projects/${PROJECT_ID}/work-items?status=triage`) {
        return [workItem({ id: "wi2", key: "WI-45", type: "enhancement", title: "Speed up eligibility check" })];
      }
      throw new Error(`unexpected path ${path}`);
    });
    patchMock.mockResolvedValueOnce(workItem({ id: "wi2", version_id: "v2" }));

    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByText("Speed up eligibility check"));
    await user.click(await screen.findByRole("button", { name: "Schedule in v1.1.0" }));

    await waitFor(() => expect(patchMock).toHaveBeenCalledWith("/api/v1/work-items/wi2", { versionId: "v2" }));
  });

  it("shows in-progress and released lanes from the versions list", async () => {
    getMock.mockImplementation(async (path: string) => {
      if (path === `/api/v1/projects/${PROJECT_ID}/versions`) {
        return [
          version({ id: "v1", name: "v1.0.0", kind: "released", is_current: false, is_first_release: true, released_at: "2026-06-01T00:00:00Z" }),
          version({ id: "v2", name: "v1.1.0", kind: "released", is_current: true, released_at: "2026-08-01T00:00:00Z" }),
          version({ id: "v3", name: "v1.1.1", kind: "hotfix", work_item_count: 2, active_work_item_count: 1 }),
        ];
      }
      if (path === `/api/v1/projects/${PROJECT_ID}/work-items?status=triage`) return [];
      throw new Error(`unexpected path ${path}`);
    });

    renderPage();

    expect(await screen.findByText("v1.1.1")).toBeInTheDocument();
    expect(screen.getByText(/2 changes/)).toBeInTheDocument();
    const released = screen.getByRole("heading", { name: "Released" }).closest("section") as HTMLElement;
    expect(within(released).getByText("First release")).toBeInTheDocument();
    expect(within(released).getByText("Current release")).toBeInTheDocument();
  });

  it("shows the pre-first-release banner and no triage inbox before B1's first release", async () => {
    getMock.mockImplementation(async (path: string) => {
      if (path === `/api/v1/projects/${PROJECT_ID}/versions`) {
        return [version({ id: "v1", name: "v1.0.0", kind: "building", is_first_release: true, work_item_count: 0 })];
      }
      if (path === `/api/v1/projects/${PROJECT_ID}/work-items?status=triage`) return [];
      throw new Error(`unexpected path ${path}`);
    });

    renderPage();

    expect(await screen.findByText(/everything you build now becomes v1\.0\.0/i)).toBeInTheDocument();
    expect(screen.queryByText("Not scheduled")).not.toBeInTheDocument();
  });

  it("shows an empty state for a project with no versions rows at all", async () => {
    getMock.mockImplementation(async (path: string) => {
      if (path === `/api/v1/projects/${PROJECT_ID}/versions`) return [];
      if (path === `/api/v1/projects/${PROJECT_ID}/work-items?status=triage`) return [];
      throw new Error(`unexpected path ${path}`);
    });

    renderPage();
    expect(await screen.findByText("No versions yet")).toBeInTheDocument();
  });
});
