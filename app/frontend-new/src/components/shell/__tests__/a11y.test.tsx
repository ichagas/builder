import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as React from "react";
import { MemoryRouter } from "react-router-dom";
import { MeshDots } from "../atoms/MeshDots";
import { TimelineStrip } from "../TimelineStrip";
import { Inspector } from "../Inspector";
import { Rail } from "../Rail";
import type { TimelineNode } from "../types";

afterEach(() => window.localStorage.clear());

describe("MeshDots screen-reader semantics (T160)", () => {
  it("is one labelled image: the four letters are hidden from assistive tech", () => {
    render(<MeshDots statuses={{ green: "pass", yellow: "warn", red: "fail", blue: "skip" }} />);
    const img = screen.getByRole("img");
    expect(img).toHaveAccessibleName("Assurance Mesh: Green Pass, Yellow Warning, Red Fail, Blue Skipped");
    // children are aria-hidden, so no other accessible text nodes are exposed
    expect(img.querySelectorAll('[aria-hidden="true"]').length).toBe(4);
  });

  it("names agents that did not report as Not run", () => {
    render(<MeshDots statuses={{}} />);
    expect(screen.getByRole("img")).toHaveAccessibleName(/Green Not run, Yellow Not run, Red Not run, Blue Not run/);
  });
});

describe("TimelineStrip keyboard + announcements (T160)", () => {
  const nodes: TimelineNode[] = [
    { id: "v1.0.0", label: "v1.0.0", kind: "hist" },
    { id: "v1.4.2", label: "v1.4.2", kind: "current" },
    { id: "v1.5.0", label: "v1.5.0", kind: "building" },
  ];

  it("has a single tab stop (the selected version) and announces its kind", () => {
    render(<TimelineStrip nodes={nodes} selectedId="v1.4.2" onSelect={() => {}} />);
    const tabs = screen.getAllByRole("tab");
    expect(tabs.map((t) => t.getAttribute("tabindex"))).toEqual(["-1", "0", "-1"]);
    expect(screen.getByRole("tab", { name: /v1\.4\.2.*current release/ })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: /v1\.5\.0.*in progress/ })).toBeInTheDocument();
    expect(screen.getByRole("tablist")).toHaveAccessibleDescription(/arrow keys/i);
  });

  it("falls back to the first version as tab stop when the selection is not visible", () => {
    render(<TimelineStrip nodes={nodes} selectedId="nope" onSelect={() => {}} />);
    expect(screen.getAllByRole("tab")[0]).toHaveAttribute("tabindex", "0");
  });

  it("moves focus with arrow keys, Home and End without selecting; Enter selects", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<TimelineStrip nodes={nodes} selectedId="v1.4.2" onSelect={onSelect} />);
    await user.tab();
    const [first, second, third] = screen.getAllByRole("tab");
    expect(second).toHaveFocus();
    await user.keyboard("{ArrowRight}");
    expect(third).toHaveFocus();
    await user.keyboard("{ArrowRight}");
    expect(first).toHaveFocus(); // wraps
    await user.keyboard("{End}");
    expect(third).toHaveFocus();
    await user.keyboard("{Home}");
    expect(first).toHaveFocus();
    expect(onSelect).not.toHaveBeenCalled();
    await user.keyboard("{Enter}");
    expect(onSelect).toHaveBeenCalledWith("v1.0.0");
  });
});

describe("Inspector focus management (T160)", () => {
  function Harness() {
    const [open, setOpen] = React.useState(false);
    return (
      <>
        <button onClick={() => setOpen(true)}>Open details</button>
        {open ? (
          <Inspector title="Properties" onClose={() => setOpen(false)}>
            <button>Inside</button>
          </Inspector>
        ) : null}
      </>
    );
  }

  it("moves focus into the panel on open, closes on Escape and restores focus to the opener", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const opener = screen.getByRole("button", { name: "Open details" });
    await user.click(opener);
    expect(screen.getByRole("complementary", { name: "Properties" })).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
  });
});

describe("Rail collapsed rows keep an accessible name (T160)", () => {
  it("labels icon-only rows when the rail is collapsed", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <Rail sections={[{ id: "all", label: "All versions", href: "/x", count: 3 }]} />
      </MemoryRouter>,
    );
    await user.click(screen.getByRole("button", { name: "Collapse navigation" }));
    expect(screen.getByRole("link", { name: "All versions (3)" })).toBeInTheDocument();
  });
});
