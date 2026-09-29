import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ActionButton, ActionSpecButton } from "../ActionButton";
import { dismissUndo, useUndo } from "@/lib/state/useUndo";

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

function UndoProbe() {
  const { current } = useUndo();
  return <output data-testid="undo">{current?.text ?? ""}</output>;
}
const getUndoText = () => screen.getByTestId("undo").textContent;

describe("ActionSpecButton (async onClick)", () => {
  it("shows pending while the promise is open, then pushes undo after it resolves", async () => {
    dismissUndo();
    const user = userEvent.setup();
    let resolve!: () => void;
    const onClick = vi.fn(() => new Promise<void>((r) => (resolve = r)));
    render(
      <>
        <UndoProbe />
        <ActionSpecButton spec={{ label: "Ship", onClick, undo: { text: "Shipped", onUndo: vi.fn() } }} />
      </>,
    );
    await user.click(screen.getByRole("button", { name: "Ship" }));
    expect(screen.getByRole("button")).toBeDisabled();
    expect(screen.getByRole("button")).toHaveAttribute("aria-busy", "true");
    expect(getUndoText()).toBe("");
    resolve();
    await waitFor(() => expect(getUndoText()).toBe("Shipped"));
    expect(screen.getByRole("button")).not.toHaveAttribute("aria-busy", "true");
    dismissUndo();
  });

  it("enters failed on rejection and pushes no undo", async () => {
    dismissUndo();
    const user = userEvent.setup();
    const onClick = vi.fn().mockRejectedValue(new Error("boom"));
    render(
      <>
        <UndoProbe />
        <ActionSpecButton spec={{ label: "Ship", onClick, undo: { text: "Shipped", onUndo: vi.fn() } }} />
      </>,
    );
    await user.click(screen.getByRole("button", { name: "Ship" }));
    await screen.findByRole("button", { name: "Ship failed — retry" });
    expect(getUndoText()).toBe("");
  });
});
