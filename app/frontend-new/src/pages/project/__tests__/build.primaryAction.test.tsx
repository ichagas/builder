import * as React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { usePublishBuildPrimaryAction, useBuildPrimaryAction } from "../build.primaryAction";

function Publisher({ onClick }: { onClick: () => void }) {
  usePublishBuildPrimaryAction({ label: "Run agent", onClick });
  return null;
}

function Reader() {
  const action = useBuildPrimaryAction();
  return <div data-testid="reader">{action ? action.label : "none"}</div>;
}

describe("build primary action store (T048, WP-B1)", () => {
  it("has no action published before the page mounts", () => {
    render(<Reader />);
    expect(screen.getByTestId("reader").textContent).toBe("none");
  });

  it("reads the page's published action", () => {
    render(
      <>
        <Publisher onClick={() => {}} />
        <Reader />
      </>,
    );
    expect(screen.getByTestId("reader").textContent).toBe("Run agent");
  });

  it("clears the action when the publisher unmounts", () => {
    const { rerender } = render(
      <>
        <Publisher onClick={() => {}} />
        <Reader />
      </>,
    );
    expect(screen.getByTestId("reader").textContent).toBe("Run agent");

    rerender(<Reader />);
    expect(screen.getByTestId("reader").textContent).toBe("none");
  });

  it("fires the published onClick (runs/stops the agent)", () => {
    const onClick = vi.fn();
    let captured: (() => void) | undefined;
    function ReaderCaptures() {
      const action = useBuildPrimaryAction();
      captured = action?.onClick as (() => void) | undefined;
      return null;
    }
    render(
      <>
        <Publisher onClick={onClick} />
        <ReaderCaptures />
      </>,
    );
    captured?.();
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
