import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  CommandPaletteItemsProvider,
  useCommandPaletteItems,
  usePublishCommandPaletteItems,
} from "../CommandPaletteItemsContext";
import type { CommandPaletteItem } from "../CommandPalette";

function Reader() {
  const items = useCommandPaletteItems();
  return <div data-testid="items">{items.map((item) => item.id).join(",")}</div>;
}

function Publisher({ items }: { items: CommandPaletteItem[] }) {
  usePublishCommandPaletteItems(items);
  return null;
}

describe("CommandPaletteItemsContext (T036)", () => {
  it("merges items published by multiple owners", () => {
    render(
      <CommandPaletteItemsProvider>
        <Publisher items={[{ id: "a", label: "A", group: "projects", href: "/a" }]} />
        <Publisher items={[{ id: "b", label: "B", group: "tools", href: "/b" }]} />
        <Reader />
      </CommandPaletteItemsProvider>,
    );
    expect(screen.getByTestId("items").textContent).toBe("a,b");
  });

  it("removes an owner's items when it unmounts", () => {
    function Wrapper({ showB }: { showB: boolean }) {
      return (
        <CommandPaletteItemsProvider>
          <Publisher items={[{ id: "a", label: "A", group: "projects", href: "/a" }]} />
          {showB ? <Publisher items={[{ id: "b", label: "B", group: "tools", href: "/b" }]} /> : null}
          <Reader />
        </CommandPaletteItemsProvider>
      );
    }
    const { rerender } = render(<Wrapper showB />);
    expect(screen.getByTestId("items").textContent).toBe("a,b");
    rerender(<Wrapper showB={false} />);
    expect(screen.getByTestId("items").textContent).toBe("a");
  });

  it("returns an empty list outside a provider", () => {
    render(<Reader />);
    expect(screen.getByTestId("items").textContent).toBe("");
  });
});
