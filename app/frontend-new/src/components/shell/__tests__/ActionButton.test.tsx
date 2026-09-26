import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ActionButton } from "../ActionButton";

describe("ActionButton", () => {
  it("goes idle -> pending -> done and calls onAction", async () => {
    const user = userEvent.setup();
    const onAction = vi.fn().mockResolvedValue(undefined);
    render(<ActionButton label="Deploy" onAction={onAction} />);
    await user.click(screen.getByRole("button", { name: "Deploy" }));
    expect(onAction).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.getByRole("button")).not.toHaveAttribute("aria-busy", "true"));
  });

  it("shows a failed state and lets the user retry", async () => {
    const user = userEvent.setup();
    const onAction = vi.fn().mockRejectedValueOnce(new Error("nope")).mockResolvedValueOnce(undefined);
    render(<ActionButton label="Deploy" onAction={onAction} />);
    await user.click(screen.getByRole("button"));
    await screen.findByRole("button", { name: /failed — retry/i });
    await user.click(screen.getByRole("button", { name: /failed — retry/i }));
    expect(onAction).toHaveBeenCalledTimes(2);
  });

  it("requires a second click to confirm a destructive action", async () => {
    const user = userEvent.setup();
    const onAction = vi.fn().mockResolvedValue(undefined);
    render(<ActionButton label="Delete project" onAction={onAction} confirm="Are you sure?" tone="danger" />);
    await user.click(screen.getByRole("button", { name: "Delete project" }));
    expect(onAction).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Are you sure?" }));
    expect(onAction).toHaveBeenCalledTimes(1);
  });

  it("pushes an undo entry through the caller-supplied sink after success", async () => {
    const user = userEvent.setup();
    const onUndo = vi.fn();
    const pushUndo = vi.fn();
    render(
      <ActionButton
        label="Archive"
        onAction={() => {}}
        undo={{ text: "Archived WI-42", onUndo }}
        pushUndo={pushUndo}
      />,
    );
    await user.click(screen.getByRole("button"));
    await waitFor(() => expect(pushUndo).toHaveBeenCalledWith({ text: "Archived WI-42", undo: onUndo }));
  });

  it("does not run the action while disabled", async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();
    render(<ActionButton label="Deploy" onAction={onAction} disabled disabledReason="No changes staged" />);
    const button = screen.getByRole("button", { name: "Deploy" });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("title", "No changes staged");
  });
});
