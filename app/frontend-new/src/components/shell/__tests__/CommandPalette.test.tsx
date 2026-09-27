import * as React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { CommandPalette, type CommandPaletteItem } from "../CommandPalette";

const items: CommandPaletteItem[] = [
  { id: "projects-home", label: "Projects", group: "projects", href: "/projects" },
  { id: "tool-req", label: "Requirements", group: "tools", href: "/p/1/v/current/define/requirements", hint: "define" },
  { id: "library-standards", label: "Standards library", group: "library", href: "/library/standards" },
];

function LocationProbe() {
  return <div data-testid="path">{useLocation().pathname}</div>;
}

function Harness({ items: paletteItems }: { items: CommandPaletteItem[] }) {
  return (
    <>
      <Palette items={paletteItems} />
      <Routes>
        <Route path="*" element={<LocationProbe />} />
      </Routes>
    </>
  );
}

function Palette({ items: paletteItems }: { items: CommandPaletteItem[] }) {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}>open-palette</button>
      <CommandPalette open={open} onOpenChange={setOpen} items={paletteItems} />
    </>
  );
}

describe("CommandPalette (T036)", () => {
  it("groups items under Projects, Tools and Library headings", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <Harness items={items} />
      </MemoryRouter>,
    );
    await user.click(screen.getByText("open-palette"));
    expect(screen.getAllByText("Projects").length).toBeGreaterThan(0);
    expect(screen.getByText("Tools")).toBeInTheDocument();
    expect(screen.getByText("Library")).toBeInTheDocument();
    expect(screen.getByText("Requirements")).toBeInTheDocument();
  });

  it("navigates to the selected item's href and closes", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/projects"]}>
        <Harness items={items} />
      </MemoryRouter>,
    );
    await user.click(screen.getByText("open-palette"));
    await user.click(screen.getByText("Standards library"));
    expect(screen.getByTestId("path").textContent).toBe("/library/standards");
    expect(screen.queryByText("Standards library")).not.toBeInTheDocument();
  });

  it("toggles open on Ctrl/Cmd+K", async () => {
    const onOpenChange = vi.fn();
    render(
      <MemoryRouter>
        <CommandPalette open={false} onOpenChange={onOpenChange} items={items} />
      </MemoryRouter>,
    );
    const event = new KeyboardEvent("keydown", { key: "k", ctrlKey: true, bubbles: true, cancelable: true });
    document.dispatchEvent(event);
    expect(onOpenChange).toHaveBeenCalledWith(true);
  });

  it("shows the empty state when nothing matches", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <Harness items={items} />
      </MemoryRouter>,
    );
    await user.click(screen.getByText("open-palette"));
    await user.type(screen.getByPlaceholderText(/Search projects, tools, library/i), "zzz-no-match");
    expect(await screen.findByText("No results found.")).toBeInTheDocument();
  });
});
