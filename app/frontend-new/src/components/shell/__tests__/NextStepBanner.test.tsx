import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextStepBanner } from "../NextStepBanner";

describe("NextStepBanner", () => {
  it("renders title, body and an optional CTA", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<NextStepBanner title="Ready to release" body="All checks pass." cta={{ label: "Release v1.5.0", onClick }} tone="ok" />);
    expect(screen.getByText("Ready to release")).toBeInTheDocument();
    expect(screen.getByText("All checks pass.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Release v1.5.0" }));
    expect(onClick).toHaveBeenCalled();
  });

  it("renders without a CTA", () => {
    render(<NextStepBanner title="Released and read-only" body="Select a version to work on changes." tone="lock" />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
