import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { dismissUndo, pushUndo } from "@/lib/state/useUndo";
import { UndoBar } from "../UndoBar";

afterEach(() => {
  dismissUndo();
});

describe("UndoBar", () => {
  it("renders nothing when there is no pending undo", () => {
    render(<UndoBar />);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("shows the message and runs the undo action on click", async () => {
    const user = userEvent.setup();
    const onUndo = vi.fn();
    render(<UndoBar />);
    pushUndo({ text: "Deleted WI-40", undo: onUndo });
    expect(await screen.findByText("Deleted WI-40")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Undo" }));
    expect(onUndo).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Deleted WI-40")).not.toBeInTheDocument();
  });

  it("can be dismissed without undoing", async () => {
    const user = userEvent.setup();
    const onUndo = vi.fn();
    render(<UndoBar />);
    pushUndo({ text: "Archived WI-42", undo: onUndo });
    await user.click(await screen.findByRole("button", { name: "Dismiss" }));
    expect(onUndo).not.toHaveBeenCalled();
    expect(screen.queryByText("Archived WI-42")).not.toBeInTheDocument();
  });
});
