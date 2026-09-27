import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ShellProvider } from "@/components/shell/ShellContext";
import { ProjectPageHeader } from "../ProjectPageHeader";

describe("ProjectPageHeader embedded mode (T034)", () => {
  it("renders normally outside the new shell", () => {
    render(<ProjectPageHeader title="Requirements" onMenuClick={() => {}} />);
    expect(screen.getByRole("heading", { name: "Requirements" })).toBeInTheDocument();
  });

  it("renders nothing inside the new shell (ShellProvider embedded)", () => {
    render(
      <ShellProvider embedded>
        <ProjectPageHeader title="Requirements" onMenuClick={() => {}} />
      </ShellProvider>,
    );
    expect(screen.queryByRole("heading", { name: "Requirements" })).not.toBeInTheDocument();
  });
});
