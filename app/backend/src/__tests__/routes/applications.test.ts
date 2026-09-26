/**
 * Unit tests for the applications routes (spec 007, epic B2)
 */
import express from "express";
import "express-async-errors";
import request from "supertest";
import applicationsRouter from "../../routes/applications";
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
  app.use("/applications", applicationsRouter);
  app.use(errorHandler);
  return app;
}

const TEAM_ID = "team-1";
const ORG_ID = "org-1";
const APP_ID = "app-1";
const MEMBER_USER_ID = "user-member";
const MEMBER_PROFILE_ID = "profile-member";
const OUTSIDER_USER_ID = "user-outsider";
const ADMIN_USER_ID = "user-admin";

const APPLICATION_ROW = {
  id: APP_ID,
  team_id: TEAM_ID,
  name: "Permits API",
  owner_label: "Health",
  onboarded_at: "2026-01-01T00:00:00Z",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

const REPO_ROWS = [
  { id: "repo-1", provider: "github", full_name: "goa/permits-api", pinned_pack: "2026.3", last_report_at: "2026-09-20T00:00:00Z" },
  { id: "repo-2", provider: "github", full_name: "goa/permits-worker", pinned_pack: "2026.2", last_report_at: "2026-09-20T00:00:00Z" },
];

function profileIdFor(userId: string): string | undefined {
  if (userId === MEMBER_USER_ID) return MEMBER_PROFILE_ID;
  return undefined;
}

function isAdminUser(userId: string): boolean {
  return userId === ADMIN_USER_ID;
}

function installFixtureDb() {
  mockDbQuery.mockImplementation(async (sql: string, params: any[] = []) => {
    if (sql.includes("SELECT team_id FROM public.applications WHERE id = $1")) {
      return { rows: params[0] === APP_ID ? [{ team_id: TEAM_ID }] : [] };
    }
    if (sql.includes("SELECT organization_id FROM public.teams WHERE id = $1")) {
      return { rows: params[0] === TEAM_ID ? [{ organization_id: ORG_ID }] : [] };
    }
    if (sql.includes("SELECT org_id FROM public.profiles")) {
      return { rows: [{ org_id: ORG_ID }] };
    }
    if (sql.includes("SELECT id FROM public.profiles WHERE user_id")) {
      const id = profileIdFor(params[0]);
      return { rows: id ? [{ id }] : [] };
    }
    if (sql.includes("FROM public.user_roles WHERE user_id")) {
      return { rows: isAdminUser(params[0]) ? [{ "?column?": 1 }] : [] };
    }
    if (sql.includes("FROM public.team_members WHERE team_id = $1 AND user_id = $2")) {
      return { rows: params[1] === MEMBER_PROFILE_ID ? [{ role: "member" }] : [] };
    }
    if (sql.includes("SELECT id, team_id, name, owner_label, onboarded_at, created_at, updated_at")) {
      return { rows: params[0] === APP_ID ? [APPLICATION_ROW] : [] };
    }
    if (sql.includes("FROM public.application_repositories\n     WHERE application_id")) {
      return { rows: REPO_ROWS };
    }
    if (sql.includes("ORDER BY published_at DESC LIMIT 1")) {
      return { rows: [{ version: "2026.3" }] };
    }
    if (sql.includes("FROM public.mesh_exceptions me")) {
      return { rows: [] };
    }
    throw new Error(`Unexpected query in test: ${sql}`);
  });
}

beforeEach(() => {
  mockDbQuery.mockReset();
  installFixtureDb();
});

describe("GET /applications/:appId — authorization matrix", () => {
  it("401s when unauthenticated", async () => {
    const res = await request(createApp()).get(`/applications/${APP_ID}`);
    expect(res.status).toBe(401);
  });

  it("404s for an unknown application", async () => {
    const res = await request(createApp(MEMBER_USER_ID)).get("/applications/does-not-exist");
    expect(res.status).toBe(404);
  });

  it("403s for a non-member of the owning team", async () => {
    const res = await request(createApp(OUTSIDER_USER_ID)).get(`/applications/${APP_ID}`);
    expect(res.status).toBe(403);
  });

  it("200s for a team member", async () => {
    const res = await request(createApp(MEMBER_USER_ID)).get(`/applications/${APP_ID}`);
    expect(res.status).toBe(200);
  });

  it("200s for an organization admin", async () => {
    const res = await request(createApp(ADMIN_USER_ID)).get(`/applications/${APP_ID}`);
    expect(res.status).toBe(200);
  });
});

describe("GET /applications/:appId — response shape and adoption", () => {
  it("computes adoption as repos on the latest pack / total repos", async () => {
    const res = await request(createApp(MEMBER_USER_ID)).get(`/applications/${APP_ID}`);
    expect(res.status).toBe(200);
    expect(res.body.repositories).toHaveLength(2);
    expect(res.body.adoption).toEqual({
      latestPackVersion: "2026.3",
      reposOnLatest: 1,
      totalRepos: 2,
      ratio: 0.5,
    });
    expect(res.body.exceptions).toEqual([]);
  });
});
