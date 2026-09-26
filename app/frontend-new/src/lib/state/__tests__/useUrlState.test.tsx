import { describe, expect, it } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router-dom";
import { useUrlState } from "../useUrlState";

function Probe({ defaultTab = "requirements" }: { defaultTab?: string }) {
  const [tab, setTab] = useUrlState("tab", defaultTab);
  const location = useLocation();
  return (
    <div>
      <span data-testid="tab">{tab}</span>
      <span data-testid="search">{location.search}</span>
      <button onClick={() => setTab("standards")}>go-standards</button>
      <button onClick={() => setTab(defaultTab)}>go-default</button>
    </div>
  );
}

describe("useUrlState", () => {
  it("returns the default when the param is absent", () => {
    render(
      <MemoryRouter initialEntries={["/p/1"]}>
        <Probe />
      </MemoryRouter>,
    );
    expect(screen.getByTestId("tab").textContent).toBe("requirements");
  });

  it("reads the initial value from the URL", () => {
    render(
      <MemoryRouter initialEntries={["/p/1?tab=canvas"]}>
        <Probe />
      </MemoryRouter>,
    );
    expect(screen.getByTestId("tab").textContent).toBe("canvas");
  });

  it("writes the value back into the query string with replace (no extra history entry)", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/p/1"]}>
        <Probe />
      </MemoryRouter>,
    );
    await act(async () => {
      await user.click(screen.getByText("go-standards"));
    });
    expect(screen.getByTestId("tab").textContent).toBe("standards");
    expect(screen.getByTestId("search").textContent).toBe("?tab=standards");
  });

  it("removes the param entirely when the value serializes to null (empty string)", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/p/1?tab=standards"]}>
        <Probe defaultTab="" />
      </MemoryRouter>,
    );
    await act(async () => {
      await user.click(screen.getByText("go-default"));
    });
    expect(screen.getByTestId("search").textContent).toBe("");
  });
});
