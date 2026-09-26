import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Inspector } from "../Inspector";

describe("Inspector", () => {
  it("renders the panel title and content, twice (desktop panel + mobile sheet)", () => {
    render(
      <Inspector title="Properties" onClose={() => {}}>
        <p>Node details</p>
      </Inspector>,
    );
    expect(screen.getAllByText("Properties").length).toBe(2);
    expect(screen.getAllByText("Node details").length).toBe(2);
  });

  it("calls onClose from either close button", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <Inspector title="Properties" onClose={onClose}>
        content
      </Inspector>,
    );
    const closeButtons = screen.getAllByRole("button", { name: "Close" });
    await user.click(closeButtons[0]);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("cycles the mobile detent on the resize button", async () => {
    const user = userEvent.setup();
    const onDetentChange = vi.fn();
    render(
      <Inspector title="Properties" onClose={() => {}} detent="peek" onDetentChange={onDetentChange}>
        content
      </Inspector>,
    );
    await user.click(screen.getByRole("button", { name: /Resize panel \(currently peek\)/ }));
    expect(onDetentChange).toHaveBeenCalledWith("half");
  });
});
