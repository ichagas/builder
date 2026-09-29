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

  it("keeps the more/fewer buttons out of the tablist", async () => {
    const user = userEvent.setup();
    const nodes: TimelineNode[] = ["1", "2", "3", "4", "5"].map((n) => ({ id: `v${n}`, label: `v${n}`, kind: "hist" as const }));
    render(<TimelineStrip nodes={nodes} selectedId="v5" onSelect={() => {}} visibleHistoryCount={2} />);
    const tablist = screen.getByRole("tablist");
    expect(tablist).not.toContainElement(screen.getByText("3 more").closest("button"));
    await user.click(screen.getByText("3 more"));
    expect(tablist).not.toContainElement(screen.getByRole("button", { name: "Fewer" }));
    tablist.querySelectorAll("button").forEach((b) => expect(b).toHaveAttribute("role", "tab"));
  });

  it("gives each strip its own hint id", () => {
    const nodes: TimelineNode[] = [{ id: "a", label: "a", kind: "building" }];
    render(
      <>
        <TimelineStrip nodes={nodes} selectedId="a" onSelect={() => {}} />
        <TimelineStrip nodes={nodes} selectedId="a" onSelect={() => {}} />
      </>,
    );
    const [one, two] = screen.getAllByRole("tablist");
    const ids = [one, two].map((el) => el.getAttribute("aria-describedby"));
    expect(ids[0]).not.toBe(ids[1]);
    ids.forEach((id) => expect(document.querySelectorAll(`[id="${id}"]`)).toHaveLength(1));
  });
});
