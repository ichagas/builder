import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Stepper } from "../Stepper";

const steps = [
  { id: "define", label: "Define", state: "done" as const },
  { id: "build", label: "Build", state: "active" as const },
  { id: "ship", label: "Ship", state: "todo" as const, note: "Not started" },
];

describe("Stepper", () => {
  it("marks the current step and disables future steps", () => {
    render(<Stepper steps={steps} current="build" onSelect={() => {}} />);
    expect(screen.getByRole("button", { name: /Build/ })).toHaveAttribute("aria-current", "step");
    expect(screen.getByRole("button", { name: /Ship/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Define/ })).not.toBeDisabled();
  });

  it("calls onSelect for a reachable step", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<Stepper steps={steps} current="build" onSelect={onSelect} />);
    await user.click(screen.getByRole("button", { name: /Define/ }));
    expect(onSelect).toHaveBeenCalledWith("define");
  });

  it("keeps items shrinkable and truncates labels so five steps fit a phone", () => {
    render(<Stepper steps={steps} current="build" onSelect={() => {}} />);
    const items = screen.getAllByRole("listitem");
    items.forEach((li) => expect(li.className).toContain("min-w-0"));
    const labels = screen.getAllByTestId("step-label");
    // current step: label visible and truncating; others: compact (sr-only) below sm
    expect(labels[1].className).toContain("truncate");
    expect(labels[1].className).not.toContain("sr-only");
    expect(labels[0].className).toContain("sr-only");
    expect(labels[0].className).toContain("sm:truncate");
  });

  it("keeps the full label as the accessible name in compact form", () => {
    render(<Stepper steps={steps} current="build" onSelect={() => {}} />);
    expect(screen.getByRole("button", { name: /Define.*completed/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Ship.*not available yet/ })).toBeInTheDocument();
  });
});
