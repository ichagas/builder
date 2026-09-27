import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { MobileTabBar } from "../MobileTabBar";

const items = [
  { id: "versions", label: "Versions", href: "/p/1/versions" },
  { id: "define", label: "Define", href: "/p/1/v/current/define/requirements" },
  { id: "design", label: "Design", href: "/p/1/v/current/design/canvas" },
  { id: "build", label: "Build", href: "/p/1/v/current/build/agent" },
  { id: "ship", label: "Ship", href: "/p/1/v/current/ship/environments" },
];

describe("MobileTabBar", () => {
  it("renders one link per item and marks the active route", () => {
    render(
      <MemoryRouter initialEntries={["/p/1/v/current/design/canvas"]}>
        <MobileTabBar items={items} />
      </MemoryRouter>,
    );
    expect(screen.getAllByRole("link")).toHaveLength(5);
    expect(screen.getByRole("link", { name: /Design/ })).toHaveClass("text-rail-ink");
  });

  it("is keyboard reachable (real links, tab order)", () => {
    render(
      <MemoryRouter>
        <MobileTabBar items={items} />
      </MemoryRouter>,
    );
    items.forEach((item) => {
      expect(screen.getByRole("link", { name: new RegExp(item.label) })).toHaveAttribute("href", item.href);
    });
  });
});
