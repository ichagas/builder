import * as React from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

const mockUseAdmin = vi.fn();
vi.mock("@/contexts/AdminContext", () => ({
  useAdmin: () => mockUseAdmin(),
}));

import { useTechStacksPrimaryAction, TECH_STACK_NAME_INPUT_ID } from "../techStacks.primaryAction";

function Probe() {
  const action = useTechStacksPrimaryAction();
  return (
    <div>
      <input id={TECH_STACK_NAME_INPUT_ID} placeholder="New tech stack name..." />
      <div data-testid="action">{action ? "present" : "none"}</div>
      <div data-testid="label">{action?.label}</div>
      <button data-testid="trigger" onClick={() => action?.onClick?.()} />
    </div>
  );
}

describe("useTechStacksPrimaryAction (WP-L2, T061)", () => {
  beforeEach(() => {
    mockUseAdmin.mockReset();
  });

  it("returns undefined for non-admins, same as legacy hiding the create control entirely", () => {
    mockUseAdmin.mockReturnValue({ isAdmin: false });
    render(<Probe />);
    expect(screen.getByTestId("action").textContent).toBe("none");
  });

  it("is present for admins and focuses the inline create input on click", () => {
    mockUseAdmin.mockReturnValue({ isAdmin: true });
    render(<Probe />);
    expect(screen.getByTestId("action").textContent).toBe("present");
    expect(screen.getByTestId("label").textContent).toBe("New tech stack");

    const input = screen.getByPlaceholderText("New tech stack name...");
    expect(input).not.toHaveFocus();
    fireEvent.click(screen.getByTestId("trigger"));
    expect(input).toHaveFocus();
  });
});
