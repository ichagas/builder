import * as React from "react";
import { renderHook } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi, beforeEach } from "vitest";

const mockUseAdmin = vi.fn();
vi.mock("@/contexts/AdminContext", () => ({
  useAdmin: () => mockUseAdmin(),
}));

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...actual, useNavigate: () => mockNavigate };
});

import { useBuildBooksPrimaryAction } from "../buildBooks.primaryAction";

function wrapper({ children }: { children: React.ReactNode }) {
  return <MemoryRouter>{children}</MemoryRouter>;
}

describe("useBuildBooksPrimaryAction (T062, WP-L3)", () => {
  beforeEach(() => {
    mockUseAdmin.mockReset();
    mockNavigate.mockReset();
  });

  it("returns undefined for non-admins, matching legacy hiding the 'New Build Book' button entirely", () => {
    mockUseAdmin.mockReturnValue({ isAdmin: false });
    const { result } = renderHook(() => useBuildBooksPrimaryAction(), { wrapper });
    expect(result.current).toBeUndefined();
  });

  it("returns a 'New Build Book' action for admins", () => {
    mockUseAdmin.mockReturnValue({ isAdmin: true });
    const { result } = renderHook(() => useBuildBooksPrimaryAction(), { wrapper });
    expect(result.current?.label).toBe("New Build Book");
    expect(typeof result.current?.onClick).toBe("function");
  });

  it("navigates to /build-books/new on click, same target as legacy's header button", () => {
    mockUseAdmin.mockReturnValue({ isAdmin: true });
    const { result } = renderHook(() => useBuildBooksPrimaryAction(), { wrapper });
    result.current?.onClick?.();
    expect(mockNavigate).toHaveBeenCalledWith("/build-books/new");
  });
});
