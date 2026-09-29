import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "@/i18n";
import { resolveScope, isUnscopedSegment } from "../scope.api";
import { VersionScope } from "../scope/VersionScope";
import { useVersionScopeContext } from "../scope/context";
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
        return [{ work_item_id: "wi1", requirement_id: "r1", kind: "changed", title: "Upload limit", criterion: "10 MB" }];
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
