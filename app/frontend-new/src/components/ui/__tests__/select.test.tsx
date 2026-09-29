import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../select";

function setMobile(matches: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia;
}

function Demo() {
  return (
    <Select>
      <SelectTrigger aria-label="Team">
        <SelectValue placeholder="Pick" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="a">Alpha</SelectItem>
        <SelectItem value="b">Beta</SelectItem>
      </SelectContent>
    </Select>
  );
}

describe("SelectContent placement", () => {
  const original = window.matchMedia;
  beforeEach(() => {
    Element.prototype.hasPointerCapture = Element.prototype.hasPointerCapture ?? (() => false);
    Element.prototype.setPointerCapture = Element.prototype.setPointerCapture ?? (() => {});
    Element.prototype.releasePointerCapture = Element.prototype.releasePointerCapture ?? (() => {});
    Element.prototype.scrollIntoView = Element.prototype.scrollIntoView ?? (() => {});
  });
  afterEach(() => {
    window.matchMedia = original;
  });

  it("uses item-aligned (viewport-clamped, never off-screen) on phone widths", async () => {
    setMobile(true);
    render(<Demo />);
    await userEvent.click(screen.getByRole("combobox", { name: "Team" }));
    expect(await screen.findByRole("option", { name: "Alpha" })).toBeInTheDocument();
    expect(document.querySelector("[data-radix-popper-content-wrapper]")).toBeNull();
  });

  it("keeps the popper (collision-avoiding) on desktop widths", async () => {
    setMobile(false);
    render(<Demo />);
    await userEvent.click(screen.getByRole("combobox", { name: "Team" }));
    expect(await screen.findByRole("option", { name: "Alpha" })).toBeInTheDocument();
    expect(document.querySelector("[data-radix-popper-content-wrapper]")).not.toBeNull();
  });
});
