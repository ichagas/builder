import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { EmptyState } from "../EmptyState";

describe("EmptyState", () => {
  it("renders the title", () => {
    render(<EmptyState title="No repositories yet" />);
    expect(screen.getByText("No repositories yet")).toBeInTheDocument();
  });

  it("renders an optional description", () => {
    render(<EmptyState title="No repositories yet" description="Connect one to get started." />);
    expect(screen.getByText("Connect one to get started.")).toBeInTheDocument();
  });

  it("renders an optional call to action", () => {
    render(<EmptyState title="No repositories yet" cta={<button type="button">Connect repos</button>} />);
    expect(screen.getByRole("button", { name: "Connect repos" })).toBeInTheDocument();
  });

  it("applies compact padding for the small size", () => {
    const { container } = render(<EmptyState title="Nothing here" size="small" />);
    expect(container.firstElementChild?.className).toContain("p-4");
  });
});
