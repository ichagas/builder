import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { AdoptionBar } from "../AdoptionBar";

describe("AdoptionBar", () => {
  it("renders a segment per entry with its version and count", () => {
    render(
      <AdoptionBar
        segments={[
          { version: "2026.2", count: 12, latest: true },
          { version: "2026.1", count: 3 },
        ]}
      />,
    );
    expect(screen.getByText("2026.2 · 12")).toBeInTheDocument();
    expect(screen.getByText("2026.1 · 3")).toBeInTheDocument();
  });

  // Accessibility: the bar is a set of proportional <span>s with no text
  // alternative individually meaningful without visual width, so the whole
  // bar carries role="img" + a single summarizing aria-label.
  it("exposes an accessible summary via role=img", () => {
    render(<AdoptionBar segments={[{ version: "2026.2", count: 12, latest: true }, { version: "2026.1", count: 3 }]} />);
    const bar = screen.getByRole("img");
    expect(bar).toHaveAttribute("aria-label", "12 on 2026.2, 3 on 2026.1");
  });

  it("styles the latest segment as ok and older segments as warn", () => {
    render(<AdoptionBar segments={[{ version: "2026.2", count: 12, latest: true }, { version: "2026.1", count: 3 }]} />);
    expect(screen.getByText("2026.2 · 12").className).toContain("bg-ok");
    expect(screen.getByText("2026.1 · 3").className).toContain("bg-warn-soft");
  });
});
