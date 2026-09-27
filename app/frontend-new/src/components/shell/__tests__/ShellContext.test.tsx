import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ShellProvider, useShell } from "../ShellContext";

function Probe() {
  const { embedded } = useShell();
  return <span data-testid="embedded">{String(embedded)}</span>;
}

describe("ShellContext (T034)", () => {
  it("defaults to embedded=false outside a ShellProvider", () => {
    render(<Probe />);
    expect(screen.getByTestId("embedded").textContent).toBe("false");
  });

  it("reports embedded=true inside a ShellProvider", () => {
    render(
      <ShellProvider embedded>
        <Probe />
      </ShellProvider>,
    );
    expect(screen.getByTestId("embedded").textContent).toBe("true");
  });
});
