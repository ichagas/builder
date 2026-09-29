import * as React from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Change } from "../Change";
import { useChangePrimaryAction } from "../change.primaryAction";

/**
 * Change page tests (T111, WP-V2, NV-03/NV-04): step bar, bug report,
 * deltas, version picker and the single primary action. Same mocking as
 * Versions.test.tsx.
 */

const getMock = vi.fn();
const postMock = vi.fn();
const patchMock = vi.fn();
vi.mock("@/lib/apiClient", () => ({
  default: { get: (...a: unknown[]) => getMock(...a), post: (...a: unknown[]) => postMock(...a), patch: (...a: unknown[]) => patchMock(...a) },
}));

const channelMock = { on: vi.fn(), subscribe: vi.fn() };
channelMock.on.mockReturnValue(channelMock);
channelMock.subscribe.mockReturnValue(channelMock);
const rpcMock = vi.fn();
vi.mock("@/integrations/pronghorn-api/client", () => ({
  pronghornApi: { channel: () => channelMock, removeChannel: vi.fn(), rpc: (...a: unknown[]) => rpcMock(...a) },
}));

vi.mock("@/app/layouts/ProjectLayout", () => ({
  useProjectLayoutData: () => ({ shareToken: null, role: "owner" }),
}));

const P = "p1";

const VERSIONS = [
  { id: "v1", project_id: P, name: "v1.4.2", kind: "released", is_current: true, is_first_release: true, released_at: "2026-06-01T00:00:00Z", released_by: null, release_notes: null, git_tag: null, created_at: "x", updated_at: "x", work_item_count: 0, active_work_item_count: 0 },
  { id: "v2", project_id: P, name: "v1.5.0", kind: "next", is_current: false, is_first_release: false, released_at: null, released_by: null, release_notes: null, git_tag: null, created_at: "x", updated_at: "x", work_item_count: 1, active_work_item_count: 1 },
  { id: "v3", project_id: P, name: "v1.4.3", kind: "hotfix", is_current: false, is_first_release: false, released_at: null, released_by: null, release_notes: null, git_tag: null, created_at: "x", updated_at: "x", work_item_count: 0, active_work_item_count: 0 },
];

function item(overrides: Record<string, unknown> = {}) {
  return {
    id: "wi1",
    project_id: P,
    key: "WI-47",
    version_id: "v2",
    type: "bug",
    severity: "high",
    title: "Upload fails on iPhone",
    source: "Help desk",
    evidence: null,
    status: "active",
    phase_state: { define: "active", design: "skipped", build: "todo", ship: "todo" },
    phase_notes: { define: "2 requirements" },
    branch: "fix/wi-47-upload-fails",
    preview_url: null,
    bug_report: { steps: ["Open the app", "Upload a HEIC photo"], expected: "Upload succeeds", actual: "Error 500" },
    components: [],
    agent_session_id: null,
    created_at: "x",
    updated_at: "x",
    ...overrides,
  };
}

function Probe() {
  const primary = useChangePrimaryAction();
  const [rejected, setRejected] = React.useState(false);
  return primary ? (
    <>
      <button
        type="button"
        disabled={primary.disabled}
        onClick={() => void Promise.resolve(primary.onClick?.()).catch(() => setRejected(true))}
      >
        {`primary: ${primary.label}`}
      </button>
      {rejected ? <span data-testid="primary-rejected" /> : null}
    </>
  ) : null;
}

function Where() {
  return <div data-testid="where">{useLocation().pathname}</div>;
}

function setup(workItem: Record<string, unknown>, deltas: unknown[] = [], path = `/p/${P}/changes/wi1`) {
  getMock.mockImplementation(async (p: string) => {
    if (p === `/api/v1/projects/${P}/versions`) return VERSIONS;
    if (p === "/api/v1/work-items/wi1") return workItem;
    if (p === "/api/v1/work-items/wi1/requirement-changes") return deltas;
    if (p.startsWith(`/api/v1/projects/${P}/release-checks`)) return { checks: [{ id: "t", label: "Tests pass on the branch", passed: false }], canRelease: false };
    throw new Error(`unexpected path ${p}`);
  });
  rpcMock.mockResolvedValue({ data: [], error: null });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route
            path="/p/:projectId/changes/:changeId/:step?"
            element={
              <>
                <Change />
                <Probe />
                <Where />
              </>
            }
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("Change page (NV-03/NV-04)", () => {
  beforeEach(() => {
    getMock.mockReset();
    postMock.mockReset();
    patchMock.mockReset();
    rpcMock.mockReset();
  });

  it("opens on the active step with the bug report, deltas and a step bar", async () => {
    setup(item(), [
      { id: "d1", work_item_id: "wi1", requirement_id: "r1", kind: "changed", title: "Photo upload", criterion: "Accepts HEIC", created_at: "x", updated_at: "x" },
    ]);

    expect(await screen.findByRole("heading", { name: "Upload fails on iPhone" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Bug report" })).toBeInTheDocument();
    expect(screen.getByText("Upload a HEIC photo")).toBeInTheDocument();
    expect(await screen.findByText("Photo upload")).toBeInTheDocument();
    expect(within(screen.getByTestId("requirement-deltas")).getByText("Changed")).toBeInTheDocument();

    const define = screen.getByRole("button", { name: /^Define/ });
    expect(define).toHaveAttribute("aria-current", "step");
    expect(screen.getByRole("button", { name: /Design/ })).toHaveAttribute("data-state", "skipped");
    expect(screen.getByRole("button", { name: "primary: Mark definition ready" })).toBeEnabled();
  });

  it("marks definition ready and moves to Build when design is skipped", async () => {
    postMock.mockResolvedValue(item({ phase_state: { define: "done", design: "skipped", build: "active", ship: "todo" } }));
    const user = userEvent.setup();
    setup(item());

    await user.click(await screen.findByRole("button", { name: "primary: Mark definition ready" }));
    await waitFor(() => expect(postMock).toHaveBeenCalledWith("/api/v1/work-items/wi1/steps/define/complete", {}));
    await waitFor(() => expect(screen.getByTestId("where")).toHaveTextContent(`/p/${P}/changes/wi1/build`));
  });

  it("surfaces a failed primary action and rethrows so the button can show failure", async () => {
    postMock.mockRejectedValue(new Error("500"));
    const user = userEvent.setup();
    setup(item());

    await user.click(await screen.findByRole("button", { name: "primary: Mark definition ready" }));
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(await screen.findByTestId("primary-rejected")).toBeInTheDocument();
  });

  it("adds a design step to a bug from the Design step", async () => {
    postMock.mockResolvedValue(item({ phase_state: { define: "done", design: "todo", build: "todo", ship: "todo" } }));
    const user = userEvent.setup();
    setup(item({ phase_state: { define: "done", design: "skipped", build: "active", ship: "todo" } }), [], `/p/${P}/changes/wi1/design`);

    expect(await screen.findByText("Bugs skip design by default")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "primary: Add a design step" }));
    await waitFor(() => expect(postMock).toHaveBeenCalledWith("/api/v1/work-items/wi1/steps/design/unskip", {}));
  });

  it("moves the change to another open version with the picker", async () => {
    patchMock.mockResolvedValue(item({ version_id: "v3" }));
    const user = userEvent.setup();
    setup(item());

    const picker = await screen.findByRole("combobox", { name: "Move WI-47 to another version" });
    expect(picker).toHaveValue("v2");
    expect(screen.queryByRole("option", { name: /v1\.4\.2/ })).not.toBeInTheDocument();
    await user.selectOptions(picker, "v3");
    await waitFor(() => expect(patchMock).toHaveBeenCalledWith("/api/v1/work-items/wi1", { versionId: "v3" }));
  });

  it("records a requirement delta", async () => {
    postMock.mockResolvedValue({ id: "d2", work_item_id: "wi1", requirement_id: null, kind: "new", title: "Retry uploads", criterion: null, created_at: "x", updated_at: "x" });
    const user = userEvent.setup();
    setup(item());

    await user.type(await screen.findByLabelText("Requirement"), "Retry uploads");
    await user.click(screen.getByRole("button", { name: "Add requirement change" }));
    await waitFor(() =>
      expect(postMock).toHaveBeenCalledWith("/api/v1/work-items/wi1/requirement-changes", { kind: "new", title: "Retry uploads", criterion: null }),
    );
  });

  it("is read-only when the change's version is released", async () => {
    setup(item({ version_id: "v1" }));

    expect(await screen.findByText("v1.4.2 is released and read-only")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^primary:/ })).not.toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Move WI-47 to another version" })).toBeDisabled();
  });

  it("shows the Ship step's checks and an Open release action", async () => {
    setup(item({ phase_state: { define: "done", design: "skipped", build: "done", ship: "active" } }), [], `/p/${P}/changes/wi1/ship`);

    expect(await screen.findByText("Tests pass on the branch")).toBeInTheDocument();
    expect(screen.getByText("Build reviewed")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "primary: Open release v1.5.0" })).toBeEnabled();
  });

  it("shows a not found state for an unknown change", async () => {
    getMock.mockImplementation(async (p: string) => {
      if (p === `/api/v1/projects/${P}/versions`) return VERSIONS;
      throw new Error("404");
    });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[`/p/${P}/changes/nope`]}>
          <Routes>
            <Route path="/p/:projectId/changes/:changeId/:step?" element={<Change />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
    expect((await screen.findAllByText("Change not found")).length).toBeGreaterThan(0);
  });
});
