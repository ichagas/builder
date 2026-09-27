import * as React from "react";
import { describe, expect, it } from "vitest";
import { render, renderHook } from "@testing-library/react";
import { createPrimaryActionStore } from "../createPrimaryActionStore";

describe("createPrimaryActionStore (T027, WP-F3b)", () => {
  it("publishes and reads back an action", () => {
    const { usePublishPrimaryAction, usePrimaryAction } = createPrimaryActionStore();
    function Publisher() {
      usePublishPrimaryAction({ label: "Add epic", onClick: () => {} });
      return null;
    }
    function Reader() {
      const action = usePrimaryAction();
      return <div data-testid="reader">{action?.label ?? "none"}</div>;
    }
    const { getByTestId } = render(
      <>
        <Publisher />
        <Reader />
      </>,
    );
    expect(getByTestId("reader").textContent).toBe("Add epic");
  });

  it("has no action published before anyone publishes", () => {
    const { usePrimaryAction } = createPrimaryActionStore();
    const { result } = renderHook(() => usePrimaryAction());
    expect(result.current).toBeUndefined();
  });

  it("reflects updates across re-renders", () => {
    const { usePublishPrimaryAction, usePrimaryAction } = createPrimaryActionStore();
    function Publisher({ label, disabled }: { label: string; disabled?: boolean }) {
      usePublishPrimaryAction({ label, disabled, onClick: () => {} });
      return null;
    }
    function Reader() {
      const action = usePrimaryAction();
      return <div data-testid="reader">{action ? `${action.label}:${action.disabled ? "disabled" : "enabled"}` : "none"}</div>;
    }
    const { getByTestId, rerender } = render(
      <>
        <Publisher label="Add epic" />
        <Reader />
      </>,
    );
    expect(getByTestId("reader").textContent).toBe("Add epic:enabled");

    rerender(
      <>
        <Publisher label="Add epic" disabled />
        <Reader />
      </>,
    );
    expect(getByTestId("reader").textContent).toBe("Add epic:disabled");
  });

  it("clears the action on unmount, so a stale action never lingers", () => {
    const { usePublishPrimaryAction, usePrimaryAction } = createPrimaryActionStore();
    function Publisher() {
      usePublishPrimaryAction({ label: "Add epic" });
      return null;
    }
    function Reader() {
      const action = usePrimaryAction();
      return <div data-testid="reader">{action?.label ?? "none"}</div>;
    }
    const { getByTestId, rerender } = render(
      <>
        <Publisher />
        <Reader />
      </>,
    );
    expect(getByTestId("reader").textContent).toBe("Add epic");

    rerender(<Reader />);
    expect(getByTestId("reader").textContent).toBe("none");
  });

  it("starts a second sequential mount from undefined -- no leak across routes/projects", () => {
    const { usePublishPrimaryAction, usePrimaryAction } = createPrimaryActionStore();
    function Publisher({ label }: { label: string }) {
      usePublishPrimaryAction({ label });
      return null;
    }
    function Reader() {
      const action = usePrimaryAction();
      return <div data-testid="reader">{action?.label ?? "none"}</div>;
    }

    const first = render(
      <>
        <Publisher label="Project A action" />
        <Reader />
      </>,
    );
    expect(first.getByTestId("reader").textContent).toBe("Project A action");
    first.unmount();

    // A fresh mount (e.g. navigating to another project's copy of the same
    // page) must never see the previous mount's action, even transiently.
    const second = render(
      <>
        <Reader />
        <Publisher label="Project B action" />
      </>,
    );
    expect(second.getByTestId("reader").textContent).toBe("Project B action");
  });

  it("does not notify subscribers when the published action is unchanged (no render loop)", () => {
    const { usePublishPrimaryAction, usePrimaryAction } = createPrimaryActionStore();
    const onClick = () => {};

    // Publisher and Reader are rendered as two independent trees, so Reader
    // only re-renders when the STORE notifies it -- not because the test
    // harness re-rendered a shared parent. This isolates what we actually
    // care about: republishing an unchanged action must not fire listeners.
    function Publisher({ renderCount }: { renderCount: number }) {
      // Same field values every render (same onClick reference) --
      // simulates a page re-rendering (e.g. on unrelated state changes)
      // without its primary action actually changing.
      usePublishPrimaryAction({ label: "Add epic", onClick });
      return <div data-testid="publisher-renders">{renderCount}</div>;
    }

    let readerRenders = 0;
    function Reader() {
      usePrimaryAction();
      readerRenders += 1;
      return null;
    }

    const publisherTree = render(<Publisher renderCount={1} />);
    render(<Reader />);
    const rendersAfterFirstPublish = readerRenders;

    publisherTree.rerender(<Publisher renderCount={2} />);
    publisherTree.rerender(<Publisher renderCount={3} />);

    expect(readerRenders).toBe(rendersAfterFirstPublish);
  });

  it("is safe with no subscriber mounted (SSR-style getSnapshot call, no listeners)", () => {
    const { usePublishPrimaryAction } = createPrimaryActionStore();
    function Publisher() {
      usePublishPrimaryAction({ label: "Add epic" });
      return null;
    }
    expect(() => {
      const { unmount } = render(<Publisher />);
      unmount();
    }).not.toThrow();
  });

  it("keeps independent state per factory call", () => {
    const storeA = createPrimaryActionStore();
    const storeB = createPrimaryActionStore();

    function PublisherA() {
      storeA.usePublishPrimaryAction({ label: "A action" });
      return null;
    }

    render(<PublisherA />);

    const { result: resultA } = renderHook(() => storeA.usePrimaryAction());
    const { result: resultB } = renderHook(() => storeB.usePrimaryAction());
    expect(resultA.current?.label).toBe("A action");
    expect(resultB.current).toBeUndefined();
  });
});
