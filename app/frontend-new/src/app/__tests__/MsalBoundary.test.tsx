import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { useMsal } from "@azure/msal-react";

// Fake Entra ids so the REAL lib/msalConfig + lib/msalInstance load (MSAL mode).
vi.hoisted(() => {
  vi.stubEnv("VITE_AUTH_MODE", "msal");
  vi.stubEnv("VITE_ENTRA_CLIENT_ID", "00000000-0000-4000-8000-000000000001");
  vi.stubEnv("VITE_ENTRA_TENANT_ID", "organizations");
});

/**
 * Mounts the REAL provider tree (real @azure/msal-react + a real
 * PublicClientApplication with a fake client id; nothing is mocked) to catch
 * regressions like a boundary rendering itself.
 */
import { msalInstance } from "@/lib/msalInstance";
import { MsalBoundary } from "@/app/MsalBoundary";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";

function MsalProbe() {
  const { instance, accounts } = useMsal();
  return <span data-testid="msal">{instance ? `msal:${accounts.length}` : "no-instance"}</span>;
}

function AuthProbe() {
  const a = useAuth();
  return <span data-testid="auth">{a.signInLocal ? "local" : "msal"}</span>;
}


describe("MsalBoundary + AuthProvider (real providers)", () => {
  it("MSAL mode: provides a real MSAL context and the MSAL auth provider", async () => {
    expect(msalInstance).not.toBeNull();
    render(
      <MsalBoundary>
        <MsalProbe />
        <AuthProvider>
          <AuthProbe />
        </AuthProvider>
      </MsalBoundary>,
    );
    expect(screen.getByTestId("msal").textContent).toBe("msal:0");
    await waitFor(() => expect(screen.getByTestId("auth").textContent).toBe("msal"));
  });

  it("local mode: renders without MSAL and the local auth provider works", () => {
    vi.stubEnv("VITE_AUTH_MODE", "local");
    // (msalInstance is null in this mode, see lib/msalInstance.ts)
    render(
      <MsalBoundary instance={null}>
        <AuthProvider>
          <AuthProbe />
        </AuthProvider>
      </MsalBoundary>,
    );
    expect(screen.getByTestId("auth").textContent).toBe("local");
  });
});
