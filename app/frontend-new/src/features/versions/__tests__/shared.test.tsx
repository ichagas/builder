import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useRequirementChanges, changeKeys } from "../change.api";
import { useOpenVersionChanges } from "../scope.api";
import { releaseKeys } from "../release.api";
import { requirementChangesKey, releaseChecksKey, withToken } from "../shared";

const getMock = vi.fn();
vi.mock("@/lib/apiClient", () => ({ default: { get: (...a: unknown[]) => getMock(...a) } }));
vi.mock("@/integrations/pronghorn-api/client", () => ({ pronghornApi: { rpc: vi.fn() } }));

const DELTA = {
  id: "d1",
  work_item_id: "wi1",
  requirement_id: null,
  kind: "new",
  title: "Add export",
  criterion: null,
  created_at: "2026-09-01T00:00:00Z",
  updated_at: "2026-09-01T00:00:00Z",
};
const ITEM = {
  id: "wi1", project_id: "p1", key: "WI-1", version_id: "v2", type: "feature", severity: null, title: "T", source: null,
  evidence: null, status: "active", phase_state: {}, phase_notes: {}, branch: null, preview_url: null, bug_report: null,
  components: [], agent_session_id: null, created_at: "", updated_at: "",
};

describe("versions shared module", () => {
  beforeEach(() => {
    getMock.mockReset();
    getMock.mockImplementation(async (url: string) => (url.includes("requirement-changes") ? [DELTA] : [ITEM]));
  });

  it("scope and change hooks share one cache entry with the same shape (id kept)", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    const scope = renderHook(() => useOpenVersionChanges("p1", "v2"), { wrapper });
    await waitFor(() => expect(scope.result.current.changes[0]?.deltas).toHaveLength(1));
    expect(scope.result.current.changes[0].deltas[0].id).toBe("d1");
    expect(client.getQueryData(changeKeys.deltas("p1", "wi1"))).toEqual([DELTA]);
    const change = renderHook(() => useRequirementChanges("p1", "wi1"), { wrapper });
    expect(change.result.current.data?.[0].id).toBe("d1");
    expect(changeKeys.deltas("p1", "wi1")).toEqual(requirementChangesKey("p1", "wi1"));
  });

  it("release checks share one key", () => {
    expect(releaseKeys.checks("p1", "v2")).toEqual(releaseChecksKey("p1", "v2"));
    expect(changeKeys.checks("p1", "v2")).toEqual(releaseChecksKey("p1", "v2"));
    expect(releaseKeys.checks("p1", undefined)).toEqual(releaseChecksKey("p1", undefined));
  });

  it("withToken respects an existing query string", () => {
    expect(withToken("/a", "t k")).toBe("/a?token=t%20k");
    expect(withToken("/a?x=1", "t")).toBe("/a?x=1&token=t");
    expect(withToken("/a", null)).toBe("/a");
  });
});
