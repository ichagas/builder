import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { PhaseNode } from "../PhaseNode";

describe("PhaseNode", () => {
  it("labels the state and note for assistive tech", () => {
    render(
      <MemoryRouter>
        <PhaseNode phase={{ id: "build", label: "Build", state: "active", note: "Agent fixing", href: "/build" }} />
      </MemoryRouter>,
    );
    expect(screen.getByRole("link", { name: "Build: active. Agent fixing" })).toBeInTheDocument();
  });

  it("hides the text label when collapsed but keeps the aria-label", () => {
    render(
      <MemoryRouter>
        <PhaseNode phase={{ id: "ship", label: "Ship", state: "done", href: "/ship" }} collapsed />
      </MemoryRouter>,
    );
    const link = screen.getByRole("link", { name: "Ship: done" });
    expect(link.textContent).toBe("");
  });
});
