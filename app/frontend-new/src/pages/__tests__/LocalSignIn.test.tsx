import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import "@/i18n";

vi.mock("@/lib/msalConfig", () => ({ loginRequest: { scopes: [] }, popupRedirectUri: "/" }));
vi.mock("@/components/layout/PronghornLogo", () => ({ PronghornLogo: () => null }));

import { AuthProvider } from "@/contexts/AuthContext";
import LocalSignIn from "@/pages/LocalSignIn";

beforeEach(() => {
  localStorage.clear();
  vi.stubEnv("VITE_AUTH_MODE", "mock");
  vi.stubEnv("VITE_ENTRA_CLIENT_ID", "");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

function renderPage() {
  return render(
    <MemoryRouter>
      <AuthProvider>
        <LocalSignIn />
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe("LocalSignIn", () => {
  it("shows the not-for-production note and labelled, pre-filled fields", () => {
    renderPage();
    expect(screen.getByText("Local development sign-in — not for production")).toBeTruthy();
    expect((screen.getByLabelText("Email") as HTMLInputElement).value).toBe("dev@local.test");
    expect((screen.getByLabelText("Display name") as HTMLInputElement).value).toBe("Local Developer");
  });

  it("submits to dev-login and stores the token", async () => {
    const token = `${btoa('{"alg":"HS256"}')}.${btoa(JSON.stringify({ exp: 4102444800 }))}.s`;
    const fetchFn = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ token, user: { id: "u1", email: "dev@local.test", name: "Local Developer" } }),
    });
    vi.stubGlobal("fetch", fetchFn);
    renderPage();
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
    await waitFor(() => expect(fetchFn).toHaveBeenCalled());
    expect(JSON.parse(fetchFn.mock.calls[0][1].body)).toEqual({ email: "dev@local.test", name: "Local Developer" });
    await waitFor(() => expect(localStorage.getItem("pronghorn_local_dev_session")).toContain(token));
  });

  it("shows an alert when sign-in fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 400, json: async () => ({ message: "email: Invalid email" }) }));
    renderPage();
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect((await screen.findByRole("alert")).textContent).toContain("email: Invalid email");
  });
});
