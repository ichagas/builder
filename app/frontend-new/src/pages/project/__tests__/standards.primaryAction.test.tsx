import * as React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { usePublishProjectStandardsPrimaryAction, useProjectStandardsPrimaryAction } from "../standards.primaryAction";

function Publisher({ label, disabled }: { label: string; disabled?: boolean }) {
  usePublishProjectStandardsPrimaryAction({ label, disabled, onClick: () => {} });
  return null;
}

function Reader() {
  const action = useProjectStandardsPrimaryAction();
  return <div data-testid="reader">{action ? `${action.label}:${action.disabled ? "disabled" : "enabled"}` : "none"}</div>;
}

describe("project standards primary action store (T043, WP-D2)", () => {
  it("has no action published before the page mounts", () => {
    render(<Reader />);
    expect(screen.getByTestId("reader").textContent).toBe("none");
  });

  it("reads the page's published action, including updates across renders", () => {
    const { rerender } = render(
      <>
        <Publisher label="Save Changes" />
        <Reader />
      </>,
    );
    expect(screen.getByTestId("reader").textContent).toBe("Save Changes:enabled");

    rerender(
      <>
        <Publisher label="Save Changes" disabled />
        <Reader />
      </>,
    );
    expect(screen.getByTestId("reader").textContent).toBe("Save Changes:disabled");
  });

  it("clears the action when the publisher unmounts", () => {
    const { rerender } = render(
      <>
        <Publisher label="Save Changes" />
        <Reader />
      </>,
    );
    expect(screen.getByTestId("reader").textContent).toBe("Save Changes:enabled");

    rerender(<Reader />);
    expect(screen.getByTestId("reader").textContent).toBe("none");
  });

  it("fires the published onClick", () => {
    const onClick = vi.fn();
    function PublisherWithClick() {
      usePublishProjectStandardsPrimaryAction({ label: "Save Changes", onClick });
      return null;
    }
    let captured: (() => void) | undefined;
    function ReaderCaptures() {
      const action = useProjectStandardsPrimaryAction();
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
