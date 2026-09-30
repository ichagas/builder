import { afterEach, describe, expect, it, vi } from "vitest";
import { isLocalAuth } from "../authMode";

afterEach(() => vi.unstubAllEnvs());

describe("isLocalAuth", () => {
  it.each([
    ["local", true],
    ["mock", false], // e2e harness value: fake MSAL cache, stays MSAL
    ["msal", false],
    ["", false],
    ["LOCAL", false],
  ])("VITE_AUTH_MODE=%j in a dev build -> %s", (mode, expected) => {
    vi.stubEnv("VITE_AUTH_MODE", mode);
    expect(isLocalAuth()).toBe(expected);
  });

  it("is off in a production build even with VITE_AUTH_MODE=local", () => {
    vi.stubEnv("VITE_AUTH_MODE", "local");
    vi.stubEnv("DEV", false);
    expect(isLocalAuth()).toBe(false);
  });

  it("ignores VITE_ENTRA_CLIENT_ID (explicit mode, not a heuristic)", () => {
    vi.stubEnv("VITE_AUTH_MODE", "local");
    vi.stubEnv("VITE_ENTRA_CLIENT_ID", "abc");
    expect(isLocalAuth()).toBe(true);
  });
});
