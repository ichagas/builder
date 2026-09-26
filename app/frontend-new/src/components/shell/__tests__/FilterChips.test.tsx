import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router-dom";
import { FilterChips } from "../FilterChips";

const options = [
  { id: "all", label: "All", count: 5 },
  { id: "active", label: "Active", count: 3 },
  { id: "shipped", label: "Shipped", count: 2 },
];

function Search() {
  return <span data-testid="search">{useLocation().search}</span>;
}

describe("FilterChips", () => {
  it("marks the active filter and binds selection to ?f=", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <FilterChips options={options} />
        <Search />
      </MemoryRouter>,
    );
    expect(screen.getByRole("button", { name: /All5/ })).toHaveAttribute("aria-pressed", "true");
    await user.click(screen.getByRole("button", { name: /Active3/ }));
    expect(screen.getByRole("button", { name: /Active3/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("search").textContent).toBe("?f=active");
  });
});
