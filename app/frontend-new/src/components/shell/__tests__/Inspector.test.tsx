import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Inspector } from "../Inspector";

function setWidth(width: number) {
  Object.defineProperty(window, "innerWidth", {
    writable: true,
    configurable: true,
    value: width,
  });
}

describe("Inspector", () => {
  afterEach(() => {
    // Restore jsdom's default width so other suites aren't affected.
    setWidth(1024);
  });

  it("renders exactly one instance of the title and content on desktop", () => {
    setWidth(1024);
    render(
      <Inspector title="Properties" onClose={() => {}}>
        <p>Node details</p>
      </Inspector>,
    );
    expect(screen.getAllByText("Properties").length).toBe(1);
    expect(screen.getAllByText("Node details").length).toBe(1);
    expect(screen.getByRole("complementary", { name: "Properties" })).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "Properties" })).not.toBeInTheDocument();
  });

  it("renders exactly one instance of the title and content on mobile", () => {
    setWidth(375);
    render(
      <Inspector title="Properties" onClose={() => {}}>
        <p>Node details</p>
      </Inspector>,
    );
    expect(screen.getAllByText("Properties").length).toBe(1);
    expect(screen.getAllByText("Node details").length).toBe(1);
    expect(screen.getByRole("dialog", { name: "Properties" })).toBeInTheDocument();
    expect(screen.queryByRole("complementary", { name: "Properties" })).not.toBeInTheDocument();
  });

  it("calls onClose from the close button", async () => {
    setWidth(1024);
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <Inspector title="Properties" onClose={onClose}>
        content
      </Inspector>,
    );
    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("cycles the mobile detent on the resize button", async () => {
    setWidth(375);
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
