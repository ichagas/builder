import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  getStoredToken,
  getStoredUser,
  setAuthData,
  clearAuthData,
} from "../apiClient";
import type { ApiUser } from "../apiClient";

// Mock MSAL and env before the module loads
vi.mock("../msalInstance", () => ({
  msalInstance: {
    getAllAccounts: vi.fn(() => []),
    acquireTokenSilent: vi.fn(),
  },
}));

vi.mock("../msalConfig", () => ({
  apiRequest: { scopes: [] },
  loginRequest: { scopes: [] },
}));

// =============================================================================
// Token / User localStorage helpers
// =============================================================================

describe("apiClient localStorage helpers", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe("getStoredToken", () => {
    it("returns null when no token is stored", () => {
      expect(getStoredToken()).toBeNull();
    });

    it("returns the stored token", () => {
      localStorage.setItem("pronghorn_auth_token", "my-token");
      expect(getStoredToken()).toBe("my-token");
    });

    it("migrates legacy auth_token to new key", () => {
      localStorage.setItem("auth_token", "legacy-token");
      const token = getStoredToken();
      expect(token).toBe("legacy-token");
      // Should have been migrated
      expect(localStorage.getItem("pronghorn_auth_token")).toBe("legacy-token");
      expect(localStorage.getItem("auth_token")).toBeNull();
    });

    it("prefers new key over legacy key", () => {
      localStorage.setItem("pronghorn_auth_token", "new-token");
      localStorage.setItem("auth_token", "legacy-token");
      expect(getStoredToken()).toBe("new-token");
    });
  });

  describe("getStoredUser", () => {
    it("returns null when no user is stored", () => {
      expect(getStoredUser()).toBeNull();
    });

    it("returns the stored user", () => {
      const user: ApiUser = { id: "1", email: "test@example.com", name: "Test" };
      localStorage.setItem("pronghorn_auth_user", JSON.stringify(user));
      const stored = getStoredUser();
      expect(stored).toEqual(user);
    });
  });

  describe("setAuthData", () => {
    it("stores token and user", () => {
      const user: ApiUser = { id: "1", email: "test@example.com" };
      setAuthData("token-123", user);
      expect(localStorage.getItem("pronghorn_auth_token")).toBe("token-123");
      expect(JSON.parse(localStorage.getItem("pronghorn_auth_user")!)).toEqual(user);
    });
  });

  describe("clearAuthData", () => {
    it("removes all auth keys", () => {
      localStorage.setItem("pronghorn_auth_token", "token");
      localStorage.setItem("pronghorn_auth_user", "user");
      localStorage.setItem("auth_token", "legacy");
      clearAuthData();
      expect(localStorage.getItem("pronghorn_auth_token")).toBeNull();
      expect(localStorage.getItem("pronghorn_auth_user")).toBeNull();
      expect(localStorage.getItem("auth_token")).toBeNull();
    });

    it("does not throw when keys do not exist", () => {
      expect(() => clearAuthData()).not.toThrow();
    });
  });
});

// =============================================================================
// Local auth mode (local dev sign-in): bearer token comes from the dev session
// =============================================================================

describe("apiClient in local auth mode", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubEnv("VITE_AUTH_MODE", "local");
    vi.stubEnv("VITE_ENTRA_CLIENT_ID", "");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("sends the dev-login token as Bearer, and stops after sign-out", async () => {
    const { apiClient } = await import("../apiClient");
    const future = Math.floor(Date.now() / 1000) + 3600;
    const token = `${btoa('{"alg":"HS256"}')}.${btoa(JSON.stringify({ exp: future }))}.s`;
    localStorage.setItem("pronghorn_local_dev_session", JSON.stringify({ token, user: { id: "u", email: "e@x.co" } }));

    expect(await apiClient.getAuthHeaders()).toEqual({ Authorization: `Bearer ${token}` });
    localStorage.removeItem("pronghorn_local_dev_session");
    expect(await apiClient.getAuthHeaders()).toEqual({});
  });

  it("a 401 clears the session and returns to /auth with returnTo", async () => {
    const { apiClient } = await import("../apiClient");
    const future = Math.floor(Date.now() / 1000) + 3600;
    const token = `${btoa('{"alg":"HS256"}')}.${btoa(JSON.stringify({ exp: future }))}.s`;
    localStorage.setItem("pronghorn_local_dev_session", JSON.stringify({ token, user: { id: "u", email: "e@x.co" } }));
    const assign = vi.fn();
    vi.stubGlobal("location", { pathname: "/projects", assign, origin: "http://localhost:8080" });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false, status: 401, headers: new Headers(), json: async () => ({ message: "Invalid or expired token" }),
    }));

    await expect(apiClient.get("/api/v1/projects")).rejects.toMatchObject({ statusCode: 401 });
    expect(localStorage.getItem("pronghorn_local_dev_session")).toBeNull();
    expect(assign).toHaveBeenCalledWith("/auth?returnTo=%2Fprojects");
  });
});
