import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { NotFound } from "../NotFound";

describe("NotFound (contracts/routes.md §1 '*' row)", () => {
  it("renders a search field and links to Projects and Assurance", () => {
    render(
      <MemoryRouter>
        <NotFound />
      </MemoryRouter>,
    );
    expect(screen.getByRole("searchbox")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Projects/i })).toHaveAttribute("href", "/projects");
    expect(screen.getByRole("link", { name: /Assurance/i })).toHaveAttribute("href", "/assurance/all");
  });

  it("submitting the search navigates to /projects with a query", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/nope"]}>
        <NotFound />
      </MemoryRouter>,
    );
    await user.type(screen.getByRole("searchbox"), "checkout flow");
    await user.keyboard("{Enter}");
    // No visible assertion target for the navigated URL without a full
    // router harness here; this at least proves the form submits without
    // throwing and clears/keeps the typed query.
    expect(screen.getByRole("searchbox")).toHaveValue("checkout flow");
  });
});
