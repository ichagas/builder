import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { TypeChip } from "../TypeChip";

describe("TypeChip", () => {
  it("renders the default label for each change type", () => {
    render(
      <>
        <TypeChip type="bug" />
        <TypeChip type="feature" />
        <TypeChip type="enhancement" />
        <TypeChip type="base" />
      </>,
    );
    expect(screen.getByText("Bug")).toBeInTheDocument();
    expect(screen.getByText("Feature")).toBeInTheDocument();
    expect(screen.getByText("Enhancement")).toBeInTheDocument();
    expect(screen.getByText("Baseline")).toBeInTheDocument();
  });

  it("accepts a label override", () => {
    render(<TypeChip type="bug" label="Défaut" />);
    expect(screen.getByText("Défaut")).toBeInTheDocument();
  });

  it("uses token classes, not raw palette colors", () => {
    render(<TypeChip type="bug" />);
    const el = screen.getByText("Bug");
    expect(el.className).toContain("bg-bug-soft");
    expect(el.className).toContain("text-bug");
    expect(el.className).not.toMatch(/-(red|green|blue|amber|yellow)-\d/);
  });

  // Fix round 1, item 2: base.css:183 `.type` has no font-family override
  // (plain text, not mono) and sizes text 12px/700 with 5px/8px padding.
  it("matches the prototype's plain (non-mono) 12px bold chip, not mono", () => {
    render(<TypeChip type="bug" />);
    const el = screen.getByText("Bug");
    expect(el.className).toContain("text-xs");
    expect(el.className).toContain("font-bold");
    expect(el.className).toContain("py-[5px]");
    expect(el.className).not.toContain("font-mono");
  });

  it("merges an extra className without dropping token classes", () => {
    render(<TypeChip type="feature" className="ml-2" />);
    const el = screen.getByText("Feature");
    expect(el.className).toContain("ml-2");
    expect(el.className).toContain("bg-feat-soft");
  });
});
