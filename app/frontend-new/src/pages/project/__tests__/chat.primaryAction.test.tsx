import * as React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { usePublishChatPrimaryAction, useChatPrimaryAction } from "../chat.primaryAction";

function Publisher({ label, disabled }: { label: string; disabled?: boolean }) {
  usePublishChatPrimaryAction({ label, disabled, onClick: () => {} });
  return null;
}

function Reader() {
  const action = useChatPrimaryAction();
  return <div data-testid="reader">{action ? `${action.label}:${action.disabled ? "disabled" : "enabled"}` : "none"}</div>;
}

describe("chat primary action store (T045, WP-D4)", () => {
  it("has no action published before the page mounts", () => {
    render(<Reader />);
    expect(screen.getByTestId("reader").textContent).toBe("none");
  });

  it("reads the page's published action, including updates across renders", () => {
    const { rerender } = render(
      <>
        <Publisher label="Start a conversation" />
        <Reader />
      </>,
    );
    expect(screen.getByTestId("reader").textContent).toBe("Start a conversation:enabled");

    rerender(
      <>
        <Publisher label="Start a conversation" disabled />
        <Reader />
      </>,
    );
    expect(screen.getByTestId("reader").textContent).toBe("Start a conversation:disabled");
  });

  it("clears the action when the publisher unmounts", () => {
    const { rerender } = render(
      <>
        <Publisher label="Start a conversation" />
        <Reader />
      </>,
    );
    expect(screen.getByTestId("reader").textContent).toBe("Start a conversation:enabled");

    rerender(<Reader />);
    expect(screen.getByTestId("reader").textContent).toBe("none");
  });

  it("fires the published onClick", () => {
    const onClick = vi.fn();
    function PublisherWithClick() {
      usePublishChatPrimaryAction({ label: "Start a conversation", onClick });
      return null;
    }
    let captured: (() => void) | undefined;
    function ReaderCaptures() {
      const action = useChatPrimaryAction();
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
