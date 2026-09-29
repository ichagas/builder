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

  it("moves focus into the popover, returns it to the pill on Escape (T160)", async () => {
    const user = userEvent.setup();
    render(<StatusCenter />);
    const pill = screen.getByRole("button");
    await user.click(pill);
    expect(screen.getByRole("dialog")).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(pill).toHaveFocus();
  });

  it("announces async completion through a polite live region (T160)", () => {
    render(<StatusCenter />);
    const live = screen.getByRole("status");
    expect(live).toHaveTextContent("");
    act(() => {
      startLongTask({ id: "status-center-agent-2", label: "Fixing WI-7" });
    });
    expect(live).toHaveTextContent("1 running");
    act(() => __resetLongTasksForTests());
    expect(live).toHaveTextContent("All tasks finished");
  });
});
