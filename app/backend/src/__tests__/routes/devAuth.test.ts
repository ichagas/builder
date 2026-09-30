/**
 * POST /api/v1/auth/dev-login — mounted only with AUTH_MODE=local.
 */
import request from "supertest";
import type { Request } from "express";
import { remoteRequestReason } from "../../routes/devAuth";

jest.mock("../../utils/logger", () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

// Minimal stateful fake of the tables dev-login touches.
const state = {
  orgs: [] as { id: string; name: string }[],
  users: [] as { id: string; email: string; role: string; name: string; provider?: string }[],
  roles: new Set<string>(),
  profiles: new Map<string, { org_id: string | null }>(),
};
function fakeQuery(text: string, params: any[] = []) {
  if (text.includes("pg_advisory_xact_lock")) return { rows: [] };
  if (text.includes("FROM public.organizations")) return { rows: state.orgs.filter((o) => o.name === params[0]).slice(0, 1) };
  if (text.includes("INSERT INTO public.organizations")) {
    const o = { id: params[0], name: params[1] };
    state.orgs.push(o);
    return { rows: [{ id: o.id }] };
  }
  if (text.includes("FROM auth.users")) {
    expect(text).toContain("lower(email) = $1");
    return { rows: state.users.filter((u) => u.email.toLowerCase() === params[0]) };
  }
  if (text.includes("INSERT INTO auth.users")) {
    const meta = JSON.parse(params[2]);
    const u = { id: params[0], email: params[1], role: "user", name: meta.name, provider: meta.provider };
    state.users.push(u);
    return { rows: [u] };
  }
  if (text.includes("INSERT INTO public.user_roles")) {
    state.roles.add(params[0]);
    return { rows: [] };
  }
  if (text.includes("INSERT INTO public.profiles")) {
    const cur = state.profiles.get(params[0]);
    state.profiles.set(params[0], { org_id: cur?.org_id ?? params[1] });
    return { rows: [] };
  }
  throw new Error(`unexpected query: ${text}`);
}
jest.mock("../../utils/database", () => ({
  __esModule: true,
  default: {
    query: jest.fn(async (t: string, p?: any[]) => fakeQuery(t, p)),
    transaction: jest.fn(async (cb: any) => cb({ query: async (t: string, p?: any[]) => fakeQuery(t, p) })),
  },
}));

const SECRET = "e".repeat(64);
const savedEnv = { ...process.env };

async function buildV1() {
  jest.resetModules();
  // express (and its async-errors patch) must come from the same fresh registry as the router.
  const express = (await import("express")).default;
  await import("express-async-errors");
  const { errorHandler } = await import("../../middleware/errorHandler");
  const v1 = (await import("../../routes/v1")).default;
  const app = express();
  app.use(express.json());
  app.use("/api/v1", v1);
  app.use(errorHandler);
  return app;
}

beforeEach(() => {
  state.orgs = [];
  state.users = [];
  state.roles = new Set();
  state.profiles = new Map();
  process.env.JWT_SECRET = SECRET;
  process.env.NODE_ENV = "development";
});
afterEach(() => {
  process.env = { ...savedEnv };
});

describe("without AUTH_MODE=local", () => {
  it("dev-login does not exist (404)", async () => {
    delete process.env.AUTH_MODE;
    const res = await request(await buildV1()).post("/api/v1/auth/dev-login").send({ email: "a@b.co", name: "A" });
    expect(res.status).toBe(404);
  });
});

describe("with AUTH_MODE=local", () => {
  beforeEach(() => {
    process.env.AUTH_MODE = "local";
    delete process.env.ENTRA_TENANT_ID;
    delete process.env.ENTRA_CLIENT_ID;
  });

  it("creates user, admin role, Local Dev org and profile; returns a token", async () => {
    const res = await request(await buildV1()).post("/api/v1/auth/dev-login").send({ email: "Dev@Local.test", name: " Dev " });
    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ email: "dev@local.test", name: "Dev" });
    expect(typeof res.body.token).toBe("string");
    expect(state.orgs.map((o) => o.name)).toEqual(["Local Dev"]);
    expect(state.roles.has(res.body.user.id)).toBe(true);
    expect(state.profiles.get(res.body.user.id)?.org_id).toBe(state.orgs[0].id);
  });

  it("is idempotent", async () => {
    const app = await buildV1();
    const a = await request(app).post("/api/v1/auth/dev-login").send({ email: "dev@local.test", name: "Dev" });
    const b = await request(app).post("/api/v1/auth/dev-login").send({ email: "dev@local.test", name: "Dev" });
    expect(b.body.user.id).toBe(a.body.user.id);
    expect(state.users).toHaveLength(1);
    expect(state.orgs).toHaveLength(1);
  });

  it("returns a token that authenticates a protected route", async () => {
    const app = await buildV1();
    const { body } = await request(app).post("/api/v1/auth/dev-login").send({ email: "dev@local.test", name: "Dev" });
    // /db is protected by authMiddleware; a missing token is 401, a valid one passes auth.
    const anon = await request(app).get("/api/v1/db/anything");
    expect(anon.status).toBe(401);
    const authed = await request(app).get("/api/v1/db/anything").set("Authorization", `Bearer ${body.token}`);
    expect(authed.status).not.toBe(401);
  });

  it.each([
    [{}],
    [{ email: "not-an-email", name: "A" }],
    [{ email: "a@b.co", name: "" }],
    [{ email: "a@b.co", name: "x".repeat(101) }],
    [{ email: `${"x".repeat(250)}@b.co`, name: "A" }],
    [{ email: 5, name: "A" }],
    [{ email: "a@b.co" }],
    [{ email: "a b@c.co", name: "A" }],
    [null],
  ])("rejects bad input %j with 400", async (body) => {
    const res = await request(await buildV1()).post("/api/v1/auth/dev-login").send(body as any);
    expect(res.status).toBe(400);
    expect(state.users).toHaveLength(0);
  });

  it("marks users it creates as local-dev", async () => {
    await request(await buildV1()).post("/api/v1/auth/dev-login").send({ email: "dev@local.test", name: "Dev" });
    expect(state.users[0].provider).toBe("local-dev");
  });

  it("matches an existing dev user case-insensitively", async () => {
    const app = await buildV1();
    const a = await request(app).post("/api/v1/auth/dev-login").send({ email: "dev@local.test", name: "Dev" });
    const b = await request(app).post("/api/v1/auth/dev-login").send({ email: "DEV@Local.Test", name: "Dev" });
    expect(b.status).toBe(200);
    expect(b.body.user.id).toBe(a.body.user.id);
    expect(state.users).toHaveLength(1);
  });

  it("409s for a pre-existing user not created by dev-login and does not promote it", async () => {
    state.users.push({ id: "real-1", email: "Real.Person@corp.com", role: "user", name: "Real", provider: "azure" });
    state.users.push({ id: "real-2", email: "legacy@corp.com", role: "user", name: "Legacy" }); // no provider at all
    for (const email of ["real.person@corp.com", "legacy@corp.com"]) {
      const res = await request(await buildV1()).post("/api/v1/auth/dev-login").send({ email, name: "X" });
      expect(res.status).toBe(409);
      expect(res.body.token).toBeUndefined();
    }
    expect(state.roles.size).toBe(0);
    expect(state.profiles.size).toBe(0);
    expect(state.orgs.length).toBeLessThanOrEqual(1); // never attaches the user to an org
  });

  describe("request guards (403 unless AUTH_LOCAL_ALLOW_REMOTE=true)", () => {
    const body = { email: "dev@local.test", name: "Dev" };
    it.each([
      ["a non-local Host header (DNS rebinding)", { Host: "evil.example.com" }],
      ["a non-local Host with a port", { Host: "rebind.attacker.net:3001" }],
      ["an Origin outside ALLOWED_ORIGINS", { Origin: "https://evil.example.com" }],
      ["X-Forwarded-For", { "X-Forwarded-For": "203.0.113.9" }],
      ["Forwarded", { Forwarded: "for=203.0.113.9" }],
    ])("rejects %s", async (_label, headers) => {
      const res = await request(await buildV1()).post("/api/v1/auth/dev-login").set(headers).send(body);
      expect(res.status).toBe(403);
      expect(state.users).toHaveLength(0);
    });

    it("rejects a wildcard-only ALLOWED_ORIGINS for a browser Origin", async () => {
      process.env.ALLOWED_ORIGINS = "*";
      const res = await request(await buildV1()).post("/api/v1/auth/dev-login").set("Origin", "https://evil.example.com").send(body);
      expect(res.status).toBe(403);
    });

    it("accepts localhost Hosts and an allowed Origin", async () => {
      process.env.ALLOWED_ORIGINS = "http://localhost:8080";
      const res = await request(await buildV1())
        .post("/api/v1/auth/dev-login")
        .set({ Host: "localhost:3001", Origin: "http://localhost:8080" })
        .send(body);
      expect(res.status).toBe(200);
      for (const host of ["127.0.0.1:3001", "[::1]:3001", "localhost"]) {
        const r = await request(await buildV1()).post("/api/v1/auth/dev-login").set("Host", host).send(body);
        expect(r.status).toBe(200);
      }
    });

    it("AUTH_LOCAL_ALLOW_REMOTE=true lifts the guards", async () => {
      process.env.AUTH_LOCAL_ALLOW_REMOTE = "true";
      const res = await request(await buildV1())
        .post("/api/v1/auth/dev-login")
        .set({ Host: "api.internal", "X-Forwarded-For": "10.1.1.1", Origin: "https://x.example" })
        .send(body);
      expect(res.status).toBe(200);
    });

    it("rejects a non-loopback socket", () => {
      const req = { socket: { remoteAddress: "192.168.1.20" }, headers: { host: "localhost:3001" } };
      expect(remoteRequestReason(req as unknown as Request)).toMatch(/loopback/);
    });
  });
});
