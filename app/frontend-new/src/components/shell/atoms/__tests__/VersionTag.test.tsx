import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { VersionTag } from "../VersionTag";

describe("VersionTag", () => {
  it("renders the version string", () => {
    render(<VersionTag version="v1.0.0" />);
    expect(screen.getByText("v1.0.0")).toBeInTheDocument();
  });

  it("shows a labeled lock glyph when locked", () => {
    render(<VersionTag version="v1.0.0" locked />);
    expect(screen.getByLabelText("Locked")).toBeInTheDocument();
  });

  it("omits the lock glyph by default", () => {
    render(<VersionTag version="v1.1.0" />);
    expect(screen.queryByLabelText("Locked")).not.toBeInTheDocument();
  });
});
