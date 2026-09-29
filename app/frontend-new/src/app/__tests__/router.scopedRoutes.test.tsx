import { describe, expect, it, vi } from "vitest";

vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: null }), AuthProvider: ({ children }: { children: unknown }) => children }));
vi.mock("@/integrations/pronghorn-api/client", () => ({ pronghornApi: { rpc: vi.fn(), channel: vi.fn(), removeChannel: vi.fn() } }));
vi.mock("@/lib/apiClient", () => ({ default: { get: vi.fn(), post: vi.fn(), patch: vi.fn() } }));

import { router } from "../router";
import { PROJECT_TOOL_ROUTES } from "../routes/project";

describe("router: version-scoped tool routes", () => {
  const project = router.routes[0].children?.find((r) => r.path === "p/:projectId");
  const paths = (project?.children ?? []).map((r) => r.path);

  it("registers every tool under both v/current and v/:versionId with the route as handle", () => {
    for (const route of PROJECT_TOOL_ROUTES) {
      for (const segment of ["current", ":versionId"]) {
        const path = `v/${segment}/${route.phase}/${route.tool}`;
        expect(paths).toContain(path);
        expect((project?.children ?? []).find((r) => r.path === path)?.handle).toBe(route);
      }
    }
  });
});
