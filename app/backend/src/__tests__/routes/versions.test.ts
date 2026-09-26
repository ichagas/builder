/**
 * Unit tests for the versions routes (Epic B1)
 */
import express from "express";
import "express-async-errors";
import request from "supertest";
import versionsRouter from "../../routes/versions";
import { errorHandler } from "../../middleware/errorHandler";
import {
  setReleaseService,
  NotImplementedReleaseService,
  DefaultReleaseService,
} from "../../services/versions/releaseService";

jest.mock("../../utils/logger", () => ({
  logger: {
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
  },
}));

const mockBroadcast = jest.fn();
jest.mock("../../websocket", () => ({
  broadcast: (...args: unknown[]) => mockBroadcast(...args),
}));

jest.mock("../../utils/database", () => {
  const queryFn = jest.fn();
  return {
    __esModule: true,
    default: {
      query: queryFn,
      healthCheck: jest.fn(),
      getActiveDbPort: jest.fn(),
    },
  };
});

import db from "../../utils/database";
const mockDbQuery = db.query as jest.Mock;

const PROJECT_ID = "11111111-1111-1111-1111-111111111111";
const OWNER_ID = "owner-user";

function fakeAuth(userId?: string) {
  return (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    if (userId) req.user = { id: userId, email: "test@test.com" };
    next();
  };
}

function createApp(userId?: string) {
  const app = express();
  app.use(express.json());
  app.use(fakeAuth(userId));
  app.use("/projects", versionsRouter);
  app.use(errorHandler);
  return app;
}

/** Queue the owner-authorization DB call: SELECT created_by FROM projects */
function mockOwnerCheck(createdBy: string | null) {
  mockDbQuery.mockResolvedValueOnce({
    rows: createdBy === null ? [] : [{ created_by: createdBy }],
  });
}

/** Queue a project_tokens role lookup (called only when there's no owner match). */
function mockTokenRoleCheck(role: string | null) {
  mockDbQuery.mockResolvedValueOnce({ rows: role ? [{ role }] : [] });
}

describe("GET /projects/:projectId/versions", () => {
  beforeEach(() => {
    mockDbQuery.mockReset();
    mockBroadcast.mockReset();
  });

  it("returns 404 when the project does not exist", async () => {
    mockOwnerCheck(null);
    const res = await request(createApp(OWNER_ID)).get(`/projects/${PROJECT_ID}/versions`);
    expect(res.status).toBe(404);
  });

  it("returns 403 when neither the user nor a token grant access", async () => {
    mockOwnerCheck("someone-else");
    const res = await request(createApp(OWNER_ID)).get(`/projects/${PROJECT_ID}/versions`);
    expect(res.status).toBe(403);
  });

  it("returns versions for the owning user", async () => {
    mockOwnerCheck(OWNER_ID);
    mockDbQuery.mockResolvedValueOnce({
      rows: [{ id: "v1", project_id: PROJECT_ID, name: "v1.0.0", kind: "released" }],
    });

    const res = await request(createApp(OWNER_ID)).get(`/projects/${PROJECT_ID}/versions`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].name).toBe("v1.0.0");
  });

  it("allows a viewer token to read versions", async () => {
    mockOwnerCheck("someone-else");
    mockTokenRoleCheck("viewer");
    mockDbQuery.mockResolvedValueOnce({ rows: [] });

    const res = await request(createApp()).get(`/projects/${PROJECT_ID}/versions?token=22222222-0000-0000-0000-000000000001`);
    expect(res.status).toBe(200);
  });

  it("FIXED: orders versions by semver ascending, not insertion/created_at order", async () => {
    // data-model.md §1 "Rules": releases go out in order (name semver
    // ascending). The DB query alone can't sort a text `name` column
    // numerically, so the route re-sorts the fetched rows by parsed
    // [major, minor, patch]. Rows below are returned out of semver order
    // (as if ordered by created_at) to prove the route itself re-sorts them.
    mockOwnerCheck(OWNER_ID);
    mockDbQuery.mockResolvedValueOnce({
      rows: [
        { id: "v-2-0-0", name: "v2.0.0", created_at: "2026-01-04T00:00:00Z" },
        { id: "v1-2-0", name: "v1.2.0", created_at: "2026-01-01T00:00:00Z" },
        { id: "v1-10-0", name: "v1.10.0", created_at: "2026-01-03T00:00:00Z" },
        { id: "v1-2-0-second", name: "v1.2.0", created_at: "2026-01-05T00:00:00Z" }, // tiebreak on created_at
        { id: "v1-9-5", name: "v1.9.5", created_at: "2026-01-02T00:00:00Z" },
        { id: "no-leading-v", name: "3.0.0", created_at: "2026-01-06T00:00:00Z" },
        { id: "unparsable", name: "next", created_at: "2026-01-07T00:00:00Z" },
      ],
    });

    const res = await request(createApp(OWNER_ID)).get(`/projects/${PROJECT_ID}/versions`);
    expect(res.status).toBe(200);
    expect(res.body.map((v: { id: string }) => v.id)).toEqual([
      "unparsable", // unparsable name sorts as [0,0,0] -> first
      "v1-2-0", // v1.2.0, older of the two ties
      "v1-2-0-second", // v1.2.0, tiebreak by created_at
      "v1-9-5", // v1.9.5
      "v1-10-0", // v1.10.0 (numeric compare, not lexicographic: 10 > 9)
      "v-2-0-0", // v2.0.0
      "no-leading-v", // 3.0.0 (no leading v, still parsed)
    ]);
  });
});

describe("POST /projects/:projectId/versions", () => {
  beforeEach(() => {
    mockDbQuery.mockReset();
    mockBroadcast.mockReset();
  });

  it("creates a version for the owner and broadcasts", async () => {
    mockOwnerCheck(OWNER_ID);
    const created = { id: "v2", project_id: PROJECT_ID, name: "v1.1.0", kind: "planned" };
    mockDbQuery.mockResolvedValueOnce({ rows: [created] });

    const res = await request(createApp(OWNER_ID))
      .post(`/projects/${PROJECT_ID}/versions`)
      .send({ name: "v1.1.0", kind: "planned" });

    expect(res.status).toBe(201);
    expect(res.body).toEqual(created);
    expect(mockBroadcast).toHaveBeenCalledWith(`versions-${PROJECT_ID}`, "version_created", created);
  });

  it("rejects a viewer token (read-only)", async () => {
    mockOwnerCheck("someone-else");
    mockTokenRoleCheck("viewer");

    const res = await request(createApp())
      .post(`/projects/${PROJECT_ID}/versions?token=22222222-0000-0000-0000-000000000001`)
      .send({ name: "v1.1.0", kind: "planned" });

    expect(res.status).toBe(403);
    expect(mockBroadcast).not.toHaveBeenCalled();
  });

  it("allows an editor token to create a version", async () => {
    mockOwnerCheck("someone-else");
    mockTokenRoleCheck("editor");
    const created = { id: "v3", project_id: PROJECT_ID, name: "v1.2.0", kind: "planned" };
    mockDbQuery.mockResolvedValueOnce({ rows: [created] });

    const res = await request(createApp())
      .post(`/projects/${PROJECT_ID}/versions?token=22222222-0000-0000-0000-000000000002`)
      .send({ name: "v1.2.0", kind: "planned" });

    expect(res.status).toBe(201);
    expect(res.body).toEqual(created);
  });

  it("allows an owner-role token (share link, no user session) to create a version", async () => {
    mockOwnerCheck("someone-else");
    mockTokenRoleCheck("owner");
    const created = { id: "v4", project_id: PROJECT_ID, name: "v1.3.0", kind: "hotfix" };
    mockDbQuery.mockResolvedValueOnce({ rows: [created] });

    const res = await request(createApp()) // no userId => no Authorization header, no req.user
      .post(`/projects/${PROJECT_ID}/versions?token=22222222-0000-0000-0000-000000000003`)
      .send({ name: "v1.3.0", kind: "hotfix" });

    expect(res.status).toBe(201);
    expect(res.body).toEqual(created);
  });

  it("FIXED: a malformed ?token= resolves to 403, not a raw 500", async () => {
    // `project_tokens.token` is a `uuid` column. A non-UUID-shaped token
    // is rejected up front in services/versions/access.ts (isValidTokenShape)
    // instead of being sent to Postgres, where it used to raise `22P02` and
    // fall through errorHandler.ts as an unhandled 500.
    mockOwnerCheck("someone-else");

    const res = await request(createApp()).get(`/projects/${PROJECT_ID}/versions?token=garbage`);
    expect(res.status).toBe(403);
    // Only the owner check ran; no query.query("...project_tokens...") was attempted.
    expect(mockDbQuery).toHaveBeenCalledTimes(1);
  });

  it("validates name is required", async () => {
    mockOwnerCheck(OWNER_ID);
    const res = await request(createApp(OWNER_ID))
      .post(`/projects/${PROJECT_ID}/versions`)
      .send({ kind: "planned" });
    expect(res.status).toBe(422);
  });

  it("validates kind is restricted to hotfix/planned", async () => {
    mockOwnerCheck(OWNER_ID);
    const res = await request(createApp(OWNER_ID))
      .post(`/projects/${PROJECT_ID}/versions`)
      .send({ name: "v1.1.0", kind: "released" });
    expect(res.status).toBe(422);
  });

  it("returns 409 on a duplicate version name", async () => {
    mockOwnerCheck(OWNER_ID);
    mockDbQuery.mockImplementationOnce(() => {
      const err: any = new Error("duplicate key value violates unique constraint");
      err.code = "23505";
      throw err;
    });

    const res = await request(createApp(OWNER_ID))
      .post(`/projects/${PROJECT_ID}/versions`)
      .send({ name: "v1.0.0", kind: "hotfix" });

    expect(res.status).toBe(409);
  });
});

describe("release / first-release / release-checks (delegate to WP-BE2 stub)", () => {
  beforeEach(() => {
    mockDbQuery.mockReset();
    mockBroadcast.mockReset();
    setReleaseService(new NotImplementedReleaseService());
  });

  it("GET release-checks returns 501 while unimplemented", async () => {
    mockOwnerCheck(OWNER_ID);
    const res = await request(createApp(OWNER_ID)).get(`/projects/${PROJECT_ID}/release-checks`);
    expect(res.status).toBe(501);
  });

  it("POST release returns 501 while unimplemented", async () => {
    mockOwnerCheck(OWNER_ID);
    const res = await request(createApp(OWNER_ID)).post(
      `/projects/${PROJECT_ID}/versions/some-version/release`
    );
    expect(res.status).toBe(501);
  });

  it("POST first-release returns 501 while unimplemented", async () => {
    mockOwnerCheck(OWNER_ID);
    const res = await request(createApp(OWNER_ID)).post(`/projects/${PROJECT_ID}/first-release`);
    expect(res.status).toBe(501);
  });

  it("still enforces viewer read-only on POST release before delegating", async () => {
    mockOwnerCheck("someone-else");
    mockTokenRoleCheck("viewer");
    const res = await request(createApp()).post(
      `/projects/${PROJECT_ID}/versions/some-version/release?token=22222222-0000-0000-0000-000000000001`
    );
    expect(res.status).toBe(403);
  });
});

/**
 * HTTP-level integration with the real `DefaultReleaseService` (WP-BE2,
 * T102): confirms `routes/versions.ts` and `errorHandler` propagate the
 * service's `Errors.*` (notFound/conflict/validation) as the right status
 * codes end to end, not just that the service throws the right shape in
 * isolation (see `__tests__/services/versions/releaseService.test.ts`).
 * Every scenario here short-circuits before any GitHub/deploy call, so
 * `defaultReleaseGitHubClient`/`defaultDeployTrigger` are never exercised.
 */
describe("release / first-release / release-checks (real service, HTTP error paths)", () => {
  afterEach(() => {
    // Restore the stub so it doesn't leak into other describe blocks in
    // this file (the singleton is module-level, shared across tests).
    setReleaseService(new NotImplementedReleaseService());
  });

  /** Minimal SQL-text dispatcher, same shape as releaseService.test.ts's. */
  function dispatch(overrides: Record<string, (params: any[]) => any>) {
    mockDbQuery.mockImplementation(async (sql: string, params: any[] = []) => {
      for (const [needle, handler] of Object.entries(overrides)) {
        if (sql.includes(needle)) return handler(params);
      }
      return { rows: [] };
    });
  }

  it("POST release returns 404 for a version that doesn't exist on an otherwise-accessible project", async () => {
    setReleaseService(new DefaultReleaseService());
    dispatch({
      "SELECT created_by FROM projects": () => ({ rows: [{ created_by: OWNER_ID }] }),
      "SELECT * FROM projects WHERE id": () => ({ rows: [{ id: PROJECT_ID, stage: "released" }] }),
      "SELECT * FROM versions WHERE id": () => ({ rows: [] }),
    });

    const res = await request(createApp(OWNER_ID)).post(
      `/projects/${PROJECT_ID}/versions/does-not-exist/release`
    );

    expect(res.status).toBe(404);
  });

  it("POST release returns 409 when the first release hasn't happened yet", async () => {
    setReleaseService(new DefaultReleaseService());
    dispatch({
      "SELECT created_by FROM projects": () => ({ rows: [{ created_by: OWNER_ID }] }),
      "SELECT * FROM projects WHERE id": () => ({ rows: [{ id: PROJECT_ID, stage: "building" }] }),
    });

    const res = await request(createApp(OWNER_ID)).post(`/projects/${PROJECT_ID}/versions/v-1/release`);

    expect(res.status).toBe(409);
  });

  it("POST first-release returns 422 when checks fail (an unresolved change)", async () => {
    setReleaseService(new DefaultReleaseService());
    dispatch({
      "SELECT created_by FROM projects": () => ({ rows: [{ created_by: OWNER_ID }] }),
      "SELECT * FROM projects WHERE id": () => ({ rows: [{ id: PROJECT_ID, stage: "building" }] }),
      "SELECT wi.* FROM work_items": () => ({
        rows: [
          {
            id: "wi-1",
            key: "WI-1",
            type: "bug",
            title: "Bug",
            status: "active",
            branch: null,
            phase_state: {},
          },
        ],
      }),
    });

    const res = await request(createApp(OWNER_ID)).post(`/projects/${PROJECT_ID}/first-release`);

    expect(res.status).toBe(422);
  });
});
