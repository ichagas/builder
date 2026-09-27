/**
 * Integration test for the onboarding callback route's dedicated,
 * route-scoped JSON body parser (spec 007, WP-BE6, T141, fix round 1 item
 * 6): `POST /api/v1/onboarding/runs/:id/callback` has no user session (see
 * routes/onboarding.ts / routes/v1/index.ts's mount comment), so it must
 * never reach the global 50mb express.json() before its own size limit
 * (and, downstream, its bearer-token check) — an oversized body is
 * rejected (413) at the parsing stage itself. Mirrors how BE4 already
 * tests/handles this for POST /mesh/runs.
 */
jest.mock("../utils/logger", () => ({
  logger: {
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
    http: jest.fn(),
  },
}));

jest.mock("../services/onboarding", () => ({
  handleJobCallback: jest.fn(async () => {}),
}));

import request from "supertest";
import app from "../index";
import * as onboarding from "../services/onboarding";

const mockHandleJobCallback = onboarding.handleJobCallback as jest.Mock;

describe("POST /api/v1/onboarding/runs/:id/callback body size limit", () => {
  beforeEach(() => jest.clearAllMocks());

  it("413s a body over the route's own 2mb limit, before the handler ever runs", async () => {
    const overSized = JSON.stringify({ type: "progress", event: { type: "log", message: "x".repeat(3 * 1024 * 1024) } });

    const res = await request(app)
      .post("/api/v1/onboarding/runs/run-1/callback")
      .set("Content-Type", "application/json")
      .send(overSized);

    expect(res.status).toBe(413);
    expect(mockHandleJobCallback).not.toHaveBeenCalled();
  });

  it("accepts a normally-sized body and reaches the handler", async () => {
    mockHandleJobCallback.mockResolvedValue(undefined);

    const res = await request(app)
      .post("/api/v1/onboarding/runs/run-1/callback")
      .set("Authorization", "Bearer sometoken")
      .send({ type: "progress", event: { type: "log", message: "cloning" } });

    expect(res.status).toBe(204);
    expect(mockHandleJobCallback).toHaveBeenCalledWith("run-1", "sometoken", {
      type: "progress",
      event: { type: "log", message: "cloning" },
    });
  });

  it("does not apply the tight limit to a sibling onboarding route (only :id/callback is scoped)", async () => {
    // No auth header at all -> the ordinary authMiddleware/optionalAuthMiddleware
    // path applies (requireUserId throws 401), proving this request was
    // parsed and routed normally, not intercepted by the callback's own
    // path-scoped parser.
    const res = await request(app).get("/api/v1/onboarding/runs/run-1");
    expect(res.status).toBe(401);
  });
});
