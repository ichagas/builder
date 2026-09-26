/**
 * Unit tests for the onboarding routes (spec 007, WP-BE5).
 *
 * The service layer is mocked here — its behavior (state machine, confirm
 * gate, authorization) is covered by
 * `__tests__/services/onboarding/index.test.ts`. These tests check that the
 * routes wire requests/responses correctly and that auth is enforced.
 */
import express from "express";
import "express-async-errors";
import request from "supertest";
import onboardingRouter from "../../routes/onboarding";
import { errorHandler } from "../../middleware/errorHandler";

jest.mock("../../utils/logger", () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

jest.mock("../../services/onboarding", () => ({
  startDraftRun: jest.fn(),
  getRun: jest.fn(),
  listImportableGitHubRepositories: jest.fn(),
  setRunRepositories: jest.fn(),
  startRun: jest.fn(),
  getRunOutput: jest.fn(),
  openPullRequests: jest.fn(),
  cancelRun: jest.fn(),
}));

import * as onboarding from "../../services/onboarding";
import { Errors } from "../../middleware/errorHandler";

const mocked = onboarding as jest.Mocked<typeof onboarding>;

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
  app.use("/onboarding", onboardingRouter);
  app.use(errorHandler);
  return app;
}

const USER_ID = "user-1";

beforeEach(() => jest.clearAllMocks());

describe("POST /onboarding/runs", () => {
  it("401s without an authenticated user", async () => {
    const res = await request(createApp()).post("/onboarding/runs").send({ teamId: "t1", applicationName: "App" });
    expect(res.status).toBe(401);
    expect(mocked.startDraftRun).not.toHaveBeenCalled();
  });

  it("creates a run and returns 201", async () => {
    mocked.startDraftRun.mockResolvedValue({ id: "run-1", status: "draft" } as any);

    const res = await request(createApp(USER_ID))
      .post("/onboarding/runs")
      .send({ teamId: "t1", applicationName: "App" });

    expect(res.status).toBe(201);
    expect(res.body).toEqual({ id: "run-1", status: "draft" });
    expect(mocked.startDraftRun).toHaveBeenCalledWith(USER_ID, { teamId: "t1", applicationName: "App", connectionId: undefined });
  });

  it("propagates a 422 from the service (validation)", async () => {
    mocked.startDraftRun.mockRejectedValue(Errors.validation({ applicationName: "required" }));

    const res = await request(createApp(USER_ID)).post("/onboarding/runs").send({ teamId: "t1" });
    expect(res.status).toBe(422);
  });
});

describe("GET /onboarding/runs/:id", () => {
  it("propagates 404 from the service", async () => {
    mocked.getRun.mockRejectedValue(Errors.notFound("Onboarding run"));
    const res = await request(createApp(USER_ID)).get("/onboarding/runs/missing");
    expect(res.status).toBe(404);
  });

  it("propagates 403 from the service", async () => {
    mocked.getRun.mockRejectedValue(Errors.forbidden("Not a member of this team"));
    const res = await request(createApp(USER_ID)).get("/onboarding/runs/run-1");
    expect(res.status).toBe(403);
  });

  it("returns the run for an authorized caller", async () => {
    mocked.getRun.mockResolvedValue({ id: "run-1", status: "draft", repositories: [] } as any);
    const res = await request(createApp(USER_ID)).get("/onboarding/runs/run-1");
    expect(res.status).toBe(200);
    expect(res.body.id).toBe("run-1");
  });
});

describe("GET /onboarding/github/repos", () => {
  it("401s without auth", async () => {
    const res = await request(createApp()).get("/onboarding/github/repos");
    expect(res.status).toBe(401);
  });

  it("passes org and q query params through", async () => {
    mocked.listImportableGitHubRepositories.mockResolvedValue([{ fullName: "goa/permits-api" }] as any);

    const res = await request(createApp(USER_ID)).get("/onboarding/github/repos?org=goa&q=permits");

    expect(res.status).toBe(200);
    expect(res.body.repositories).toHaveLength(1);
    expect(mocked.listImportableGitHubRepositories).toHaveBeenCalledWith(USER_ID, { org: "goa", query: "permits" });
  });
});

describe("PUT /onboarding/runs/:id/repositories", () => {
  it("rejects a non-array repositories body before reaching the service", async () => {
    const res = await request(createApp(USER_ID)).put("/onboarding/runs/run-1/repositories").send({ repositories: "nope" });
    expect(res.status).toBe(422);
    expect(mocked.setRunRepositories).not.toHaveBeenCalled();
  });

  it("409s when the service rejects the transition", async () => {
    mocked.setRunRepositories.mockRejectedValue(Errors.conflict("not draft"));
    const res = await request(createApp(USER_ID))
      .put("/onboarding/runs/run-1/repositories")
      .send({ repositories: [{ fullName: "goa/permits-api" }] });
    expect(res.status).toBe(409);
  });

  it("updates the selection", async () => {
    mocked.setRunRepositories.mockResolvedValue({ id: "run-1", step: "connect" } as any);
    const res = await request(createApp(USER_ID))
      .put("/onboarding/runs/run-1/repositories")
      .send({ repositories: [{ fullName: "goa/permits-api" }] });
    expect(res.status).toBe(200);
    expect(res.body.step).toBe("connect");
  });
});

describe("POST /onboarding/runs/:id/start", () => {
  it("409s on an invalid transition", async () => {
    mocked.startRun.mockRejectedValue(Errors.conflict("not draft"));
    const res = await request(createApp(USER_ID)).post("/onboarding/runs/run-1/start");
    expect(res.status).toBe(409);
  });

  it("starts the run", async () => {
    mocked.startRun.mockResolvedValue({ id: "run-1", status: "running" } as any);
    const res = await request(createApp(USER_ID)).post("/onboarding/runs/run-1/start");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("running");
  });
});

describe("GET /onboarding/runs/:id/output", () => {
  it("409s when output isn't ready yet", async () => {
    mocked.getRunOutput.mockRejectedValue(Errors.conflict("not ready"));
    const res = await request(createApp(USER_ID)).get("/onboarding/runs/run-1/output");
    expect(res.status).toBe(409);
  });

  it("returns output", async () => {
    mocked.getRunOutput.mockResolvedValue({ id: "run-1", status: "ready", repositories: [] } as any);
    const res = await request(createApp(USER_ID)).get("/onboarding/runs/run-1/output");
    expect(res.status).toBe(200);
  });
});

describe("POST /onboarding/runs/:id/pull-requests", () => {
  it("passes confirm through to the service and lets it enforce the gate (422 without confirm)", async () => {
    mocked.openPullRequests.mockRejectedValue(Errors.validation({ confirm: "must be true" }));
    const res = await request(createApp(USER_ID)).post("/onboarding/runs/run-1/pull-requests").send({});
    expect(res.status).toBe(422);
    expect(mocked.openPullRequests).toHaveBeenCalledWith(USER_ID, "run-1", { confirm: undefined });
  });

  it("409s when the run isn't ready", async () => {
    mocked.openPullRequests.mockRejectedValue(Errors.conflict("not ready"));
    const res = await request(createApp(USER_ID)).post("/onboarding/runs/run-1/pull-requests").send({ confirm: true });
    expect(res.status).toBe(409);
  });

  it("opens pull requests once confirmed", async () => {
    mocked.openPullRequests.mockResolvedValue({ id: "run-1", status: "prs_open" } as any);
    const res = await request(createApp(USER_ID)).post("/onboarding/runs/run-1/pull-requests").send({ confirm: true });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("prs_open");
    expect(mocked.openPullRequests).toHaveBeenCalledWith(USER_ID, "run-1", { confirm: true });
  });
});

describe("POST /onboarding/runs/:id/cancel", () => {
  it("409s when the run is already terminal", async () => {
    mocked.cancelRun.mockRejectedValue(Errors.conflict("already completed"));
    const res = await request(createApp(USER_ID)).post("/onboarding/runs/run-1/cancel");
    expect(res.status).toBe(409);
  });

  it("cancels the run", async () => {
    mocked.cancelRun.mockResolvedValue({ id: "run-1", status: "cancelled" } as any);
    const res = await request(createApp(USER_ID)).post("/onboarding/runs/run-1/cancel");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("cancelled");
  });
});
