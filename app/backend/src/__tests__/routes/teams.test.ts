/**
 * Unit tests for the teams routes (spec 007, epic B2)
 */
import express from "express";
import "express-async-errors";
import request from "supertest";
import teamsRouter from "../../routes/teams";
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
  app.use("/teams", teamsRouter);
  app.use(errorHandler);
  return app;
}

// Fixture DB: describes a single organization with one team, one member
// (owner) and one non-member. auth user ids map 1:1 to profile ids here for
// simplicity except where noted.
const ORG_ID = "org-1";
const OTHER_ORG_ID = "org-2";
const TEAM_ID = "team-1";
const OWNER_USER_ID = "user-owner";
const OWNER_PROFILE_ID = "profile-owner";
const MEMBER_USER_ID = "user-member";
const MEMBER_PROFILE_ID = "profile-member";
const NON_MEMBER_USER_ID = "user-outsider";
const NON_MEMBER_PROFILE_ID = "profile-outsider";
const ADMIN_USER_ID = "user-admin";
const ADMIN_PROFILE_ID = "profile-admin";
const OTHER_ORG_ADMIN_USER_ID = "user-other-org-admin";
const OTHER_ORG_ADMIN_PROFILE_ID = "profile-other-org-admin";

function profileFor(userId: string): { id: string; org_id: string } | undefined {
  switch (userId) {
    case OWNER_USER_ID:
      return { id: OWNER_PROFILE_ID, org_id: ORG_ID };
    case MEMBER_USER_ID:
      return { id: MEMBER_PROFILE_ID, org_id: ORG_ID };
    case NON_MEMBER_USER_ID:
      return { id: NON_MEMBER_PROFILE_ID, org_id: ORG_ID };
    case ADMIN_USER_ID:
      return { id: ADMIN_PROFILE_ID, org_id: ORG_ID };
    case OTHER_ORG_ADMIN_USER_ID:
      return { id: OTHER_ORG_ADMIN_PROFILE_ID, org_id: OTHER_ORG_ID };
    default:
      return undefined;
  }
}

function isAdminUser(userId: string): boolean {
  return userId === ADMIN_USER_ID || userId === OTHER_ORG_ADMIN_USER_ID;
}

function teamRoleFor(profileId: string): "owner" | "member" | undefined {
  if (profileId === OWNER_PROFILE_ID) return "owner";
  if (profileId === MEMBER_PROFILE_ID) return "member";
  return undefined;
}

function installFixtureDb() {
  mockDbQuery.mockImplementation(async (sql: string, params: any[] = []) => {
    if (sql.includes("SELECT org_id FROM public.profiles")) {
      const p = profileFor(params[0]);
      return { rows: p ? [{ org_id: p.org_id }] : [] };
    }
    if (sql.includes("SELECT id FROM public.profiles WHERE user_id")) {
      const p = profileFor(params[0]);
      return { rows: p ? [{ id: p.id }] : [] };
    }
    if (sql.includes("FROM public.user_roles WHERE user_id")) {
      return { rows: isAdminUser(params[0]) ? [{ "?column?": 1 }] : [] };
    }
    if (sql.includes("FROM public.team_members WHERE team_id = $1 AND user_id = $2")) {
      const role = teamRoleFor(params[1]);
      return { rows: role ? [{ role }] : [] };
    }
    if (sql.includes("SELECT organization_id FROM public.teams WHERE id = $1")) {
      return { rows: params[0] === TEAM_ID ? [{ organization_id: ORG_ID }] : [] };
    }
    if (sql.includes("FROM public.team_members tm")) {
      // GET /teams/mine
      const profileId = params[0];
      const role = teamRoleFor(profileId);
      return { rows: role ? [{ id: TEAM_ID, name: "Permits Team", organization_id: ORG_ID, role }] : [] };
    }
    if (sql.includes("FROM public.teams t")) {
      // GET /teams (org admins)
      return {
        rows:
          params[0] === ORG_ID
            ? [{ id: TEAM_ID, name: "Permits Team", organization_id: ORG_ID, member_count: 2, application_count: 1 }]
            : [],
      };
    }
    if (sql.includes("WITH repo_rows AS")) {
      return {
        rows: [
          {
            applications: [
              {
                id: "app-1",
                name: "Permits API",
                owner_label: "Health",
                onboarded_at: "2026-01-01T00:00:00Z",
                repositories: [
                  { id: "repo-1", full_name: "goa/permits-api", last_report_at: null, not_reporting: true },
                ],
                repository_count: 1,
                not_reporting_count: 1,
              },
            ],
            total_applications: 1,
            total_repositories: 1,
            total_not_reporting: 1,
          },
        ],
      };
    }
    throw new Error(`Unexpected query in test: ${sql}`);
  });
}

beforeEach(() => {
  mockDbQuery.mockReset();
  installFixtureDb();
});

describe("GET /teams/mine", () => {
  it("401s when unauthenticated", async () => {
    const res = await request(createApp()).get("/teams/mine");
    expect(res.status).toBe(401);
  });

  it("returns the caller's teams with role", async () => {
    const res = await request(createApp(OWNER_USER_ID)).get("/teams/mine");
    expect(res.status).toBe(200);
    expect(res.body).toEqual([{ id: TEAM_ID, name: "Permits Team", organization_id: ORG_ID, role: "owner" }]);
  });

  it("returns an empty list for a user with no profile", async () => {
    const res = await request(createApp("ghost-user")).get("/teams/mine");
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});

describe("GET /teams (organization admins only)", () => {
  it("403s for a non-admin team member", async () => {
    const res = await request(createApp(MEMBER_USER_ID)).get("/teams");
    expect(res.status).toBe(403);
  });

  it("403s for a non-member", async () => {
    const res = await request(createApp(NON_MEMBER_USER_ID)).get("/teams");
    expect(res.status).toBe(403);
  });

  it("200s for an organization admin and lists all teams in their org", async () => {
    const res = await request(createApp(ADMIN_USER_ID)).get("/teams");
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].id).toBe(TEAM_ID);
  });
});

describe("GET /teams/:teamId/portfolio — authorization matrix", () => {
  it("404s for an unknown team", async () => {
    const res = await request(createApp(OWNER_USER_ID)).get("/teams/does-not-exist/portfolio");
    expect(res.status).toBe(404);
  });

  it("200s for the team owner", async () => {
    const res = await request(createApp(OWNER_USER_ID)).get(`/teams/${TEAM_ID}/portfolio`);
    expect(res.status).toBe(200);
  });

  it("200s for a team member", async () => {
    const res = await request(createApp(MEMBER_USER_ID)).get(`/teams/${TEAM_ID}/portfolio`);
    expect(res.status).toBe(200);
  });

  it("403s for a non-member of the team who is not an org admin", async () => {
    const res = await request(createApp(NON_MEMBER_USER_ID)).get(`/teams/${TEAM_ID}/portfolio`);
    expect(res.status).toBe(403);
  });

  it("200s for an organization admin who is not a team member", async () => {
    const res = await request(createApp(ADMIN_USER_ID)).get(`/teams/${TEAM_ID}/portfolio`);
    expect(res.status).toBe(200);
  });

  it("403s for an admin of a *different* organization", async () => {
    const res = await request(createApp(OTHER_ORG_ADMIN_USER_ID)).get(`/teams/${TEAM_ID}/portfolio`);
    expect(res.status).toBe(403);
  });

  it("returns the portfolio shape: applications with repos and totals", async () => {
    const res = await request(createApp(OWNER_USER_ID)).get(`/teams/${TEAM_ID}/portfolio`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      teamId: TEAM_ID,
      totals: { applications: 1, repositories: 1, notReporting: 1 },
    });
    expect(res.body.applications).toHaveLength(1);
    expect(res.body.applications[0].repositories[0].not_reporting).toBe(true);
  });
});
