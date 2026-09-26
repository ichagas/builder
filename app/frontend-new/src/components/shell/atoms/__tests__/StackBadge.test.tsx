import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { StackBadge } from "../StackBadge";

describe("StackBadge", () => {
  it("renders the given label", () => {
    render(<StackBadge profile="node" label="Node 20" />);
    expect(screen.getByText("Node 20")).toBeInTheDocument();
  });

  it.each([
    ["dotnet", "bg-define"],
    ["node", "bg-ship"],
    ["java", "bg-build"],
    ["python", "bg-mesh-blue"],
  ] as const)("colors the %s dot with a design token class", (profile, expectedClass) => {
    const { container } = render(<StackBadge profile={profile} label={profile} />);
    const dot = container.querySelector("span[aria-hidden='true']");
    expect(dot?.className).toContain(expectedClass);
  });
});
