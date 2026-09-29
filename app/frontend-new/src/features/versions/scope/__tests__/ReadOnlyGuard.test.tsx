import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ReadOnlyGuard } from "../ReadOnlyGuard";

describe("ReadOnlyGuard (P4)", () => {
  const tree = (
    <>
      <button>plain</button>
      <button role="combobox" aria-expanded="false">select</button>
      <button aria-expanded="false">disclosure</button>
      <button role="tab">tab</button>
      <button data-readonly-allow>allowed</button>
      <button role="combobox" aria-expanded="false" data-readonly-allow>view picker</button>
    </>
  );

  it("disables plain buttons and select triggers but keeps navigation usable", () => {
    render(<ReadOnlyGuard active>{tree}</ReadOnlyGuard>);
    expect(screen.getByText("plain")).toBeDisabled();
    expect(screen.getByText("select")).toBeDisabled();
    expect(screen.getByText("disclosure")).toBeEnabled();
    expect(screen.getByText("tab")).toBeEnabled();
    expect(screen.getByText("allowed")).toBeEnabled();
    expect(screen.getByText("view picker")).toBeEnabled();
  });

  it("does nothing when inactive", () => {
    render(<ReadOnlyGuard active={false}>{tree}</ReadOnlyGuard>);
    expect(screen.getByText("plain")).toBeEnabled();
    expect(screen.getByText("select")).toBeEnabled();
  });
});
