import * as React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { usePublishDatabasePrimaryAction, useDatabasePrimaryAction } from "../database.primaryAction";

function Publisher({ onClick }: { onClick: () => void }) {
  usePublishDatabasePrimaryAction({ label: "New Database", onClick });
  return null;
}

function Reader() {
  const action = useDatabasePrimaryAction();
  return <div data-testid="reader">{action ? action.label : "none"}</div>;
}

describe("database primary action store (T050, WP-B3)", () => {
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
    expect(screen.getByTestId("reader").textContent).toBe("New Database");
  });

  it("clears the action when the publisher unmounts (e.g. off the deploy tab)", () => {
    const { rerender } = render(
      <>
        <Publisher onClick={() => {}} />
        <Reader />
      </>,
    );
    expect(screen.getByTestId("reader").textContent).toBe("New Database");

    rerender(<Reader />);
    expect(screen.getByTestId("reader").textContent).toBe("none");
  });

  it("fires the published onClick (opens the create-database dialog)", () => {
    const onClick = vi.fn();
    let captured: (() => void) | undefined;
    function ReaderCaptures() {
      const action = useDatabasePrimaryAction();
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
