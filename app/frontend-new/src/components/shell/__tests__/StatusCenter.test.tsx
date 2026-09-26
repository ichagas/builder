import { afterEach, describe, expect, it } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { __resetLongTasksForTests, startLongTask } from "@/lib/state/useLongTask";
import { StatusCenter } from "../StatusCenter";

afterEach(() => {
  act(() => __resetLongTasksForTests());
});

describe("StatusCenter", () => {
  it("shows nothing running when idle, and opens the popover on click", async () => {
    const user = userEvent.setup();
    render(<StatusCenter />);
    expect(screen.getByRole("button")).toHaveAccessibleName(/nothing running/i);
    await user.click(screen.getByRole("button"));
    expect(screen.getByRole("dialog", { name: "Running and recent" })).toBeInTheDocument();
    expect(screen.getByText("Nothing running")).toBeInTheDocument();
  });

  it("lists a running task and reflects it on the trigger", async () => {
    const user = userEvent.setup();
    render(<StatusCenter />);
    act(() => {
      startLongTask({ id: "status-center-agent-1", label: "Fixing WI-99" });
    });
    expect(screen.getByRole("button")).toHaveAccessibleName(/1 running/i);
    await user.click(screen.getByRole("button"));
    expect(screen.getByText("Fixing WI-99")).toBeInTheDocument();
  });

  it("closes the popover on Escape", async () => {
    const user = userEvent.setup();
    render(<StatusCenter />);
    await user.click(screen.getByRole("button"));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
