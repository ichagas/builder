import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MeshDots } from "../MeshDots";

describe("MeshDots", () => {
  it("renders one dot per agent with its letter", () => {
    render(<MeshDots statuses={{ green: "pass", yellow: "warn", red: "fail", blue: "none" }} />);
    expect(screen.getByText("G")).toBeInTheDocument();
    expect(screen.getByText("Y")).toBeInTheDocument();
    expect(screen.getByText("R")).toBeInTheDocument();
    expect(screen.getByText("B")).toBeInTheDocument();
  });

  it("treats an agent left out of `statuses` as not run", () => {
    render(<MeshDots statuses={{ green: "pass" }} />);
    expect(screen.getByLabelText(/Blue Not run/)).toBeInTheDocument();
  });

  // Accessibility: the group carries a single descriptive aria-label
  // summarizing every agent's verdict, since the individual squares are
  // single-letter glyphs with no accessible text on their own otherwise.
  it("exposes an aria-label summarizing every agent's verdict", () => {
    const { container } = render(
      <MeshDots statuses={{ green: "pass", yellow: "warn", red: "fail", blue: "skip" }} />,
    );
    const group = container.querySelector("[aria-label]");
    expect(group).not.toBeNull();
    const label = group!.getAttribute("aria-label")!;
    expect(label).toContain("Green Pass");
    expect(label).toContain("Yellow Warning");
    expect(label).toContain("Red Fail");
    expect(label).toContain("Blue Skipped");
  });

  // Fix round 1, item 4: white text on the green/yellow mesh fills fails
  // WCAG AA in light theme (3.30:1 / 2.94:1) — see
  // src/design/__tests__/contrast.test.ts. Green/yellow use dark ink text
  // (which passes: 5.11:1 / 5.73:1) instead; red/blue keep
  // primary-foreground, which already passes in both themes.
  it("renders dark ink text on green/yellow and primary-foreground on red/blue", () => {
    render(<MeshDots statuses={{ green: "pass", yellow: "pass", red: "pass", blue: "pass" }} />);
    expect(screen.getByText("G").className).toContain("text-ink");
    expect(screen.getByText("Y").className).toContain("text-ink");
    expect(screen.getByText("R").className).toContain("text-primary-foreground");
    expect(screen.getByText("R").className).not.toContain("text-ink");
    expect(screen.getByText("B").className).toContain("text-primary-foreground");
    expect(screen.getByText("B").className).not.toContain("text-ink");
  });
});
