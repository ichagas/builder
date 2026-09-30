/**
 * Unit tests for AUTH_MODE=local guards (config/authMode.ts)
 */
import jwt from "jsonwebtoken";
import {
  isLocalDatabaseHost,
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
  it("accepts NODE_ENV=test", () => {
    expect(() => assertAuthModeConfig({ ...localEnv, NODE_ENV: "test" })).not.toThrow();
  });
  it.each(["production", "staging", "Development", "", undefined])(
    "refuses NODE_ENV=%j (allow-list: exactly development or test)",
    (nodeEnv) => {
      expect(() => assertAuthModeConfig({ ...localEnv, NODE_ENV: nodeEnv })).toThrow(/NODE_ENV/);
    },
  );
  it("refuses Azure-hosted runtimes", () => {
    expect(() => assertAuthModeConfig({ ...localEnv, CONTAINER_APP_NAME: "ca-x" })).toThrow(/Azure/);
    expect(() => assertAuthModeConfig({ ...localEnv, WEBSITE_SITE_NAME: "app" })).toThrow(/Azure/);
  });
  it("requires JWT_SECRET", () => {
    expect(() => assertAuthModeConfig({ AUTH_MODE: "local", NODE_ENV: "development" })).toThrow(/JWT_SECRET/);
  });
  it("rejects short and placeholder secrets", () => {
    expect(() => assertAuthModeConfig({ ...localEnv, JWT_SECRET: "short" })).toThrow(/at least 32/);
    expect(() =>
      assertAuthModeConfig({ ...localEnv, JWT_SECRET: "local-dev-jwt-secret-change-me-please-now" }),
    ).toThrow(/placeholder/);
  });
  it("rejects the documented .env.example placeholder secret", () => {
    expect(() => assertAuthModeConfig({ ...localEnv, JWT_SECRET: "change-me-run-openssl-rand-hex-32" })).toThrow(
      /placeholder/,
    );
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

describe("isLocalDatabaseHost", () => {
  it.each(["localhost", "127.0.0.1", "::1", "db", " LOCALHOST "])("%s is local", (h) => {
    expect(isLocalDatabaseHost({ POSTGRES_HOST: h })).toBe(true);
  });
  it.each(["", "pg-prod.postgres.database.azure.com", "10.0.0.5"])("%j is not local", (h) => {
    expect(isLocalDatabaseHost({ POSTGRES_HOST: h })).toBe(false);
  });
});
