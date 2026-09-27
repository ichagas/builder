import * as React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { usePublishRequirementsPrimaryAction, useRequirementsPrimaryAction } from "../requirements.primaryAction";

function Publisher({ label, disabled }: { label: string; disabled?: boolean }) {
  usePublishRequirementsPrimaryAction({ label, disabled, onClick: () => {} });
  return null;
}

function Reader() {
  const action = useRequirementsPrimaryAction();
  return <div data-testid="reader">{action ? `${action.label}:${action.disabled ? "disabled" : "enabled"}` : "none"}</div>;
}

describe("requirements primary action store (T042, WP-D1)", () => {
  it("has no action published before the page mounts", () => {
    render(<Reader />);
    expect(screen.getByTestId("reader").textContent).toBe("none");
  });

  it("reads the page's published action, including updates across renders", () => {
    const { rerender } = render(
      <>
        <Publisher label="Add epic" />
        <Reader />
      </>,
    );
    expect(screen.getByTestId("reader").textContent).toBe("Add epic:enabled");

    rerender(
      <>
        <Publisher label="Add epic" disabled />
        <Reader />
      </>,
    );
    expect(screen.getByTestId("reader").textContent).toBe("Add epic:disabled");
  });

  it("clears the action when the publisher unmounts", () => {
    const { rerender } = render(
      <>
        <Publisher label="Add epic" />
        <Reader />
      </>,
    );
    expect(screen.getByTestId("reader").textContent).toBe("Add epic:enabled");

    rerender(<Reader />);
    expect(screen.getByTestId("reader").textContent).toBe("none");
  });

  it("fires the published onClick", () => {
    const onClick = vi.fn();
    function PublisherWithClick() {
      usePublishRequirementsPrimaryAction({ label: "Add epic", onClick });
      return null;
    }
    let captured: (() => void) | undefined;
    function ReaderCaptures() {
      const action = useRequirementsPrimaryAction();
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
