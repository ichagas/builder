import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PageHeader } from "../PageHeader";
import { PrimaryActionProvider } from "../PrimaryActionContext";
import { PrimaryActionSlot } from "../PrimaryActionSlot";

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
