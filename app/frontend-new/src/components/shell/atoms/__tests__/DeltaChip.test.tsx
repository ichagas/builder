import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { DeltaChip } from "../DeltaChip";

describe("DeltaChip", () => {
  it("renders a default label per kind", () => {
    render(
      <>
        <DeltaChip kind="new" />
        <DeltaChip kind="changed" />
        <DeltaChip kind="regression" />
      </>,
    );
    expect(screen.getByText("New")).toBeInTheDocument();
    expect(screen.getByText("Changed")).toBeInTheDocument();
    expect(screen.getByText("Regression")).toBeInTheDocument();
  });

  it("renders custom children instead of the default label", () => {
    render(<DeltaChip kind="new">All pass</DeltaChip>);
    expect(screen.getByText("All pass")).toBeInTheDocument();
    expect(screen.queryByText("New")).not.toBeInTheDocument();
  });

  it("maps kind to status tokens", () => {
    render(<DeltaChip kind="regression" />);
    const el = screen.getByText("Regression");
    expect(el.className).toContain("bg-bad-soft");
    expect(el.className).toContain("text-bad");
  });
});
