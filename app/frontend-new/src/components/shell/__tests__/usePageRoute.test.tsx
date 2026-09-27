import * as React from "react";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { RouterProvider, createMemoryRouter } from "react-router-dom";
import { usePageRoute } from "../usePageRoute";
import type { RouteHandle } from "../types";

function Probe() {
  const route = usePageRoute();
  return <div data-testid="probe">{route ? `${route.title}:${route.phase ?? ""}:${route.tool ?? ""}` : "none"}</div>;
}

describe("usePageRoute", () => {
  it("returns undefined outside a router", () => {
    render(<Probe />);
    expect(screen.getByTestId("probe").textContent).toBe("none");
  });

  it("returns undefined inside a router when the matched route has no handle", () => {
    const router = createMemoryRouter([{ path: "/", element: <Probe /> }], { initialEntries: ["/"] });
    render(<RouterProvider router={router} />);
    expect(screen.getByTestId("probe").textContent).toBe("none");
  });

  it("returns the deepest matched route's handle (the registry entry set via app/router.tsx)", () => {
    const handle: RouteHandle = {
      title: "Requirements",
      phase: "define",
      tool: "requirements",
      usePrimaryAction: () => ({ label: "Add requirement" }),
    };
    const router = createMemoryRouter([{ path: "/requirements", element: <Probe />, handle }], {
      initialEntries: ["/requirements"],
    });
    render(<RouterProvider router={router} />);
    expect(screen.getByTestId("probe").textContent).toBe("Requirements:define:requirements");
  });
});
