import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { OnboardingWizard, extractErrorMessage } from "../OnboardingWizard";

vi.mock("@/contexts/AdminContext", () => ({ useAdmin: () => ({ isAdmin: false }) }));

const getMock = vi.fn();
const postMock = vi.fn();
vi.mock("@/lib/apiClient", () => ({
  default: { get: (...args: unknown[]) => getMock(...args), post: (...args: unknown[]) => postMock(...args), put: vi.fn() },
}));

describe("extractErrorMessage", () => {
  it("prefers details.repositories over message", () => {
    expect(
      extractErrorMessage({ message: "Unprocessable", statusCode: 422, details: { repositories: "Duplicate repository: A/B" } }, "fb"),
    ).toBe("Duplicate repository: A/B");
  });
  it("uses the message for non-500 errors", () => {
    expect(extractErrorMessage({ message: "Forbidden", statusCode: 403 }, "fb")).toBe("Forbidden");
    expect(extractErrorMessage({ message: "Bad", statusCode: 422, details: { other: "x" } }, "fb")).toBe("Bad");
  });
  it("never echoes a 500 message", () => {
    expect(extractErrorMessage({ message: "SQL blew up", statusCode: 500 }, "fb")).toBe("fb");
  });
  it("falls back for empty, missing or non-string values", () => {
    expect(extractErrorMessage(undefined, "fb")).toBe("fb");
    expect(extractErrorMessage(null, "fb")).toBe("fb");
    expect(extractErrorMessage({ message: "" }, "fb")).toBe("fb");
    expect(extractErrorMessage({ message: 5 }, "fb")).toBe("fb");
    expect(extractErrorMessage({ message: "m", details: { repositories: 3 }, statusCode: 500 }, "fb")).toBe("fb");
  });
});

describe("OnboardingWizard team step error", () => {
  beforeEach(() => {
    getMock.mockReset();
    postMock.mockReset();
    getMock.mockResolvedValue([{ id: "t1", name: "Permits", organization_id: "o1", role: "owner" }]);
  });

  it("shows the server message inline when creating the run fails", async () => {
    const user = userEvent.setup();
    postMock.mockRejectedValueOnce({ message: "Team not found in organization", statusCode: 403 });
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MemoryRouter initialEntries={["/assurance/t/t1/onboard"]}>
          <Routes>
            <Route path="/assurance/t/:teamId/onboard/:step?" element={<OnboardingWizard />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
    await user.type(await screen.findByLabelText(/application/i), "Permits{Enter}");
    expect(await screen.findByRole("alert")).toHaveTextContent("Team not found in organization");
    expect(postMock).toHaveBeenCalledWith("/api/v1/onboarding/runs", { teamId: "t1", applicationName: "Permits" });
  });
});
