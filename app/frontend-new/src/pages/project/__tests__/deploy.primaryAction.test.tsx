import * as React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { usePublishDeployPrimaryAction, useDeployPrimaryAction } from "../deploy.primaryAction";

function Publisher({ onClick }: { onClick: () => void }) {
  usePublishDeployPrimaryAction({ label: "New Deployment", onClick });
  return null;
}

function Reader() {
  const action = useDeployPrimaryAction();
  return <div data-testid="reader">{action ? action.label : "none"}</div>;
}

describe("deploy primary action store (T051, WP-S1)", () => {
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
    expect(screen.getByTestId("reader").textContent).toBe("New Deployment");
  });

  it("clears the action when the publisher unmounts", () => {
    const { rerender } = render(
      <>
        <Publisher onClick={() => {}} />
        <Reader />
      </>,
    );
    expect(screen.getByTestId("reader").textContent).toBe("New Deployment");

    rerender(<Reader />);
    expect(screen.getByTestId("reader").textContent).toBe("none");
  });

  it("fires the published onClick (opens the create-deployment dialog)", () => {
    const onClick = vi.fn();
    let captured: (() => void) | undefined;
    function ReaderCaptures() {
      const action = useDeployPrimaryAction();
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
