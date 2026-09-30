/**
 * POST /api/v1/auth/dev-login — mounted only with AUTH_MODE=local.
 */
import request from "supertest";

jest.mock("../../utils/logger", () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

// Minimal stateful fake of the tables dev-login touches.
const state = {
  orgs: [] as { id: string; name: string }[],
  users: [] as { id: string; email: string; role: string; name: string }[],
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
  if (text.includes("FROM auth.users")) return { rows: state.users.filter((u) => u.email === params[0]) };
  if (text.includes("INSERT INTO auth.users")) {
    const u = { id: params[0], email: params[1], role: "user", name: JSON.parse(params[2]).name };
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

function buildV1() {
  let app!: any;
  jest.isolateModules(() => {
    // express (and its async-errors patch) must come from the same isolated registry as the router.
    const express = require("express");
    require("express-async-errors");
    const { errorHandler } = require("../../middleware/errorHandler");
    const v1 = require("../../routes/v1").default;
    app = express();
    app.use(express.json());
    app.use("/api/v1", v1);
    app.use(errorHandler);
  });
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
    const res = await request(buildV1()).post("/api/v1/auth/dev-login").send({ email: "a@b.co", name: "A" });
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
    const res = await request(buildV1()).post("/api/v1/auth/dev-login").send({ email: "Dev@Local.test", name: " Dev " });
    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ email: "dev@local.test", name: "Dev" });
    expect(typeof res.body.token).toBe("string");
    expect(state.orgs.map((o) => o.name)).toEqual(["Local Dev"]);
    expect(state.roles.has(res.body.user.id)).toBe(true);
    expect(state.profiles.get(res.body.user.id)?.org_id).toBe(state.orgs[0].id);
  });

  it("is idempotent", async () => {
    const app = buildV1();
    const a = await request(app).post("/api/v1/auth/dev-login").send({ email: "dev@local.test", name: "Dev" });
    const b = await request(app).post("/api/v1/auth/dev-login").send({ email: "dev@local.test", name: "Dev" });
    expect(b.body.user.id).toBe(a.body.user.id);
    expect(state.users).toHaveLength(1);
    expect(state.orgs).toHaveLength(1);
  });

  it("returns a token that authenticates a protected route", async () => {
    const app = buildV1();
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
  ])("rejects bad input %j with 400", async (body) => {
    const res = await request(buildV1()).post("/api/v1/auth/dev-login").send(body);
    expect(res.status).toBe(400);
    expect(state.users).toHaveLength(0);
  });
});
