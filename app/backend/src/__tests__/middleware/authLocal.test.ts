/**
 * authMiddleware in AUTH_MODE=local: no Entra config needed, only dev-login
 * tokens are accepted, APIM identity headers are ignored.
 */
import { Request, Response, NextFunction } from "express";

jest.mock("../../utils/logger", () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));
jest.mock("../../utils/database", () => ({
  __esModule: true,
  default: { query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }) },
}));

const SECRET = "c".repeat(64);
const savedEnv = { ...process.env };

function load() {
  let mod: typeof import("../../middleware/auth");
  let cfg: typeof import("../../config/authMode");
  jest.isolateModules(() => {
    mod = require("../../middleware/auth");
    cfg = require("../../config/authMode");
  });
  return { mod: mod!, cfg: cfg! };
}

function run(fn: (q: Request, s: Response, n: NextFunction) => void, headers: Record<string, string> = {}) {
  const req = { headers } as unknown as Request;
  const res = { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() } as unknown as Response;
  const next = jest.fn();
  fn(req, res, next);
  return { req, res, next };
}

describe("authMiddleware (AUTH_MODE=local)", () => {
  beforeEach(() => {
    delete process.env.ENTRA_TENANT_ID;
    delete process.env.ENTRA_CLIENT_ID;
    process.env.AUTH_MODE = "local";
    process.env.JWT_SECRET = SECRET;
    process.env.NODE_ENV = "development";
  });
  afterEach(() => {
    process.env = { ...savedEnv };
  });

  it("loads without ENTRA_* variables", () => {
    expect(() => load()).not.toThrow();
  });

  it("refuses to load with NODE_ENV=production", () => {
    process.env.NODE_ENV = "production";
    expect(() => load()).toThrow(/production/);
  });

  it("authenticates a dev-login token", () => {
    const { mod, cfg } = load();
    const token = cfg.signLocalToken({ sub: "u1", email: "dev@local.test", name: "Dev", role: "user" });
    const { req, next } = run(mod.authMiddleware, { authorization: `Bearer ${token}` });
    expect(next).toHaveBeenCalled();
    expect(req.user).toEqual({ id: "u1", email: "dev@local.test", name: "Dev", role: "user" });
  });

  it("rejects missing, garbage and foreign-signed tokens with 401", () => {
    const { mod } = load();
    const jwt = require("jsonwebtoken");
    for (const headers of <Record<string, string>[]>[
      {},
      { authorization: "Bearer nope" },
      { authorization: `Bearer ${jwt.sign({ sub: "u" }, "d".repeat(64), { issuer: "pronghorn-local-dev" })}` },
    ]) {
      const { res, next } = run(mod.authMiddleware, headers);
      expect(res.status).toHaveBeenCalledWith(401);
      expect(next).not.toHaveBeenCalled();
    }
  });

  it("rejects an expired token with 401", () => {
    const { mod } = load();
    const jwt = require("jsonwebtoken");
    const expired = jwt.sign({ sub: "u" }, SECRET, { algorithm: "HS256", issuer: "pronghorn-local-dev", expiresIn: -30 });
    const { res, next } = run(mod.authMiddleware, { authorization: `Bearer ${expired}` });
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("ignores APIM identity headers", () => {
    const { mod } = load();
    const { res, next } = run(mod.authMiddleware, { "x-user-id": "u", "x-user-email": "a@b.co" });
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("optionalAuthMiddleware attaches user for a valid token and continues anonymously otherwise", () => {
    const { mod, cfg } = load();
    const token = cfg.signLocalToken({ sub: "u2", email: "x@y.zz" });
    expect(run(mod.optionalAuthMiddleware, { authorization: `Bearer ${token}` }).req.user?.id).toBe("u2");
    const anon = run(mod.optionalAuthMiddleware, { authorization: "Bearer bad", "x-user-id": "u", "x-user-email": "a@b.co" });
    expect(anon.req.user).toBeUndefined();
    expect(anon.next).toHaveBeenCalled();
  });
});
