import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ChecksCard } from "../change/ChecksCard";
import type { StepStates } from "../change/steps";

const states = { define: "done", design: "skipped", build: "todo", ship: "todo" } as unknown as StepStates;

describe("ChecksCard", () => {
  it("keeps the loading status outside the list (axe list / aria-allowed-role)", () => {
    render(<ChecksCard states={states} versionChecks={undefined} loading />);
    const list = screen.getByTestId("change-checks");
    const status = screen.getByRole("status");
    expect(list.contains(status)).toBe(false);
    for (const child of Array.from(list.children)) {
      expect(child.tagName).toBe("LI");
      expect(child.getAttribute("role")).toBeNull();
    }
  });

  it("renders no status when not loading", () => {
    render(<ChecksCard states={states} versionChecks={[]} loading={false} />);
    expect(screen.queryByRole("status")).toBeNull();
  });
});
