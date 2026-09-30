import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";

const { ctor, msalInstanceModule } = vi.hoisted(() => ({ ctor: vi.fn(), msalInstanceModule: vi.fn() }));
vi.mock("@azure/msal-browser", () => ({
  InteractionStatus: { None: "none" },
  PublicClientApplication: ctor,
}));
vi.mock("@/lib/msalInstance", () => {
  msalInstanceModule();
  return { msalInstance: {} };
});
vi.mock("@azure/msal-react", () => ({
  useMsal: () => ({ instance: { logoutPopup: vi.fn() }, accounts: [], inProgress: "none" }),
  useIsAuthenticated: () => false,
  useAccount: () => null,
}));
vi.mock("@/lib/msalConfig", () => ({ loginRequest: { scopes: [] }, popupRedirectUri: "/" }));

import { AuthProvider, useAuth } from "@/contexts/AuthContext";

function Probe() {
  const a = useAuth();
  return (
    <div>
      <span data-testid="user">{a.user?.email ?? "none"}</span>
      <span data-testid="token">{a.session?.access_token ?? "none"}</span>
      <span data-testid="local">{a.signInLocal ? "yes" : "no"}</span>
      <button onClick={() => void a.signInLocal?.("dev@local.test", "Local Developer")}>in</button>
      <button onClick={() => void a.signOut()}>out</button>
    </div>
  );
}

const TOKEN = `${btoa('{"alg":"HS256"}')}.${btoa(JSON.stringify({ sub: "u1", exp: 4102444800 }))}.s`;

beforeEach(() => {
  localStorage.clear();
  ctor.mockClear();
  msalInstanceModule.mockClear();
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("AuthProvider in local mode", () => {
  beforeEach(() => {
    vi.stubEnv("VITE_AUTH_MODE", "local");
    vi.stubEnv("VITE_ENTRA_CLIENT_ID", "");
  });

  it("never loads or constructs MSAL", () => {
    render(<AuthProvider><Probe /></AuthProvider>);
    expect(ctor).not.toHaveBeenCalled();
    expect(msalInstanceModule).not.toHaveBeenCalled();
  });

  it("signs in through dev-login, exposes the token, and signs out", async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ token: TOKEN, user: { id: "u1", email: "dev@local.test", name: "Local Developer" } }),
    });
    vi.stubGlobal("fetch", fetchFn);
    const assign = vi.fn();
    vi.stubGlobal("location", { pathname: "/projects", assign });

    render(<AuthProvider><Probe /></AuthProvider>);
    expect(screen.getByTestId("user").textContent).toBe("none");

    await act(async () => screen.getByText("in").click());
    await waitFor(() => expect(screen.getByTestId("user").textContent).toBe("dev@local.test"));
    expect(screen.getByTestId("token").textContent).toBe(TOKEN);
    expect(fetchFn).toHaveBeenCalledWith(expect.stringContaining("/api/v1/auth/dev-login"), expect.anything());
    expect(localStorage.getItem("pronghorn_local_dev_session")).toContain(TOKEN);

    await act(async () => screen.getByText("out").click());
    await waitFor(() => expect(screen.getByTestId("user").textContent).toBe("none"));
    expect(localStorage.getItem("pronghorn_local_dev_session")).toBeNull();
    expect(assign).toHaveBeenCalledWith("/auth");
  });
});

describe("AuthProvider in MSAL mode (unchanged)", () => {
  it("uses the MSAL provider: no local sign-in, unauthenticated", async () => {
    vi.stubEnv("VITE_AUTH_MODE", "msal");
    render(<AuthProvider><Probe /></AuthProvider>);
    await waitFor(() => expect(screen.getByTestId("user").textContent).toBe("none"));
    expect(screen.getByTestId("local").textContent).toBe("no");
  });
});
