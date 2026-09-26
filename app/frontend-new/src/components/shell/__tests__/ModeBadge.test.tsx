import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ModeBadge } from "../ModeBadge";

describe("ModeBadge", () => {
  it("renders the given label", () => {
    render(<ModeBadge kind="building" label="Building" />);
    expect(screen.getByText("Building")).toBeInTheDocument();
  });

  it("renders a released version label", () => {
    render(<ModeBadge kind="released" label="Released v1.4.2" />);
    expect(screen.getByText("Released v1.4.2")).toBeInTheDocument();
  });
});
