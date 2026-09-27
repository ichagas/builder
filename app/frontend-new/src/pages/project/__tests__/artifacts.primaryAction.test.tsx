import * as React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { usePublishArtifactsPrimaryAction, useArtifactsPrimaryAction } from "../artifacts.primaryAction";

function Publisher({ label, disabled }: { label: string; disabled?: boolean }) {
  usePublishArtifactsPrimaryAction({ label, disabled, onClick: () => {} });
  return null;
}

function Reader() {
  const action = useArtifactsPrimaryAction();
  return <div data-testid="reader">{action ? `${action.label}:${action.disabled ? "disabled" : "enabled"}` : "none"}</div>;
}

describe("artifacts primary action store (T044, WP-D3)", () => {
  it("has no action published before the page mounts", () => {
    render(<Reader />);
    expect(screen.getByTestId("reader").textContent).toBe("none");
  });

  it("reads the page's published action, including updates across renders", () => {
    const { rerender } = render(
      <>
        <Publisher label="Add artifact" />
        <Reader />
      </>,
    );
    expect(screen.getByTestId("reader").textContent).toBe("Add artifact:enabled");

    rerender(
      <>
        <Publisher label="Add artifact" disabled />
        <Reader />
      </>,
    );
    expect(screen.getByTestId("reader").textContent).toBe("Add artifact:disabled");
  });

  it("clears the action when the publisher unmounts", () => {
    const { rerender } = render(
      <>
        <Publisher label="Add artifact" />
        <Reader />
      </>,
    );
    expect(screen.getByTestId("reader").textContent).toBe("Add artifact:enabled");

    rerender(<Reader />);
    expect(screen.getByTestId("reader").textContent).toBe("none");
  });

  it("fires the published onClick", () => {
    const onClick = vi.fn();
    function PublisherWithClick() {
      usePublishArtifactsPrimaryAction({ label: "Add artifact", onClick });
      return null;
    }
    let captured: (() => void) | undefined;
    function ReaderCaptures() {
      const action = useArtifactsPrimaryAction();
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
