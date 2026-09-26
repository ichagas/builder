/**
 * Unit tests for the standards packs routes (spec 007, epic B2)
 */
import express from "express";
import "express-async-errors";
import request from "supertest";
import packsRouter from "../../routes/packs";
import { errorHandler } from "../../middleware/errorHandler";

jest.mock("../../utils/logger", () => ({
  logger: {
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
  },
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

function fakeAuth(userId?: string) {
  return (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    if (userId) {
      req.user = { id: userId, email: "test@test.com" };
    }
    next();
  };
}

function createApp(userId?: string) {
  const app = express();
  app.use(express.json());
  app.use(fakeAuth(userId));
  app.use("/packs", packsRouter);
  app.use(errorHandler);
  return app;
}

beforeEach(() => {
  mockDbQuery.mockReset();
});

describe("GET /packs", () => {
  it("401s when unauthenticated", async () => {
    const res = await request(createApp()).get("/packs");
    expect(res.status).toBe(401);
  });

  it("lists standards packs newest first", async () => {
    const packs = [
      { version: "2026.3", published_at: "2026-09-01T00:00:00Z", notes: "latest", changes: [], workflow_ref: "goa-standards/assurance-mesh@v3" },
      { version: "2026.2", published_at: "2026-06-01T00:00:00Z", notes: "prior", changes: [], workflow_ref: "goa-standards/assurance-mesh@v3" },
    ];
    mockDbQuery.mockResolvedValue({ rows: packs });

    const res = await request(createApp("user-1")).get("/packs");
    expect(res.status).toBe(200);
    expect(res.body).toEqual(packs);
  });
});
