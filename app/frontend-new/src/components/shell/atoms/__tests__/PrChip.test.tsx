import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { PrChip } from "../PrChip";

describe("PrChip", () => {
  it("renders a bare PR number with no state", () => {
    render(<PrChip number={42} />);
    expect(screen.getByText("PR #42")).toBeInTheDocument();
  });

  it("renders the state alongside the number", () => {
    render(<PrChip number={7} state="open" />);
    expect(screen.getByText("PR #7 · open")).toBeInTheDocument();
  });

  it("renders custom children for a state-only chip (e.g. 'Not opened')", () => {
    render(<PrChip state="none">Not opened</PrChip>);
    expect(screen.getByText("Not opened")).toBeInTheDocument();
  });

  it("applies the open-state token classes", () => {
    render(<PrChip number={1} state="open" />);
    const el = screen.getByText("PR #1 · open");
    expect(el.className).toContain("text-primary");
    expect(el.className).toContain("border-primary");
  });
});
