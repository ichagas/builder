import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearLocalSession,
  getLocalSession,
  getLocalToken,
  handleLocalUnauthorized,
  signInLocal,
  subscribeLocalSession,
} from "../localSession";

function jwtWithExp(exp: number): string {
  const b64 = (o: object) => btoa(JSON.stringify(o)).replace(/=/g, "");
  return `${b64({ alg: "HS256" })}.${b64({ sub: "u1", exp })}.sig`;
}
const future = () => Math.floor(Date.now() / 1000) + 3600;
const user = { id: "u1", email: "dev@local.test", name: "Local Developer" };

function mockFetch(status: number, body: unknown) {
  const fn = vi.fn().mockResolvedValue({ ok: status < 400, status, json: async () => body });
  vi.stubGlobal("fetch", fn);
  return fn;
}

beforeEach(() => {
  localStorage.clear();
  vi.stubEnv("VITE_API_BASE_URL", "http://localhost:3001/");
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("signInLocal", () => {
  it("posts to dev-login, stores the session and notifies subscribers", async () => {
    const token = jwtWithExp(future());
    const fetchFn = mockFetch(200, { token, user });
    const listener = vi.fn();
    subscribeLocalSession(listener);

    await signInLocal("dev@local.test", "Local Developer");

    expect(fetchFn).toHaveBeenCalledWith(
      "http://localhost:3001/api/v1/auth/dev-login",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ email: "dev@local.test", name: "Local Developer" }) }),
    );
    expect(getLocalToken()).toBe(token);
    expect(getLocalSession()?.user).toEqual(user);
    expect(listener).toHaveBeenCalled();
  });

  it("surfaces API errors and stores nothing", async () => {
    mockFetch(400, { message: "email: Invalid email" });
    await expect(signInLocal("x", "y")).rejects.toThrow("email: Invalid email");
    expect(getLocalSession()).toBeNull();
  });

  it("explains a 404 (API not in AUTH_MODE=local)", async () => {
    mockFetch(404, { message: "Route not found" });
    await expect(signInLocal("a@b.co", "A")).rejects.toThrow(/AUTH_MODE=local/);
  });

  it("explains an unreachable API", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    await expect(signInLocal("a@b.co", "A")).rejects.toThrow(/dev:api/);
  });
});

describe("session lifecycle", () => {
  it("clearLocalSession removes the token and notifies", () => {
    localStorage.setItem("pronghorn_local_dev_session", JSON.stringify({ token: jwtWithExp(future()), user }));
    const listener = vi.fn();
    subscribeLocalSession(listener);
    clearLocalSession();
    expect(getLocalToken()).toBeNull();
    expect(listener).toHaveBeenCalled();
  });

  it("drops an expired token", () => {
    localStorage.setItem("pronghorn_local_dev_session", JSON.stringify({ token: jwtWithExp(1), user }));
    expect(getLocalSession()).toBeNull();
    expect(localStorage.getItem("pronghorn_local_dev_session")).toBeNull();
  });

  it("handleLocalUnauthorized clears the session and returns to /auth", () => {
    localStorage.setItem("pronghorn_local_dev_session", JSON.stringify({ token: jwtWithExp(future()), user }));
    const assign = vi.fn();
    vi.stubGlobal("location", { pathname: "/projects", assign });
    handleLocalUnauthorized();
    expect(getLocalToken()).toBeNull();
    expect(assign).toHaveBeenCalledWith("/auth");
  });
});
