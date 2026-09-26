import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StatusPill } from "../StatusPill";

describe("StatusPill", () => {
  it("announces nothing running when idle", () => {
    render(<StatusPill runningCount={0} onClick={() => {}} expanded={false} />);
    expect(screen.getByRole("button")).toHaveAccessibleName(/nothing running/i);
  });

  it("announces the running count", () => {
    render(<StatusPill runningCount={2} onClick={() => {}} expanded={false} />);
    expect(screen.getByRole("button")).toHaveAccessibleName(/2 running/i);
  });

  it("calls onClick and reflects aria-expanded", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<StatusPill runningCount={1} onClick={onClick} expanded aria-controls="status-center" />);
    const button = screen.getByRole("button");
    expect(button).toHaveAttribute("aria-expanded", "true");
    expect(button).toHaveAttribute("aria-controls", "status-center");
    await user.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
