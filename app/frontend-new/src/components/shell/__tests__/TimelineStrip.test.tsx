import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TimelineStrip } from "../TimelineStrip";
import type { TimelineNode } from "../types";

afterEach(() => {
  window.localStorage.clear();
});

describe("TimelineStrip", () => {
  it("renders a single building node until B1 (D-7)", () => {
    const nodes: TimelineNode[] = [{ id: "building", label: "v1.5.0", sub: "Building", kind: "building" }];
    render(<TimelineStrip nodes={nodes} selectedId="building" onSelect={() => {}} />);
    expect(screen.getByRole("tab", { name: /v1\.5\.0/ })).toHaveAttribute("aria-selected", "true");
  });

  it("collapses older history into an 'N more' control and expands on click", async () => {
    const user = userEvent.setup();
    const nodes: TimelineNode[] = [
      { id: "v1.0.0", label: "v1.0.0", kind: "hist" },
      { id: "v1.1.0", label: "v1.1.0", kind: "hist" },
      { id: "v1.2.0", label: "v1.2.0", kind: "hist" },
      { id: "v1.3.0", label: "v1.3.0", kind: "hist" },
      { id: "v1.4.0", label: "v1.4.0", kind: "hist" },
      { id: "v1.4.2", label: "v1.4.2", kind: "current" },
    ];
    render(<TimelineStrip nodes={nodes} selectedId="v1.4.2" onSelect={() => {}} visibleHistoryCount={2} />);
    expect(screen.getByText("3 more")).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "v1.0.0" })).not.toBeInTheDocument();
    await user.click(screen.getByText("3 more"));
    expect(screen.getByRole("tab", { name: "v1.0.0" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Fewer" })).toBeInTheDocument();
  });

  it("shows a first-release flag after its node", () => {
    const nodes: TimelineNode[] = [{ id: "v1.0.0", label: "v1.0.0", kind: "hist" }];
    render(
      <TimelineStrip
        nodes={nodes}
        flags={[{ afterId: "v1.0.0", label: "First release" }]}
        selectedId="v1.0.0"
        onSelect={() => {}}
      />,
    );
    expect(screen.getByText("First release")).toBeInTheDocument();
  });

  it("calls onSelect with the clicked node's id", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const nodes: TimelineNode[] = [
      { id: "v1.0.0", label: "v1.0.0", kind: "hist" },
      { id: "v1.1.0", label: "v1.1.0", kind: "current" },
    ];
    render(<TimelineStrip nodes={nodes} selectedId="v1.1.0" onSelect={onSelect} />);
    await user.click(screen.getByRole("tab", { name: "v1.0.0" }));
    expect(onSelect).toHaveBeenCalledWith("v1.0.0");
  });
});
