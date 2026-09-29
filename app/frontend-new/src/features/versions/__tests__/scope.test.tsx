import * as React from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "@/i18n";
import { resolveScope, isUnscopedSegment } from "../scope.api";
import { VersionScope } from "../scope/VersionScope";
import { useVersionScopeContext } from "../scope/context";
import { PageHeader } from "@/components/shell/PageHeader";
import { PrimaryActionProvider } from "@/components/shell/PrimaryActionContext";
import { PrimaryActionSlot } from "@/components/shell/PrimaryActionSlot";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import userEvent from "@testing-library/user-event";
import type { Version } from "../api";

const getMock = vi.fn();
vi.mock("@/lib/apiClient", () => ({ default: { get: (...a: unknown[]) => getMock(...a) } }));
vi.mock("@/app/layouts/ProjectLayout", () => ({
  useProjectLayoutData: () => ({ projectId: "p1", shareToken: null }),
}));

function version(over: Partial<Version>): Version {
  return {
    id: "v-id",
    project_id: "p1",
    name: "v1.0.0",
    kind: "released",
    is_current: false,
    is_first_release: false,
    released_at: null,
    released_by: null,
    release_notes: null,
    git_tag: null,
    created_at: "",
    updated_at: "",
    work_item_count: 0,
    active_work_item_count: 0,
    ...over,
  };
}

const RELEASED = version({ id: "rel", name: "v1.0.0", is_current: true });
const OPEN = version({ id: "open", name: "v1.1.0", kind: "next" });

describe("resolveScope", () => {
  it("never scopes v/current or the synthetic building id", () => {
    for (const seg of [undefined, "current", "building"]) {
      expect(isUnscopedSegment(seg)).toBe(true);
      expect(resolveScope([RELEASED], seg).mode).toBe("none");
    }
  });
  it("resolves by id or name, released vs open", () => {
    expect(resolveScope([RELEASED, OPEN], "rel").mode).toBe("released");
    expect(resolveScope([RELEASED, OPEN], "v1.1.0").mode).toBe("open");
    expect(resolveScope([RELEASED], "nope").isUnknown).toBe(true);
    expect(resolveScope(undefined, "rel").isResolving).toBe(true);
  });
});

function Tool() {
  const { readOnly } = useVersionScopeContext();
  return <button type="button">Do it {readOnly ? "ro" : "rw"}</button>;
}

function RichTool() {
  const [count, setCount] = React.useState(0);
  return (
    <div>
      <PageHeader title="Requirements" primary={{ label: "Add requirement", onClick: () => setCount((c) => c + 1) }} />
      <output data-testid="count">{count}</output>
      <input aria-label="Title" defaultValue="x" />
      <Tabs defaultValue="a">
        <TabsList>
          <TabsTrigger value="a">Tab A</TabsTrigger>
          <TabsTrigger value="b">Tab B</TabsTrigger>
        </TabsList>
        <TabsContent value="a">Panel A</TabsContent>
        <TabsContent value="b">
          Panel B <button type="button">Edit thing</button>
        </TabsContent>
      </Tabs>
      <details>
        <summary>More</summary>
        <span>Details body</span>
      </details>
    </div>
  );
}

let mountCount = 0;
function MountCounter() {
  React.useEffect(() => {
    mountCount += 1;
  }, []);
  return null;
}

function renderAt(path: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/p/:projectId/v/:versionId/define/requirements" element={<VersionScope><Tool /></VersionScope>} />
          <Route path="/p/:projectId/v/current/define/requirements" element={<VersionScope><Tool /></VersionScope>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("VersionScope", () => {
  beforeEach(() => {
    getMock.mockReset();
    getMock.mockImplementation(async (url: string) => {
      if (url.endsWith("/versions")) return [RELEASED, OPEN];
      if (url.includes("/work-items?")) {
        return [
          {
            id: "wi1", project_id: "p1", key: "WI-1", version_id: "open", type: "bug", severity: null, title: "Fix upload",
            source: null, evidence: null, status: "active", branch: null, preview_url: null, components: [],
            agent_session_id: null, created_at: "", updated_at: "",
          },
        ];
      }
      if (url.includes("/requirement-changes")) {
        return [{ id: "d1", work_item_id: "wi1", requirement_id: "r1", kind: "changed", title: "Upload limit", criterion: "10 MB", created_at: "", updated_at: "" }];
      }
      return [];
    });
  });

  it("is a passthrough on v/current (no request, no banner)", () => {
    renderAt("/p/p1/v/current/define/requirements");
    expect(screen.getByRole("button", { name: "Do it rw" })).toBeEnabled();
    expect(screen.queryByTestId("version-scope")).toBeNull();
    expect(getMock).not.toHaveBeenCalled();
  });

  it("released: banner and a disabled tool", async () => {
    renderAt("/p/p1/v/rel/define/requirements");
    expect(await screen.findByText(/v1\.0\.0 is released and read-only/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Do it ro" })).toBeDisabled();
  });

  it("open: deltas above an enabled tool", async () => {
    renderAt("/p/p1/v/open/define/requirements");
    expect(await screen.findByText("Fix upload")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("Upload limit")).toBeInTheDocument());
    expect(screen.getByText("Changed")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Do it rw" })).toBeEnabled();
  });

  it("unknown version: warns and still renders the tool", async () => {
    renderAt("/p/p1/v/zzz/define/requirements");
    expect(await screen.findByText("Version not found")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Do it rw" })).toBeEnabled();
  });
});

describe("VersionScope read-only enforcement", () => {
  function renderRich(path: string, slot = false) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(
      <QueryClientProvider client={client}>
        <PrimaryActionProvider>
          <MemoryRouter initialEntries={[path]}>
            <Routes>
              <Route
                path="/p/:projectId/v/:versionId/define/requirements"
                element={
                  <VersionScope>
                    <MountCounter />
                    <RichTool />
                  </VersionScope>
                }
              />
            </Routes>
          </MemoryRouter>
          {slot ? <PrimaryActionSlot /> : null}
        </PrimaryActionProvider>
      </QueryClientProvider>,
    );
  }

  beforeEach(() => {
    mountCount = 0;
    getMock.mockReset();
    getMock.mockImplementation(async (url: string) => (url.endsWith("/versions") ? [RELEASED, OPEN] : []));
  });

  it("released: primary action (header and mobile slot) is disabled with a reason; inputs disabled; tabs and disclosures still work", async () => {
    const user = userEvent.setup();
    renderRich("/p/p1/v/rel/define/requirements", true);
    await screen.findByText(/v1\.0\.0 is released and read-only/);
    await waitFor(() => expect(screen.getAllByRole("button", { name: "Add requirement" })).toHaveLength(2));
    for (const button of screen.getAllByRole("button", { name: "Add requirement" })) {
      expect(button).toBeDisabled();
      expect(button).toHaveAttribute("title", "This version is released and read-only.");
    }
    expect(screen.getByLabelText("Title")).toBeDisabled();
    // Navigation stays usable, editing inside the newly visible tab does not.
    await user.click(screen.getByRole("tab", { name: "Tab B" }));
    expect(await screen.findByText(/Panel B/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit thing" })).toBeDisabled();
    expect(screen.getByRole("tab", { name: "Tab A" })).toBeEnabled();
    await user.click(screen.getByText("More"));
    expect(screen.getByText("Details body")).toBeVisible();
    expect(screen.getByTestId("count")).toHaveTextContent("0");
  });

  it("open version: nothing is disabled", async () => {
    renderRich("/p/p1/v/open/define/requirements");
    await screen.findByText("Changes in v1.1.0");
    expect(screen.getByLabelText("Title")).toBeEnabled();
    expect(screen.getAllByRole("button", { name: "Add requirement" })[0]).toBeEnabled();
  });

  it("locks the tool while versions resolve and keeps it mounted when they arrive", async () => {
    let release!: (v: Version[]) => void;
    getMock.mockImplementation((url: string) =>
      url.endsWith("/versions") ? new Promise((r) => (release = r as (v: Version[]) => void)) : Promise.resolve([]),
    );
    renderRich("/p/p1/v/open/define/requirements");
    expect(screen.getByText("Loading version")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText("Title")).toBeDisabled());
    const input = screen.getByLabelText("Title");
    expect(screen.getByRole("button", { name: "Add requirement" })).toBeDisabled();
    release([RELEASED, OPEN]);
    await screen.findByText("Changes in v1.1.0");
    await waitFor(() => expect(screen.getByLabelText("Title")).toBeEnabled());
    expect(screen.getByLabelText("Title")).toBe(input);
    expect(mountCount).toBe(1);
  });

  it("fails closed with a warning when the versions request fails", async () => {
    getMock.mockRejectedValue(new Error("500"));
    renderRich("/p/p1/v/rel/define/requirements");
    expect(await screen.findByText("Couldn't load this version")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText("Title")).toBeDisabled());
    expect(screen.getByRole("button", { name: "Add requirement" })).toBeDisabled();
  });
});
