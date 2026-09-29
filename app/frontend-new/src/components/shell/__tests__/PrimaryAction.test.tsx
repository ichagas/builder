import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PageHeader } from "../PageHeader";
import { PrimaryActionProvider } from "../PrimaryActionContext";
import { PrimaryActionSlot } from "../PrimaryActionSlot";
import { UndoBar } from "../UndoBar";
import { dismissUndo } from "@/lib/state/useUndo";
import type { ActionSpec } from "../types";

function setup(primary: ActionSpec) {
  return render(
    <PrimaryActionProvider>
      <PageHeader title="Page" primary={primary} />
      <PrimaryActionSlot />
      <UndoBar />
    </PrimaryActionProvider>,
  );
}

afterEach(() => dismissUndo());

describe("primary action (PageHeader + PrimaryActionSlot via ActionButton)", () => {
  it("runs a plain action on a single click, in header and mobile slot", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    setup({ label: "Save", onClick });
    const buttons = screen.getAllByRole("button", { name: "Save" });
    expect(buttons).toHaveLength(2);
    await user.click(buttons[0]);
    await user.click(buttons[1]);
    expect(onClick).toHaveBeenCalledTimes(2);
  });

  it("confirm: first click asks, cancel (blur) does not run, second click runs", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    setup({ label: "Delete", confirm: "Really delete?", tone: "danger", onClick });
    await user.click(screen.getAllByRole("button", { name: "Delete" })[0]);
    expect(onClick).not.toHaveBeenCalled();
    expect(screen.getAllByRole("button", { name: "Really delete?" })).toHaveLength(1);
    // cancel: focus moves away
    await user.click(document.body);
    expect(screen.getAllByRole("button", { name: "Delete" })).toHaveLength(2);
    expect(onClick).not.toHaveBeenCalled();
    await user.click(screen.getAllByRole("button", { name: "Delete" })[0]);
    await user.click(screen.getByRole("button", { name: "Really delete?" }));
    await waitFor(() => expect(onClick).toHaveBeenCalledTimes(1));
  });

  it("undo: pushes an UndoBar entry after the action succeeds", async () => {
    const user = userEvent.setup();
    const onUndo = vi.fn();
    setup({ label: "Archive", onClick: () => {}, undo: { text: "Archived item", onUndo } });
    await user.click(screen.getAllByRole("button", { name: "Archive" })[0]);
    expect(await screen.findByText("Archived item")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /undo/i }));
    expect(onUndo).toHaveBeenCalledTimes(1);
  });
});
