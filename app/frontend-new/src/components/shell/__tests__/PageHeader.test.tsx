import * as React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RouterProvider, createMemoryRouter } from "react-router-dom";
import { PageHeader } from "../PageHeader";
import { PrimaryActionProvider } from "../PrimaryActionContext";
import { PrimaryActionSlot } from "../PrimaryActionSlot";
import { ReadOnlyProvider } from "../ReadOnlyContext";
import type { RouteHandle } from "../types";

describe("PageHeader", () => {
  it("renders the crumb, title and primary action", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <PrimaryActionProvider>
        <PageHeader crumb="Define" title="Requirements" primary={{ label: "Add requirement", onClick }} />
      </PrimaryActionProvider>,
    );
    expect(screen.getByText("Define")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Requirements" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Add requirement" }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("mirrors the primary action into PrimaryActionSlot and clears it on unmount", () => {
    function Wrapper({ showHeader }: { showHeader: boolean }) {
      return (
        <PrimaryActionProvider>
          {showHeader ? <PageHeader title="Canvas" primary={{ label: "Save layout" }} /> : null}
          <PrimaryActionSlot />
        </PrimaryActionProvider>
      );
    }
    const { rerender } = render(<Wrapper showHeader />);
    expect(screen.getAllByRole("button", { name: "Save layout" }).length).toBeGreaterThanOrEqual(1);
    rerender(<Wrapper showHeader={false} />);
    expect(screen.queryByRole("button", { name: "Save layout" })).not.toBeInTheDocument();
  });

  it("disables the primary action and shows the reason as a title", () => {
    render(
      <PrimaryActionProvider>
        <PageHeader title="Build" primary={{ label: "Deploy", disabled: true, disabledReason: "No changes staged" }} />
      </PrimaryActionProvider>,
    );
    const button = screen.getByRole("button", { name: "Deploy" });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("title", "No changes staged");
  });
});

describe("PageHeader in a read-only subtree", () => {
  it("disables the primary action with the reason, in the header and in the mobile slot (outside the provider)", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <PrimaryActionProvider>
        <ReadOnlyProvider value={{ readOnly: true, reason: "Released and read-only" }}>
          <PageHeader title="Requirements" primary={{ label: "Add requirement", onClick }} />
        </ReadOnlyProvider>
        <PrimaryActionSlot />
      </PrimaryActionProvider>,
    );
    const buttons = screen.getAllByRole("button", { name: "Add requirement" });
    expect(buttons).toHaveLength(2);
    for (const button of buttons) {
      expect(button).toBeDisabled();
      expect(button).toHaveAttribute("title", "Released and read-only");
      await user.click(button);
    }
    expect(onClick).not.toHaveBeenCalled();
  });
});

describe("PageHeader defaults from the route registry (T033/T027, usePageRoute)", () => {
  function renderAtRoute(handle: RouteHandle) {
    const router = createMemoryRouter(
      [
        {
          path: "/",
          element: (
            <PrimaryActionProvider>
              <PageHeader />
            </PrimaryActionProvider>
          ),
          handle,
        },
      ],
      { initialEntries: ["/"] },
    );
    return render(<RouterProvider router={router} />);
  }

  it("reads the title and primary action off the matched route's handle when no props are given", () => {
    const onClick = vi.fn();
    renderAtRoute({ title: "Requirements", phase: "define", tool: "requirements", usePrimaryAction: () => ({ label: "Add requirement", onClick }) });
    expect(screen.getByRole("heading", { name: "Requirements" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add requirement" })).toBeInTheDocument();
  });

  it("falls back to an empty title and no primary action when the route has no handle", () => {
    const router = createMemoryRouter(
      [
        {
          path: "/",
          element: (
            <PrimaryActionProvider>
              <PageHeader />
            </PrimaryActionProvider>
          ),
        },
      ],
      { initialEntries: ["/"] },
    );
    render(<RouterProvider router={router} />);
    expect(screen.getByRole("heading").textContent).toBe("");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("lets an explicit title/primary prop override the route registry's", () => {
    const registryOnClick = vi.fn();
    const overrideOnClick = vi.fn();
    const router = createMemoryRouter(
      [
        {
          path: "/",
          element: (
            <PrimaryActionProvider>
              <PageHeader title="Overridden title" primary={{ label: "Overridden action", onClick: overrideOnClick }} />
            </PrimaryActionProvider>
          ),
          handle: { title: "Requirements", usePrimaryAction: () => ({ label: "Add requirement", onClick: registryOnClick }) } as RouteHandle,
        },
      ],
      { initialEntries: ["/"] },
    );
    render(<RouterProvider router={router} />);
    expect(screen.getByRole("heading", { name: "Overridden title" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Overridden action" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add requirement" })).not.toBeInTheDocument();
  });
});
