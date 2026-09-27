import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Outlet, RouterProvider, createMemoryRouter, useLocation } from "react-router-dom";
import { buildLegacyRedirectRoutes } from "../redirects";

/**
 * Redirect table test (T033/T037). Every row transcribed directly from
 * contracts/routes.md §1 "Route map" (the legacy -> new columns), so this
 * fails if `redirects.tsx` ever drifts from the contract, not just from
 * its own source arrays.
 */
const SIMPLE_ROWS: Array<[legacy: string, expected: string]> = [
  ["/dashboard", "/projects"],
  ["/gallery", "/library/gallery"],
  ["/standards", "/library/standards"],
  ["/tech-stacks", "/library/tech-stacks"],
  ["/build-books", "/library/build-books"],
  ["/build-books/new", "/library/build-books/new"],
  ["/build-books/wi-42", "/library/build-books/wi-42"],
  ["/build-books/wi-42/edit", "/library/build-books/wi-42/edit"],
];

const PROJECT_ROWS: Array<[legacyPage: string, expectedNewPath: string]> = [
  ["settings", "/p/proj-1/settings"],
  ["requirements", "/p/proj-1/v/current/define/requirements"],
  ["standards", "/p/proj-1/v/current/define/standards"],
  ["artifacts", "/p/proj-1/v/current/define/artifacts"],
  ["chat", "/p/proj-1/v/current/define/chat"],
  ["canvas", "/p/proj-1/v/current/design/canvas"],
  ["specifications", "/p/proj-1/v/current/design/specifications"],
  ["build", "/p/proj-1/v/current/build/agent"],
  ["repository", "/p/proj-1/v/current/build/repository"],
  ["database", "/p/proj-1/v/current/build/database"],
  ["deploy", "/p/proj-1/v/current/ship/environments"],
  ["audit", "/p/proj-1/v/current/ship/audit"],
  ["present", "/p/proj-1/v/current/ship/present"],
];

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="probe">{location.pathname + location.search}</div>;
}

function renderAt(initialPath: string) {
  const router = createMemoryRouter(
    [
      {
        element: <Outlet />,
        children: [...buildLegacyRedirectRoutes(), { path: "*", element: <LocationProbe /> }],
      },
    ],
    { initialEntries: [initialPath] },
  );
  render(<RouterProvider router={router} />);
}

describe("legacy redirects (contracts/routes.md §1)", () => {
  it.each(SIMPLE_ROWS)("%s -> %s", (legacy, expected) => {
    renderAt(legacy);
    expect(screen.getAllByTestId("probe")[0].textContent).toBe(expected);
  });

  it.each(PROJECT_ROWS)("/project/:id/%s -> %s", (legacyPage, expectedNewPath) => {
    renderAt(`/project/proj-1/${legacyPage}`);
    expect(screen.getAllByTestId("probe")[0].textContent).toBe(expectedNewPath);
  });

  it.each(PROJECT_ROWS)("/project/:id/%s/t/:token -> %s?t=:token (share tokens)", (legacyPage, expectedNewPath) => {
    renderAt(`/project/proj-1/${legacyPage}/t/abc123`);
    expect(screen.getAllByTestId("probe")[0].textContent).toBe(`${expectedNewPath}?t=abc123`);
  });

  it("percent-encodes special characters in the token when redirecting", () => {
    renderAt("/project/proj-1/settings/t/a+b");
    expect(screen.getAllByTestId("probe")[0].textContent).toBe("/p/proj-1/settings?t=a%2Bb");
  });
});
