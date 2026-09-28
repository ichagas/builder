import * as React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { usePublishAuditPrimaryAction, useAuditPrimaryAction } from "../audit.primaryAction";

function Publisher({ onClick }: { onClick: () => void }) {
  usePublishAuditPrimaryAction({ label: "New Audit", onClick });
  return null;
}

function Reader() {
  const action = useAuditPrimaryAction();
  return <div data-testid="reader">{action ? action.label : "none"}</div>;
}

describe("audit primary action store (T052, WP-S2)", () => {
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
    expect(screen.getByTestId("reader").textContent).toBe("New Audit");
  });

  it("clears the action when the publisher unmounts", () => {
    const { rerender } = render(
      <>
        <Publisher onClick={() => {}} />
        <Reader />
      </>,
    );
    expect(screen.getByTestId("reader").textContent).toBe("New Audit");

    rerender(<Reader />);
    expect(screen.getByTestId("reader").textContent).toBe("none");
  });

  it("fires the published onClick (opens the audit configuration dialog)", () => {
    const onClick = vi.fn();
    let captured: (() => void) | undefined;
    function ReaderCaptures() {
      const action = useAuditPrimaryAction();
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
