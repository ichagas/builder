import * as React from "react";
import { describe, expect, it } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { RouterProvider, createMemoryRouter } from "react-router-dom";
import { AppShell } from "@/components/shell/AppShell";

/**
 * Remount test (T033/T037). Per agents.md's F3 acceptance ("Remount test
 * 0") and contracts/routes.md PR-22 ("No remount across routes"): moving
 * between two tools inside a project must not remount the layout element
 * — only `<Outlet/>`'s content should change. This exercises the real
 * `createBrowserRouter`/`RouterProvider` navigation path (a `router.navigate`
 * call), not a fresh `MemoryRouter` render, which is what actually proves
 * the layout survives a route change instead of merely rendering twice.
 */
describe("shell remount", () => {
  it("does not remount AppShell when navigating between two child tool routes", async () => {
    let shellMounts = 0;

    function Shell() {
      React.useEffect(() => {
        shellMounts += 1;
      }, []);
      return <AppShell globalBar={<div data-testid="global-bar" />} />;
    }

    function ToolA() {
      return <div data-testid="tool">requirements</div>;
    }
    function ToolB() {
      return <div data-testid="tool">canvas</div>;
    }

    const router = createMemoryRouter(
      [
        {
          path: "/p/:projectId",
          element: <Shell />,
          children: [
            { path: "v/current/define/requirements", element: <ToolA /> },
            { path: "v/current/design/canvas", element: <ToolB /> },
          ],
        },
      ],
      { initialEntries: ["/p/proj-1/v/current/define/requirements"] },
    );

    render(<RouterProvider router={router} />);
    expect(shellMounts).toBe(1);
    expect(screen.getByTestId("tool").textContent).toBe("requirements");

    await act(async () => {
      await router.navigate("/p/proj-1/v/current/design/canvas");
    });

    expect(screen.getByTestId("tool").textContent).toBe("canvas");
    // The layout mounted exactly once across both navigations.
    expect(shellMounts).toBe(1);

    await act(async () => {
      await router.navigate("/p/proj-1/v/current/define/requirements");
    });
    expect(shellMounts).toBe(1);
  });
});
