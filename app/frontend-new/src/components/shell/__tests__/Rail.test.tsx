import { afterEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { Rail } from "../Rail";
import type { RailPhase, RailSection } from "../types";

const sections: RailSection[] = [{ id: "versions", label: "All versions", href: "/p/1/versions" }];
const phases: RailPhase[] = [
  { id: "define", label: "Define", state: "done", href: "/p/1/v/current/define/requirements" },
  { id: "design", label: "Design", state: "active", href: "/p/1/v/current/design/canvas", note: "In progress" },
  { id: "build", label: "Build", state: "todo", href: "/p/1/v/current/build/agent" },
  { id: "ship", label: "Ship", state: "skipped", href: "/p/1/v/current/ship/environments" },
];

afterEach(() => {
  window.localStorage.clear();
});

function renderRail() {
  return render(
    <MemoryRouter>
      <Rail sections={sections} phases={phases} />
    </MemoryRouter>,
  );
}

describe("Rail", () => {
  it("renders sections and the four phase nodes", () => {
    renderRail();
    expect(screen.getByText("All versions")).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Phases" })).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(4);
    expect(screen.getByRole("link", { name: /Design: active\. In progress/ })).toBeInTheDocument();
  });

  it("toggles and persists the collapsed preference", async () => {
    const user = userEvent.setup();
    renderRail();
    const toggle = screen.getByRole("button", { name: "Collapse navigation" });
    expect(toggle).toHaveAttribute("aria-pressed", "false");
    await user.click(toggle);
    expect(screen.getByRole("button", { name: "Expand navigation" })).toHaveAttribute("aria-pressed", "true");
    expect(window.localStorage.getItem("pronghorn.ui.rail.collapsed")).toBe("1");
  });

  it("is hidden below the 768px breakpoint via the md:flex utility", () => {
    renderRail();
    expect(screen.getByRole("navigation", { name: "Project" }).className).toMatch(/hidden/);
    expect(screen.getByRole("navigation", { name: "Project" }).className).toMatch(/md:flex/);
  });
});
