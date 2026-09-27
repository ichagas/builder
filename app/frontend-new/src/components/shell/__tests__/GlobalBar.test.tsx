import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { GlobalBar } from "../GlobalBar";

describe("GlobalBar", () => {
  it("shows the mode badge and calls onSearch", async () => {
    const user = userEvent.setup();
    const onSearch = vi.fn();
    render(<GlobalBar mode={{ kind: "building", label: "Building" }} onSearch={onSearch} />);
    expect(screen.getByText("Building")).toBeInTheDocument();
    const searchButtons = screen.getAllByRole("button", { name: /search/i });
    await user.click(searchButtons[0]);
    expect(onSearch).toHaveBeenCalled();
  });

  it("renders slots for switcher, status pill and account menu", () => {
    render(
      <GlobalBar
        onSearch={() => {}}
        switcher={<button>Switch project</button>}
        statusPill={<span data-testid="status-pill" />}
        accountMenu={<span data-testid="account-menu" />}
      />,
    );
    expect(screen.getByText("Switch project")).toBeInTheDocument();
    expect(screen.getByTestId("status-pill")).toBeInTheDocument();
    expect(screen.getByTestId("account-menu")).toBeInTheDocument();
  });
});
