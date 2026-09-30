/**
 * Thin server-side (Node, not browser) API helper for seeding/reading data
 * directly through the API using a mock bearer token — faster and more
 * reliable than driving the same setup through the UI, and independent of
 * the app under test.
 *
 * Uses the same signMockIdToken() as the browser cache seed (msalCache.ts)
 * so the backend's authMiddleware local-JWT fallback accepts it (see
 * app/backend/src/middleware/auth.ts).
 */
import { config } from "./config.js";
import { signMockIdToken, type MockAuthUser } from "./msalCache.js";
import { seed } from "./seedIds.js";

const API_BASE = config.apiBaseUrl;

export function tokenFor(user: MockAuthUser): string {
  return signMockIdToken(user, config.msal);
}

async function request<T>(
  method: string,
  path: string,
  user: MockAuthUser,
  body?: unknown
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${tokenFor(user)}`,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`${method} ${path} -> ${res.status} ${res.statusText}: ${text}`);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  get: <T>(path: string, user: MockAuthUser) => request<T>("GET", path, user),
  post: <T>(path: string, user: MockAuthUser, body?: unknown) => request<T>("POST", path, user, body),
  put: <T>(path: string, user: MockAuthUser, body?: unknown) => request<T>("PUT", path, user, body),
  patch: <T>(path: string, user: MockAuthUser, body?: unknown) => request<T>("PATCH", path, user, body),
  delete: <T>(path: string, user: MockAuthUser) => request<T>("DELETE", path, user),

  /** Creates a project owned by `user` and returns its id. Used to keep tests independent of the shared seed project. */
  async createProject(user: MockAuthUser, name: string): Promise<{ id: string; name: string }> {
    // org_id is NOT NULL on projects (infra/migrations/001_full_schema.sql)
    // and the route doesn't default it -- reuse the seeded E2E org.
    return request("POST", "/api/v1/projects", user, {
      name,
      description: `Created by e2e (${name})`,
      org_id: seed.orgId,
    });
  },
};

/** A short, unique-per-run suffix so tests that create their own records never collide. */
export function unique(label: string): string {
  return `${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
