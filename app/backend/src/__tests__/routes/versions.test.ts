/**
 * Unit tests for the versions routes (Epic B1)
 */
import express from "express";
import "express-async-errors";
import request from "supertest";
import versionsRouter from "../../routes/versions";
import { errorHandler } from "../../middleware/errorHandler";
import { setReleaseService, NotImplementedReleaseService } from "../../services/versions/releaseService";

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

    const res = await request(createApp()).get(`/projects/${PROJECT_ID}/versions?token=viewer-token`);
    expect(res.status).toBe(200);
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
      .post(`/projects/${PROJECT_ID}/versions?token=viewer-token`)
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
      .post(`/projects/${PROJECT_ID}/versions?token=editor-token`)
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
      .post(`/projects/${PROJECT_ID}/versions?token=owner-token`)
      .send({ name: "v1.3.0", kind: "hotfix" });

    expect(res.status).toBe(201);
    expect(res.body).toEqual(created);
  });

  it("KNOWN DEFECT: a malformed ?token= surfaces as a raw 500, not 403", async () => {
    // See the matching test in workItems.test.ts and services/versions/access.test.ts:
    // `project_tokens.token` is a `uuid` column, so a non-UUID-shaped token
    // fails the SQL with `22P02` (no `statusCode`), and errorHandler.ts falls
    // back to 500 for any error without one.
    mockOwnerCheck("someone-else");
    const pgError: any = new Error('invalid input syntax for type uuid: "garbage"');
    pgError.code = "22P02";
    mockDbQuery.mockRejectedValueOnce(pgError);

    const res = await request(createApp()).get(`/projects/${PROJECT_ID}/versions?token=garbage`);
    expect(res.status).toBe(500); // documents current behavior; should be 403
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
      `/projects/${PROJECT_ID}/versions/some-version/release?token=viewer-token`
    );
    expect(res.status).toBe(403);
  });
});
