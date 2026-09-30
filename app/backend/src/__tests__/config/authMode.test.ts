/**
 * Unit tests for AUTH_MODE=local guards (config/authMode.ts)
 */
import jwt from "jsonwebtoken";
import {
  assertAuthModeConfig,
  isLocalAuthMode,
  signLocalToken,
  verifyLocalToken,
} from "../../config/authMode";

const SECRET = "a".repeat(64);
const localEnv = { AUTH_MODE: "local", JWT_SECRET: SECRET, NODE_ENV: "development" };

describe("isLocalAuthMode", () => {
  it("defaults to Entra (false)", () => {
    expect(isLocalAuthMode({})).toBe(false);
    expect(isLocalAuthMode({ AUTH_MODE: "entra" })).toBe(false);
  });
  it("is true only for AUTH_MODE=local", () => {
    expect(isLocalAuthMode({ AUTH_MODE: "local" })).toBe(true);
    expect(isLocalAuthMode({ AUTH_MODE: " LOCAL " })).toBe(true);
  });
});

describe("assertAuthModeConfig", () => {
  it("is a no-op in default mode, even in production without JWT_SECRET", () => {
    expect(() => assertAuthModeConfig({ NODE_ENV: "production" })).not.toThrow();
  });
  it("accepts a valid local config", () => {
    expect(() => assertAuthModeConfig(localEnv)).not.toThrow();
  });
  it("refuses to start with AUTH_MODE=local and NODE_ENV=production", () => {
    expect(() => assertAuthModeConfig({ ...localEnv, NODE_ENV: "production" })).toThrow(/production/);
  });
  it("refuses Azure-hosted runtimes", () => {
    expect(() => assertAuthModeConfig({ ...localEnv, CONTAINER_APP_NAME: "ca-x" })).toThrow(/Azure/);
  });
  it("requires JWT_SECRET", () => {
    expect(() => assertAuthModeConfig({ AUTH_MODE: "local" })).toThrow(/JWT_SECRET/);
  });
  it("rejects short and placeholder secrets", () => {
    expect(() => assertAuthModeConfig({ ...localEnv, JWT_SECRET: "short" })).toThrow(/at least 32/);
    expect(() =>
      assertAuthModeConfig({ ...localEnv, JWT_SECRET: "local-dev-jwt-secret-change-me-please-now" }),
    ).toThrow(/placeholder/);
  });
  it("rejects unknown AUTH_MODE values", () => {
    expect(() => assertAuthModeConfig({ AUTH_MODE: "loca1" })).toThrow(/AUTH_MODE must be/);
  });
});

describe("local tokens", () => {
  const prev = process.env.JWT_SECRET;
  beforeAll(() => {
    process.env.JWT_SECRET = SECRET;
  });
  afterAll(() => {
    process.env.JWT_SECRET = prev;
  });

  it("round-trips claims and sets a 12h expiry", () => {
    const token = signLocalToken({ sub: "u1", email: "a@b.co", name: "A", role: "user" });
    expect(verifyLocalToken(token)).toMatchObject({ sub: "u1", email: "a@b.co", name: "A", role: "user" });
    const { iat, exp } = jwt.decode(token) as { iat: number; exp: number };
    expect(exp - iat).toBe(12 * 3600);
  });
  it("rejects wrong secret, wrong issuer, wrong algorithm and expired tokens", () => {
    expect(() => verifyLocalToken(jwt.sign({ sub: "u" }, "b".repeat(64), { issuer: "pronghorn-local-dev" }))).toThrow();
    expect(() => verifyLocalToken(jwt.sign({ sub: "u" }, SECRET, { issuer: "someone-else" }))).toThrow();
    expect(() =>
      verifyLocalToken(jwt.sign({ sub: "u" }, SECRET, { issuer: "pronghorn-local-dev", algorithm: "HS512" })),
    ).toThrow();
    expect(() =>
      verifyLocalToken(jwt.sign({ sub: "u" }, SECRET, { issuer: "pronghorn-local-dev", expiresIn: -10 })),
    ).toThrow();
  });
});
