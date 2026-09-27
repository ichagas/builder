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

const mockEnsureBranchForWorkItem = jest.fn();
jest.mock("../../services/versions/branchService", () => {
  const actual = jest.requireActual("../../services/versions/branchService");
  return {
    ...actual,
    ensureBranchForWorkItem: (...args: unknown[]) => mockEnsureBranchForWorkItem(...args),
  };
});

jest.mock("../../utils/database", () => {
  const queryFn = jest.fn();
  // Key allocation runs inside db.transaction(); the fake client just
  // funnels client.query() through the same queryFn mock so tests can
  // assert against a single, linear call sequence.
  const transactionFn = jest.fn((callback: (client: { query: jest.Mock }) => Promise<unknown>) =>
    callback({ query: queryFn })
  );
  return {
    __esModule: true,
    default: {
      query: queryFn,
      transaction: transactionFn,
      healthCheck: jest.fn(),
      getActiveDbPort: jest.fn(),
    },
  };
});

import db from "../../utils/database";
const mockDbQuery = db.query as jest.Mock;
const mockTransaction = db.transaction as jest.Mock;

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
  mockTransaction.mockClear();
  mockEnsureBranchForWorkItem.mockReset();
  mockEnsureBranchForWorkItem.mockResolvedValue({ branch: null, created: false });
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
    mockDbQuery.mockResolvedValueOnce({ rows: [] }); // pg_advisory_xact_lock
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
    mockDbQuery.mockResolvedValueOnce({ rows: [] }); // pg_advisory_xact_lock
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
      .post(`/projects/${PROJECT_ID}/work-items?token=22222222-0000-0000-0000-000000000001`)
      .send({ type: "bug", title: "New bug" });

    expect(res.status).toBe(403);
  });

  it("allows an editor token to create a work item", async () => {
    mockOwnerCheck("someone-else");
    mockTokenRoleCheck("editor");
    mockDbQuery.mockResolvedValueOnce({ rows: [] }); // pg_advisory_xact_lock
    mockDbQuery.mockResolvedValueOnce({ rows: [{ max_num: 0 }] });
    const created = { ...baseWorkItem, key: "WI-1" };
    mockDbQuery.mockResolvedValueOnce({ rows: [created] });

    const res = await request(createProjectApp())
      .post(`/projects/${PROJECT_ID}/work-items?token=22222222-0000-0000-0000-000000000002`)
      .send({ type: "enhancement", title: "Improve it" });

    expect(res.status).toBe(201);
  });

  it("allows an owner-role token (not just an authenticated owner user) to create a work item", async () => {
    mockOwnerCheck("someone-else");
    mockTokenRoleCheck("owner");
    mockDbQuery.mockResolvedValueOnce({ rows: [] }); // pg_advisory_xact_lock
    mockDbQuery.mockResolvedValueOnce({ rows: [{ max_num: 0 }] });
    const created = { ...baseWorkItem, key: "WI-1" };
    mockDbQuery.mockResolvedValueOnce({ rows: [created] });

    const res = await request(createProjectApp())
      .post(`/projects/${PROJECT_ID}/work-items?token=22222222-0000-0000-0000-000000000003`)
      .send({ type: "bug", title: "Reported via share link" });

    expect(res.status).toBe(201);
  });

  it("works with only ?token= and no user session at all (no Authorization header, no req.user)", async () => {
    mockOwnerCheck("someone-else");
    mockTokenRoleCheck("editor");
    mockDbQuery.mockResolvedValueOnce({ rows: [] }); // pg_advisory_xact_lock
    mockDbQuery.mockResolvedValueOnce({ rows: [{ max_num: 0 }] });
    mockDbQuery.mockResolvedValueOnce({ rows: [{ ...baseWorkItem, key: "WI-1" }] });

    // createProjectApp() with no userId never sets req.user, matching an
    // anonymous request through optionalAuthMiddleware with a share token.
    const res = await request(createProjectApp())
      .post(`/projects/${PROJECT_ID}/work-items?token=22222222-0000-0000-0000-000000000002`)
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

  it("FIXED: a malformed ?token= (not UUID-shaped) resolves to 403, not a raw 500", async () => {
    // `project_tokens.token` is `uuid` in infra/migrations/001_full_schema.sql.
    // A non-UUID token is now rejected up front by
    // services/versions/access.ts's isValidTokenShape, before ever reaching
    // Postgres, instead of raising `22P02` and falling through
    // errorHandler.ts as a raw 500.
    mockOwnerCheck("someone-else");

    const res = await request(createProjectApp())
      .post(`/projects/${PROJECT_ID}/work-items?token=not-a-real-token`)
      .send({ type: "bug", title: "x" });

    expect(res.status).toBe(403);
    expect(mockDbQuery).toHaveBeenCalledTimes(1); // only the owner check
  });

  it("FIXED: a WI-<n> key collision on the INSERT retries and succeeds with a fresh key", async () => {
    // Key allocation now happens inside db.transaction(), serialized per
    // project by `pg_advisory_xact_lock(hashtext(projectId))` -- see
    // createWorkItemWithKey in routes/workItems.ts. As defense in depth, the
    // INSERT is also wrapped in a bounded retry loop that recomputes the key
    // and retries on `work_items_project_id_key_key` (23505) instead of
    // letting it surface as a raw 500. This test drives that retry path
    // directly: the mocked client raises 23505 once (simulating a
    // still-possible race, e.g. two pool connections bypassing the lock),
    // then succeeds with a recomputed key on the second attempt.
    mockOwnerCheck(OWNER_ID);
    mockDbQuery.mockResolvedValueOnce({ rows: [] }); // pg_advisory_xact_lock
    mockDbQuery.mockResolvedValueOnce({ rows: [{ max_num: 5 }] }); // first key computation -> WI-6
    const raceError: any = new Error(
      'duplicate key value violates unique constraint "work_items_project_id_key_key"'
    );
    raceError.code = "23505";
    mockDbQuery.mockRejectedValueOnce(raceError); // first INSERT (WI-6) loses the race
    mockDbQuery.mockResolvedValueOnce({ rows: [{ max_num: 6 }] }); // retry: recompute -> WI-7
    const created = { ...baseWorkItem, key: "WI-7" };
    mockDbQuery.mockResolvedValueOnce({ rows: [created] }); // retry INSERT succeeds

    const res = await request(createProjectApp(OWNER_ID))
      .post(`/projects/${PROJECT_ID}/work-items`)
      .send({ type: "bug", title: "Racing create" });

    expect(res.status).toBe(201);
    expect(res.body.key).toBe("WI-7");
  });

  it("serializes key allocation per project with pg_advisory_xact_lock before computing the key", async () => {
    mockOwnerCheck(OWNER_ID);
    mockDbQuery.mockResolvedValueOnce({ rows: [] }); // advisory lock
    mockDbQuery.mockResolvedValueOnce({ rows: [{ max_num: 0 }] });
    mockDbQuery.mockResolvedValueOnce({ rows: [{ ...baseWorkItem, key: "WI-1" }] });

    await request(createProjectApp(OWNER_ID))
      .post(`/projects/${PROJECT_ID}/work-items`)
      .send({ type: "bug", title: "x" });

    expect(mockTransaction).toHaveBeenCalledTimes(1);
    const [lockSql, lockParams] = mockDbQuery.mock.calls[1];
    expect(lockSql).toMatch(/pg_advisory_xact_lock/);
    expect(lockParams).toEqual([PROJECT_ID]);
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
      .patch(`/work-items/${WORK_ITEM_ID}?token=22222222-0000-0000-0000-000000000001`)
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

  it("creates a real Git branch when the change is scheduled into a version (T104)", async () => {
    mockWorkItemLookup(baseWorkItem);
    mockOwnerCheck(OWNER_ID);
    const updated = { ...baseWorkItem, version_id: "v-9", branch: null };
    mockDbQuery.mockResolvedValueOnce({ rows: [updated] });
    mockEnsureBranchForWorkItem.mockResolvedValueOnce({
      branch: "fix/wi-1-something-broke",
      created: true,
    });

    const res = await request(createByIdApp(OWNER_ID))
      .patch(`/work-items/${WORK_ITEM_ID}`)
      .send({ versionId: "v-9" });

    expect(res.status).toBe(200);
    expect(mockEnsureBranchForWorkItem).toHaveBeenCalledWith(WORK_ITEM_ID);
    expect(res.body.branch).toBe("fix/wi-1-something-broke");
  });

  it("creates a real Git branch when the change is accepted (status -> active) (T104)", async () => {
    mockWorkItemLookup(baseWorkItem); // status: "triage"
    mockOwnerCheck(OWNER_ID);
    const updated = { ...baseWorkItem, status: "active", branch: null };
    mockDbQuery.mockResolvedValueOnce({ rows: [updated] });
    mockEnsureBranchForWorkItem.mockResolvedValueOnce({
      branch: "fix/wi-1-something-broke",
      created: true,
    });

    const res = await request(createByIdApp(OWNER_ID))
      .patch(`/work-items/${WORK_ITEM_ID}`)
      .send({ status: "active" });

    expect(res.status).toBe(200);
    expect(mockEnsureBranchForWorkItem).toHaveBeenCalledWith(WORK_ITEM_ID);
    expect(res.body.branch).toBe("fix/wi-1-something-broke");
  });

  it("does not touch branch creation for unrelated field edits", async () => {
    mockWorkItemLookup(baseWorkItem);
    mockOwnerCheck(OWNER_ID);
    const updated = { ...baseWorkItem, title: "Renamed" };
    mockDbQuery.mockResolvedValueOnce({ rows: [updated] });

    const res = await request(createByIdApp(OWNER_ID))
      .patch(`/work-items/${WORK_ITEM_ID}`)
      .send({ title: "Renamed" });

    expect(res.status).toBe(200);
    expect(mockEnsureBranchForWorkItem).not.toHaveBeenCalled();
  });

  it("never fails the request when branch creation throws", async () => {
    mockWorkItemLookup(baseWorkItem);
    mockOwnerCheck(OWNER_ID);
    const updated = { ...baseWorkItem, version_id: "v-9", branch: null };
    mockDbQuery.mockResolvedValueOnce({ rows: [updated] });
    mockEnsureBranchForWorkItem.mockRejectedValueOnce(new Error("boom"));

    const res = await request(createByIdApp(OWNER_ID))
      .patch(`/work-items/${WORK_ITEM_ID}`)
      .send({ versionId: "v-9" });

    expect(res.status).toBe(200);
  });

  it("broadcasts work_item_updated with the branch already set (branch created before broadcasting)", async () => {
    mockWorkItemLookup(baseWorkItem);
    mockOwnerCheck(OWNER_ID);
    const updated = { ...baseWorkItem, version_id: "v-9", branch: null };
    mockDbQuery.mockResolvedValueOnce({ rows: [updated] });
    mockEnsureBranchForWorkItem.mockResolvedValueOnce({
      branch: "fix/wi-1-something-broke",
      created: true,
    });

    const res = await request(createByIdApp(OWNER_ID))
      .patch(`/work-items/${WORK_ITEM_ID}`)
      .send({ versionId: "v-9" });

    expect(res.status).toBe(200);
    const updatedBroadcast = mockBroadcast.mock.calls.find(
      ([channel, event]) => channel === `work-item-${WORK_ITEM_ID}` && event === "work_item_updated"
    );
    expect(updatedBroadcast?.[2]?.branch).toBe("fix/wi-1-something-broke");
  });

  it("rejects setting branch to anything other than the computed branch or null (422)", async () => {
    mockWorkItemLookup(baseWorkItem);
    mockOwnerCheck(OWNER_ID);

    const res = await request(createByIdApp(OWNER_ID))
      .patch(`/work-items/${WORK_ITEM_ID}`)
      .send({ branch: "some/arbitrary-branch" });

    expect(res.status).toBe(422);
    expect(mockEnsureBranchForWorkItem).not.toHaveBeenCalled();
  });

  it("allows setting branch to the exact branch computed for this work item", async () => {
    mockWorkItemLookup(baseWorkItem);
    mockOwnerCheck(OWNER_ID);
    const updated = { ...baseWorkItem, branch: "fix/wi-1-something-broke" };
    mockDbQuery.mockResolvedValueOnce({ rows: [updated] });

    const res = await request(createByIdApp(OWNER_ID))
      .patch(`/work-items/${WORK_ITEM_ID}`)
      .send({ branch: "fix/wi-1-something-broke" });

    expect(res.status).toBe(200);
    expect(res.body.branch).toBe("fix/wi-1-something-broke");
  });

  it("allows clearing branch to null", async () => {
    mockWorkItemLookup({ ...baseWorkItem, branch: "fix/wi-1-something-broke" });
    mockOwnerCheck(OWNER_ID);
    const updated = { ...baseWorkItem, branch: null };
    mockDbQuery.mockResolvedValueOnce({ rows: [updated] });

    const res = await request(createByIdApp(OWNER_ID))
      .patch(`/work-items/${WORK_ITEM_ID}`)
      .send({ branch: null });

    expect(res.status).toBe(200);
    expect(res.body.branch).toBeNull();
  });

  it("validates branch against the *new* title when both are patched together", async () => {
    mockWorkItemLookup(baseWorkItem);
    mockOwnerCheck(OWNER_ID);

    // Still keyed off the old title's computed branch — must be rejected
    // since the title is changing in the same request.
    const res = await request(createByIdApp(OWNER_ID))
      .patch(`/work-items/${WORK_ITEM_ID}`)
      .send({ title: "A brand new title", branch: "fix/wi-1-something-broke" });

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
      `/work-items/${WORK_ITEM_ID}/steps/define/complete?token=22222222-0000-0000-0000-000000000001`
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
      .post(`/work-items/${WORK_ITEM_ID}/requirement-changes?token=22222222-0000-0000-0000-000000000001`)
      .send({ kind: "new", title: "x" });

    expect(res.status).toBe(403);
  });
});
