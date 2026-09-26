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
});
