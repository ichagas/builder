import * as React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { usePublishCanvasPrimaryAction, useCanvasPrimaryAction } from "../canvas.primaryAction";

function Publisher({ label, disabled }: { label: string; disabled?: boolean }) {
  usePublishCanvasPrimaryAction({ label, disabled, onClick: () => {} });
  return null;
}

function Reader() {
  const action = useCanvasPrimaryAction();
  return <div data-testid="reader">{action ? `${action.label}:${action.disabled ? "disabled" : "enabled"}` : "none"}</div>;
}

describe("canvas primary action store (T046, WP-G1)", () => {
  it("has no action published before the page mounts", () => {
    render(<Reader />);
    expect(screen.getByTestId("reader").textContent).toBe("none");
  });

  it("reads the page's published action, including updates across renders", () => {
    const { rerender } = render(
      <>
        <Publisher label="AI Architect" />
        <Reader />
      </>,
    );
    expect(screen.getByTestId("reader").textContent).toBe("AI Architect:enabled");

    rerender(
      <>
        <Publisher label="AI Architect" disabled />
        <Reader />
      </>,
    );
    expect(screen.getByTestId("reader").textContent).toBe("AI Architect:disabled");
  });

  it("clears the action when the publisher unmounts (e.g. token missing)", () => {
    const { rerender } = render(
      <>
        <Publisher label="AI Architect" />
        <Reader />
      </>,
    );
    expect(screen.getByTestId("reader").textContent).toBe("AI Architect:enabled");

    rerender(<Reader />);
    expect(screen.getByTestId("reader").textContent).toBe("none");
  });

  it("fires the published onClick", () => {
    const onClick = vi.fn();
    function PublisherWithClick() {
      usePublishCanvasPrimaryAction({ label: "AI Architect", onClick });
      return null;
    }
    let captured: (() => void) | undefined;
    function ReaderCaptures() {
      const action = useCanvasPrimaryAction();
      captured = action?.onClick as (() => void) | undefined;
      return null;
    }
    render(
      <>
        <PublisherWithClick />
        <ReaderCaptures />
      </>,
    );
    captured?.();
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
