/**
 * Unit tests for the work-items routes (Epic B1)
 */
import express from "express";
import "express-async-errors";
import request from "supertest";
import projectWorkItemsRouter, { workItemByIdRouter } from "../../routes/workItems";
import { errorHandler } from "../../middleware/errorHandler";

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
const WORK_ITEM_ID = "33333333-3333-3333-3333-333333333333";

function fakeAuth(userId?: string) {
  return (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    if (userId) req.user = { id: userId, email: "test@test.com" };
    next();
  };
}

function createProjectApp(userId?: string) {
  const app = express();
  app.use(express.json());
  app.use(fakeAuth(userId));
  app.use("/projects", projectWorkItemsRouter);
  app.use(errorHandler);
  return app;
}

function createByIdApp(userId?: string) {
  const app = express();
  app.use(express.json());
  app.use(fakeAuth(userId));
  app.use("/work-items", workItemByIdRouter);
  app.use(errorHandler);
  return app;
}

function mockOwnerCheck(createdBy: string | null) {
  mockDbQuery.mockResolvedValueOnce({
    rows: createdBy === null ? [] : [{ created_by: createdBy }],
  });
}

function mockTokenRoleCheck(role: string | null) {
  mockDbQuery.mockResolvedValueOnce({ rows: role ? [{ role }] : [] });
}

function mockWorkItemLookup(workItem: Record<string, unknown> | null) {
  mockDbQuery.mockResolvedValueOnce({ rows: workItem ? [workItem] : [] });
}

const baseWorkItem = {
  id: WORK_ITEM_ID,
  project_id: PROJECT_ID,
  key: "WI-1",
  version_id: null,
  type: "bug",
  severity: "high",
  title: "Something broke",
  status: "triage",
  phase_state: { define: "active", design: "todo", build: "todo", ship: "todo" },
  phase_notes: {},
  preview_url: null,
  components: [],
};

beforeEach(() => {
  mockDbQuery.mockReset();
  mockBroadcast.mockReset();
});

describe("GET /projects/:projectId/work-items", () => {
  it("lists work items and supports status/versionId filters", async () => {
    mockOwnerCheck(OWNER_ID);
    mockDbQuery.mockResolvedValueOnce({ rows: [baseWorkItem] });

    const res = await request(createProjectApp(OWNER_ID)).get(
      `/projects/${PROJECT_ID}/work-items?status=triage`
    );
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);

    const [sql, params] = mockDbQuery.mock.calls[1];
    expect(sql).toContain("status = $2");
    expect(params).toEqual([PROJECT_ID, "triage"]);
  });

  it("returns a validation error for an invalid status filter", async () => {
    mockOwnerCheck(OWNER_ID);
    const res = await request(createProjectApp(OWNER_ID)).get(
      `/projects/${PROJECT_ID}/work-items?status=bogus`
    );
    expect(res.status).toBe(422);
  });
});

describe("POST /projects/:projectId/work-items", () => {
  it("creates a work item with the next sequential key and broadcasts", async () => {
    mockOwnerCheck(OWNER_ID);
    mockDbQuery.mockResolvedValueOnce({ rows: [{ max_num: 2 }] }); // key sequencing query
    const created = { ...baseWorkItem, id: "new-id", key: "WI-3" };
    mockDbQuery.mockResolvedValueOnce({ rows: [created] });

    const res = await request(createProjectApp(OWNER_ID))
      .post(`/projects/${PROJECT_ID}/work-items`)
      .send({ type: "bug", title: "New bug", severity: "medium" });

    expect(res.status).toBe(201);
    expect(res.body.key).toBe("WI-3");
    expect(mockBroadcast).toHaveBeenCalledWith(
      `versions-${PROJECT_ID}`,
      "work_item_created",
      created
    );
  });

  it("computes WI-1 as the first key when the project has no work items", async () => {
    mockOwnerCheck(OWNER_ID);
    mockDbQuery.mockResolvedValueOnce({ rows: [{ max_num: 0 }] });
    const created = { ...baseWorkItem, key: "WI-1" };
    mockDbQuery.mockResolvedValueOnce({ rows: [created] });

    const res = await request(createProjectApp(OWNER_ID))
      .post(`/projects/${PROJECT_ID}/work-items`)
      .send({ type: "feature", title: "First feature" });

    expect(res.status).toBe(201);
    expect(res.body.key).toBe("WI-1");
  });

  it("rejects a viewer token", async () => {
    mockOwnerCheck("someone-else");
    mockTokenRoleCheck("viewer");

    const res = await request(createProjectApp())
      .post(`/projects/${PROJECT_ID}/work-items?token=viewer-token`)
      .send({ type: "bug", title: "New bug" });

    expect(res.status).toBe(403);
  });

  it("allows an editor token to create a work item", async () => {
    mockOwnerCheck("someone-else");
    mockTokenRoleCheck("editor");
    mockDbQuery.mockResolvedValueOnce({ rows: [{ max_num: 0 }] });
    const created = { ...baseWorkItem, key: "WI-1" };
    mockDbQuery.mockResolvedValueOnce({ rows: [created] });

    const res = await request(createProjectApp())
      .post(`/projects/${PROJECT_ID}/work-items?token=editor-token`)
      .send({ type: "enhancement", title: "Improve it" });

    expect(res.status).toBe(201);
  });

  it("allows an owner-role token (not just an authenticated owner user) to create a work item", async () => {
    mockOwnerCheck("someone-else");
    mockTokenRoleCheck("owner");
    mockDbQuery.mockResolvedValueOnce({ rows: [{ max_num: 0 }] });
    const created = { ...baseWorkItem, key: "WI-1" };
    mockDbQuery.mockResolvedValueOnce({ rows: [created] });

    const res = await request(createProjectApp())
      .post(`/projects/${PROJECT_ID}/work-items?token=owner-token`)
      .send({ type: "bug", title: "Reported via share link" });

    expect(res.status).toBe(201);
  });

  it("works with only ?token= and no user session at all (no Authorization header, no req.user)", async () => {
    mockOwnerCheck("someone-else");
    mockTokenRoleCheck("editor");
    mockDbQuery.mockResolvedValueOnce({ rows: [{ max_num: 0 }] });
    mockDbQuery.mockResolvedValueOnce({ rows: [{ ...baseWorkItem, key: "WI-1" }] });

    // createProjectApp() with no userId never sets req.user, matching an
    // anonymous request through optionalAuthMiddleware with a share token.
    const res = await request(createProjectApp())
      .post(`/projects/${PROJECT_ID}/work-items?token=editor-token`)
      .send({ type: "bug", title: "Anonymous via token" });

    expect(res.status).toBe(201);
  });

  it("validates type", async () => {
    mockOwnerCheck(OWNER_ID);
    const res = await request(createProjectApp(OWNER_ID))
      .post(`/projects/${PROJECT_ID}/work-items`)
      .send({ type: "not-a-type", title: "x" });
    expect(res.status).toBe(422);
  });

  it("validates title is required", async () => {
    mockOwnerCheck(OWNER_ID);
    const res = await request(createProjectApp(OWNER_ID))
      .post(`/projects/${PROJECT_ID}/work-items`)
      .send({ type: "bug" });
    expect(res.status).toBe(422);
  });

  it("KNOWN DEFECT: a malformed ?token= (not UUID-shaped) surfaces as a raw 500, not 403", async () => {
    // `project_tokens.token` is `uuid` in infra/migrations/001_full_schema.sql.
    // Verified against a real postgres:16-alpine container: a non-UUID token
    // fails the role lookup with `22P02 invalid input syntax for type uuid`,
    // which has no `statusCode` and falls through errorHandler.ts as 500,
    // leaking the raw Postgres message. Per contracts/api.md, every B1 route
    // "authorizes through authorize_project_access, like the RPCs" and should
    // reject bad tokens with 403, the same as an unknown-but-valid-format one.
    mockOwnerCheck("someone-else");
    const pgError: any = new Error('invalid input syntax for type uuid: "not-a-real-token"');
    pgError.code = "22P02";
    mockDbQuery.mockRejectedValueOnce(pgError);

    const res = await request(createProjectApp())
      .post(`/projects/${PROJECT_ID}/work-items?token=not-a-real-token`)
      .send({ type: "bug", title: "x" });

    expect(res.status).toBe(500); // documents current behavior; should be 403
  });

  it("KNOWN DEFECT: a WI-<n> key collision under concurrent creates surfaces as an unhandled 500, not a retry or 409", async () => {
    // `nextWorkItemKey` reads MAX(key) then a separate INSERT computes the
    // same next key for two concurrent requests targeting the same project
    // (confirmed empirically: 7/10 concurrent inserts failed this way
    // against a real database). Unlike POST /versions (which catches 23505
    // and returns 409, see routes/versions.ts), this route's INSERT has no
    // catch for the `work_items_project_id_key_key` unique-constraint
    // violation, so the loser of the race gets a raw 500 instead of a clean
    // conflict response or a transparent retry.
    mockOwnerCheck(OWNER_ID);
    mockDbQuery.mockResolvedValueOnce({ rows: [{ max_num: 5 }] }); // key sequencing query
    const raceError: any = new Error(
      'duplicate key value violates unique constraint "work_items_project_id_key_key"'
    );
    raceError.code = "23505";
    mockDbQuery.mockRejectedValueOnce(raceError); // the INSERT loses the race

    const res = await request(createProjectApp(OWNER_ID))
      .post(`/projects/${PROJECT_ID}/work-items`)
      .send({ type: "bug", title: "Racing create" });

    expect(res.status).toBe(500); // documents current behavior; should be 409 (or a retry)
  });
});

describe("GET /work-items/:id", () => {
  it("returns the work item", async () => {
    mockWorkItemLookup(baseWorkItem);
    mockOwnerCheck(OWNER_ID);

    const res = await request(createByIdApp(OWNER_ID)).get(`/work-items/${WORK_ITEM_ID}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(WORK_ITEM_ID);
  });

  it("returns 404 when the work item does not exist", async () => {
    mockWorkItemLookup(null);
    const res = await request(createByIdApp(OWNER_ID)).get(`/work-items/does-not-exist`);
    expect(res.status).toBe(404);
  });

  it("returns 403 for a user with no access to the parent project", async () => {
    mockWorkItemLookup(baseWorkItem);
    mockOwnerCheck("someone-else");
    const res = await request(createByIdApp("some-other-user")).get(`/work-items/${WORK_ITEM_ID}`);
    expect(res.status).toBe(403);
  });
});

describe("PATCH /work-items/:id", () => {
  it("updates fields, broadcasts work_item_updated, and item_moved when version changes", async () => {
    mockWorkItemLookup(baseWorkItem);
    mockOwnerCheck(OWNER_ID);
    const updated = { ...baseWorkItem, version_id: "v-9", title: "Renamed" };
    mockDbQuery.mockResolvedValueOnce({ rows: [updated] });

    const res = await request(createByIdApp(OWNER_ID))
      .patch(`/work-items/${WORK_ITEM_ID}`)
      .send({ versionId: "v-9", title: "Renamed" });

    expect(res.status).toBe(200);
    expect(res.body).toEqual(updated);
    expect(mockBroadcast).toHaveBeenCalledWith(`versions-${PROJECT_ID}`, "item_moved", updated);
    expect(mockBroadcast).toHaveBeenCalledWith(`work-item-${WORK_ITEM_ID}`, "work_item_updated", updated);
  });

  it("rejects a viewer token", async () => {
    mockWorkItemLookup(baseWorkItem);
    mockOwnerCheck("someone-else");
    mockTokenRoleCheck("viewer");

    const res = await request(createByIdApp())
      .patch(`/work-items/${WORK_ITEM_ID}?token=viewer-token`)
      .send({ title: "Nope" });

    expect(res.status).toBe(403);
  });

  it("validates status enum", async () => {
    mockWorkItemLookup(baseWorkItem);
    mockOwnerCheck(OWNER_ID);
    const res = await request(createByIdApp(OWNER_ID))
      .patch(`/work-items/${WORK_ITEM_ID}`)
      .send({ status: "not-a-status" });
    expect(res.status).toBe(422);
  });

  it("requires at least one updatable field", async () => {
    mockWorkItemLookup(baseWorkItem);
    mockOwnerCheck(OWNER_ID);
    const res = await request(createByIdApp(OWNER_ID)).patch(`/work-items/${WORK_ITEM_ID}`).send({});
    expect(res.status).toBe(422);
  });
});

describe("POST /work-items/:id/steps/:step/complete", () => {
  it("marks the step done and advances the next todo step to active", async () => {
    mockWorkItemLookup(baseWorkItem);
    mockOwnerCheck(OWNER_ID);
    const updated = {
      ...baseWorkItem,
      phase_state: { define: "done", design: "active", build: "todo", ship: "todo" },
    };
    mockDbQuery.mockResolvedValueOnce({ rows: [updated] });

    const res = await request(createByIdApp(OWNER_ID)).post(
      `/work-items/${WORK_ITEM_ID}/steps/define/complete`
    );

    expect(res.status).toBe(200);
    expect(res.body.phase_state.define).toBe("done");
    expect(mockBroadcast).toHaveBeenCalledWith(`work-item-${WORK_ITEM_ID}`, "phase_changed", updated);
  });

  it("validates the step name", async () => {
    const res = await request(createByIdApp(OWNER_ID)).post(
      `/work-items/${WORK_ITEM_ID}/steps/not-a-step/complete`
    );
    expect(res.status).toBe(422);
  });

  it("rejects a viewer token", async () => {
    mockWorkItemLookup(baseWorkItem);
    mockOwnerCheck("someone-else");
    mockTokenRoleCheck("viewer");

    const res = await request(createByIdApp()).post(
      `/work-items/${WORK_ITEM_ID}/steps/define/complete?token=viewer-token`
    );
    expect(res.status).toBe(403);
  });
});

describe("POST /work-items/:id/steps/design/unskip", () => {
  it("resets the design phase to todo", async () => {
    const skipped = {
      ...baseWorkItem,
      phase_state: { define: "done", design: "skipped", build: "todo", ship: "todo" },
    };
    mockWorkItemLookup(skipped);
    mockOwnerCheck(OWNER_ID);
    const updated = { ...skipped, phase_state: { ...skipped.phase_state, design: "todo" } };
    mockDbQuery.mockResolvedValueOnce({ rows: [updated] });

    const res = await request(createByIdApp(OWNER_ID)).post(
      `/work-items/${WORK_ITEM_ID}/steps/design/unskip`
    );

    expect(res.status).toBe(200);
    expect(res.body.phase_state.design).toBe("todo");
    expect(mockBroadcast).toHaveBeenCalledWith(`work-item-${WORK_ITEM_ID}`, "phase_changed", updated);
  });
});

describe("GET/POST /work-items/:id/requirement-changes", () => {
  it("lists requirement changes", async () => {
    mockWorkItemLookup(baseWorkItem);
    mockOwnerCheck(OWNER_ID);
    const change = { id: "rc-1", work_item_id: WORK_ITEM_ID, kind: "new", title: "New criterion" };
    mockDbQuery.mockResolvedValueOnce({ rows: [change] });

    const res = await request(createByIdApp(OWNER_ID)).get(
      `/work-items/${WORK_ITEM_ID}/requirement-changes`
    );
    expect(res.status).toBe(200);
    expect(res.body).toEqual([change]);
  });

  it("creates a requirement change", async () => {
    mockWorkItemLookup(baseWorkItem);
    mockOwnerCheck(OWNER_ID);
    const created = { id: "rc-2", work_item_id: WORK_ITEM_ID, kind: "new", title: "Another criterion" };
    mockDbQuery.mockResolvedValueOnce({ rows: [created] });

    const res = await request(createByIdApp(OWNER_ID))
      .post(`/work-items/${WORK_ITEM_ID}/requirement-changes`)
      .send({ kind: "new", title: "Another criterion" });

    expect(res.status).toBe(201);
    expect(res.body).toEqual(created);
    expect(mockBroadcast).toHaveBeenCalledWith(
      `work-item-${WORK_ITEM_ID}`,
      "requirement_change_added",
      created
    );
  });

  it("requires requirementId unless kind is new", async () => {
    mockWorkItemLookup(baseWorkItem);
    mockOwnerCheck(OWNER_ID);

    const res = await request(createByIdApp(OWNER_ID))
      .post(`/work-items/${WORK_ITEM_ID}/requirement-changes`)
      .send({ kind: "changed", title: "Changed criterion" });

    expect(res.status).toBe(422);
  });

  it("rejects a viewer token on create", async () => {
    mockWorkItemLookup(baseWorkItem);
    mockOwnerCheck("someone-else");
    mockTokenRoleCheck("viewer");

    const res = await request(createByIdApp())
      .post(`/work-items/${WORK_ITEM_ID}/requirement-changes?token=viewer-token`)
      .send({ kind: "new", title: "x" });

    expect(res.status).toBe(403);
  });
});
