import * as React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { usePublishSpecificationsPrimaryAction, useSpecificationsPrimaryAction } from "../specifications.primaryAction";

function Publisher({ label, disabled }: { label: string; disabled?: boolean }) {
  usePublishSpecificationsPrimaryAction({ label, disabled, onClick: () => {} });
  return null;
}

function Reader() {
  const action = useSpecificationsPrimaryAction();
  return <div data-testid="reader">{action ? `${action.label}:${action.disabled ? "disabled" : "enabled"}` : "none"}</div>;
}

describe("specifications primary action store (T047, WP-G2)", () => {
  it("has no action published before the page mounts", () => {
    render(<Reader />);
    expect(screen.getByTestId("reader").textContent).toBe("none");
  });

  it("reads the page's published action, including updates across renders", () => {
    const { rerender } = render(
      <>
        <Publisher label="Generate specification" />
        <Reader />
      </>,
    );
    expect(screen.getByTestId("reader").textContent).toBe("Generate specification:enabled");

    rerender(
      <>
        <Publisher label="Generate specification" disabled />
        <Reader />
      </>,
    );
    expect(screen.getByTestId("reader").textContent).toBe("Generate specification:disabled");
  });

  it("clears the action when the publisher unmounts", () => {
    const { rerender } = render(
      <>
        <Publisher label="Generate specification" />
        <Reader />
      </>,
    );
    expect(screen.getByTestId("reader").textContent).toBe("Generate specification:enabled");

    rerender(<Reader />);
    expect(screen.getByTestId("reader").textContent).toBe("none");
  });

  it("fires the published onClick", () => {
    const onClick = vi.fn();
    function PublisherWithClick() {
      usePublishSpecificationsPrimaryAction({ label: "Generate specification", onClick });
      return null;
    }
    let captured: (() => void) | undefined;
    function ReaderCaptures() {
      const action = useSpecificationsPrimaryAction();
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
