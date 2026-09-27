import { afterEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Disclosure } from "../Disclosure";

afterEach(() => {
  window.localStorage.clear();
});

describe("Disclosure", () => {
  it("is closed by default and opens on click, persisting the pref", async () => {
    const user = userEvent.setup();
    render(
      <Disclosure prefKey="notes" summary="17 unchanged requirements">
        <p>Browse them on the timeline.</p>
      </Disclosure>,
    );
    expect(screen.getByText("Browse them on the timeline.")).not.toBeVisible();
    await user.click(screen.getByText("17 unchanged requirements"));
    expect(screen.getByText("Browse them on the timeline.")).toBeVisible();
    expect(window.localStorage.getItem("pronghorn.ui.open.notes")).toBe("1");
  });

  it("restores the persisted open state on remount", () => {
    window.localStorage.setItem("pronghorn.ui.open.notes", "1");
    render(
      <Disclosure prefKey="notes" summary="17 unchanged requirements">
        <p>Content</p>
      </Disclosure>,
    );
    expect(screen.getByText("Content")).toBeVisible();
  });
});
