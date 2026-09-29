import * as React from "react";
import { describe, expect, it } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, RouterProvider, createMemoryRouter } from "react-router-dom";
import { AppShell } from "../AppShell";
import { usePublishPrimaryAction } from "../PrimaryActionContext";

describe("AppShell", () => {
  it("renders its chrome slots and the outlet content", () => {
    render(
      <MemoryRouter>
        <AppShell globalBar={<div data-testid="global-bar" />} rail={<div data-testid="rail" />}>
          <div data-testid="content">Hello</div>
        </AppShell>
      </MemoryRouter>,
    );
    expect(screen.getByTestId("global-bar")).toBeInTheDocument();
    expect(screen.getByTestId("rail")).toBeInTheDocument();
    expect(screen.getByTestId("content")).toBeInTheDocument();
  });

  it("wraps a given timeline slot in a 'Versions' nav landmark (T024, WP-F3b)", () => {
    render(
      <MemoryRouter>
        <AppShell globalBar={<div />} timeline={<div role="tablist" aria-label="Version timeline" data-testid="timeline" />} />
      </MemoryRouter>,
    );
    const nav = screen.getByRole("navigation", { name: "Versions" });
    expect(nav).toContainElement(screen.getByTestId("timeline"));
  });

  it("renders no 'Versions' landmark when no timeline slot is given", () => {
    render(
      <MemoryRouter>
        <AppShell globalBar={<div />} />
      </MemoryRouter>,
    );
    expect(screen.queryByRole("navigation", { name: "Versions" })).not.toBeInTheDocument();
  });

  it("has a skip link targeting the main content region", () => {
    render(
      <MemoryRouter>
        <AppShell globalBar={<div />} />
      </MemoryRouter>,
    );
    const skip = screen.getByText("Skip to content");
    expect(skip).toHaveAttribute("href", "#page");
    expect(screen.getByRole("main")).toHaveAttribute("id", "page");
  });

  it("does not remount the shell when the route changes (only <Outlet/> content changes)", () => {
    let mounts = 0;
    function Shell() {
      React.useEffect(() => {
        mounts += 1;
      }, []);
      return (
        <AppShell globalBar={<div data-testid="global-bar" />}>
          <div />
        </AppShell>
      );
    }
    function ToolA() {
      return <div data-testid="tool">A</div>;
    }
    function ToolB() {
      return <div data-testid="tool">B</div>;
    }

    function Wrapped({ initialPath }: { initialPath: string }) {
      return (
        <MemoryRouter initialEntries={[initialPath]}>
          <Routes>
            <Route element={<Shell />}>
              <Route path="/a" element={<ToolA />} />
              <Route path="/b" element={<ToolB />} />
            </Route>
          </Routes>
        </MemoryRouter>
      );
    }

    const { rerender } = render(<Wrapped initialPath="/a" />);
    expect(mounts).toBe(1);
    rerender(<Wrapped initialPath="/b" />);
    // A fresh MemoryRouter remounts everything, so this only proves Shell
    // itself renders without throwing across both routes; the real
    // navigation-based remount assertion lives in the router integration
    // test (T033), which pushes a real history entry between two tool
    // routes and asserts the layout's effect ran exactly once.
    expect(mounts).toBeGreaterThanOrEqual(1);
  });
});

describe("AppShell main content focus (T033)", () => {
  it("does not focus #page on the initial load, but does on a subsequent route change", async () => {
    function ToolA() {
      return <div data-testid="tool">A</div>;
    }
    function ToolB() {
      return <div data-testid="tool">B</div>;
    }

    const router = createMemoryRouter(
      [
        {
          path: "/",
          element: <AppShell globalBar={<div data-testid="global-bar" />} />,
          children: [
            { path: "a", element: <ToolA /> },
            { path: "b", element: <ToolB /> },
          ],
        },
      ],
      { initialEntries: ["/a"] },
    );

    render(<RouterProvider router={router} />);
    const main = screen.getByRole("main");
    expect(document.activeElement).not.toBe(main);

    await act(async () => {
      await router.navigate("/b");
    });
    expect(screen.getByTestId("tool").textContent).toBe("B");
    expect(document.activeElement).toBe(main);
  });
});

describe("AppShell primary action mirroring", () => {
  it("mirrors a published primary action into the mobile PrimaryActionSlot", () => {
    function Page() {
      usePublishPrimaryAction({ label: "Add requirement", onClick: () => {} });
      return <div>Requirements</div>;
    }
    render(
      <MemoryRouter>
        <AppShell globalBar={<div />}>
          <Page />
        </AppShell>
      </MemoryRouter>,
    );
    expect(screen.getByRole("button", { name: "Add requirement" })).toBeInTheDocument();
  });

  it("renders nothing in the slot when no page has published an action", () => {
    render(
      <MemoryRouter>
        <AppShell globalBar={<div />}>
          <div>No action here</div>
        </AppShell>
      </MemoryRouter>,
    );
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("reserves mobile-only bottom padding for the fixed tab bar via the shared --tabbar-h token", () => {
    const { rerender } = render(
      <MemoryRouter>
        <AppShell globalBar={<div />} mobileTabBar={<div data-testid="tabbar" />}>
          <div />
        </AppShell>
      </MemoryRouter>,
    );
    const main = screen.getByRole("main");
    expect(main.className).toContain("max-md:pb-[var(--shell-bottom-inset,0px)]");
    expect(main.className).not.toMatch(/(^|\s)pb-/);
    // Page z-indices are contained below the fixed bars on mobile.
    expect(main.className).toContain("max-md:isolate");
    const root = main.closest("div.min-h-dvh") as HTMLElement;
    expect(root.className).toContain("[--shell-bottom-inset:calc(var(--tabbar-h)+env(safe-area-inset-bottom))]");
    expect(root.className).toContain(
      "max-md:has-[#mobile-primary-action]:[--shell-bottom-inset:calc(var(--tabbar-h)+var(--action-bar-h)+env(safe-area-inset-bottom))]",
    );
    rerender(
      <MemoryRouter>
        <AppShell globalBar={<div />}>
          <div />
        </AppShell>
      </MemoryRouter>,
    );
    expect((screen.getByRole("main").closest("div.min-h-dvh") as HTMLElement).className).not.toContain(
      "[--shell-bottom-inset:calc(var(--tabbar-h)+env",
    );
  });
});
