/**
 * Dev-only local sign-in (AUTH_MODE=local).
 *
 * POST /api/v1/auth/dev-login { email, name } -> { token, user }
 *
 * Mounted by routes/v1/index.ts ONLY when AUTH_MODE=local; otherwise the path
 * does not exist (404). It is a passwordless sign-in for developers without an
 * Entra app registration — never enable it outside a developer machine.
 * Additional guards (unless AUTH_LOCAL_ALLOW_REMOTE=true): loopback socket,
 * localhost Host header, allowed Origin, no proxy headers. It never signs in
 * as, or promotes, a user it did not create (409).
 */
import { Router, Request, Response } from "express";
import { v4 as uuidv4 } from "uuid";
import db from "../utils/database";
import { logger } from "../utils/logger";
import { Errors } from "../middleware/errorHandler";
import { signLocalToken, LOCAL_DEV_PROVIDER } from "../config/authMode";
import { getAllowedOrigins } from "../config/allowedOrigins";

export const LOCAL_DEV_ORG_NAME = "Local Dev";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_EMAIL = 254;
const MAX_NAME = 100;

/** Validates the body; returns normalised values or an error message. */
export function validateDevLoginBody(body: unknown): { email: string; name: string } | { error: string } {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  if (typeof b.email !== "string") return { error: "email: required" };
  if (typeof b.name !== "string") return { error: "name: required" };
  const email = b.email.trim().toLowerCase();
  const name = b.name.trim();
  if (email.length > MAX_EMAIL || !EMAIL_RE.test(email)) return { error: "email: Invalid email" };
  if (name.length < 1 || name.length > MAX_NAME) return { error: `name: must be 1-${MAX_NAME} characters` };
  return { email, name };
}

const LOOPBACK = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);
const LOCAL_HOST_HEADER = /^(localhost|127\.0\.0\.1|\[::1\])(:\d{1,5})?$/i;

/**
 * Returns a reason string when the request does not look like a direct call
 * from the developer's own machine (loopback socket, local Host header — DNS
 * rebinding — allowed Origin, no proxy headers), else null.
 */
export function remoteRequestReason(req: Request): string | null {
  if (!LOOPBACK.has(req.socket?.remoteAddress || "")) return "not a loopback connection";
  if (!LOCAL_HOST_HEADER.test(req.headers.host || "")) return "Host header is not localhost";
  const origin = req.headers.origin;
  if (origin !== undefined && !getAllowedOrigins().filter((o) => o !== "*").includes(origin)) {
    return "Origin is not in ALLOWED_ORIGINS";
  }
  if (req.headers["x-forwarded-for"] !== undefined || req.headers["forwarded"] !== undefined) {
    return "proxied request";
  }
  return null;
}

const router = Router();

router.post("/", async (req: Request, res: Response) => {
  if (process.env.AUTH_LOCAL_ALLOW_REMOTE !== "true") {
    const reason = remoteRequestReason(req);
    if (reason) throw Errors.forbidden(`dev-login only accepts direct requests from the local machine (${reason})`);
  }

  const parsed = validateDevLoginBody(req.body);
  if ("error" in parsed) throw Errors.badRequest(parsed.error);
  const { email, name } = parsed;

  const user = await db.transaction(async (client) => {
    // Serialise concurrent first logins so the org / user are created once.
    await client.query("SELECT pg_advisory_xact_lock(hashtext('pronghorn-dev-login'))");

    let org = (
      await client.query("SELECT id FROM public.organizations WHERE name = $1 ORDER BY created_at LIMIT 1", [
        LOCAL_DEV_ORG_NAME,
      ])
    ).rows[0];
    if (!org) {
      org = (
        await client.query("INSERT INTO public.organizations (id, name) VALUES ($1, $2) RETURNING id", [
          uuidv4(),
          LOCAL_DEV_ORG_NAME,
        ])
      ).rows[0];
    }

    let row = (
      await client.query(
        "SELECT id, email, role, raw_user_meta_data->>'name' AS name, raw_user_meta_data->>'provider' AS provider FROM auth.users WHERE lower(email) = $1",
        [email],
      )
    ).rows[0];
    if (row && row.provider !== LOCAL_DEV_PROVIDER) {
      // Never sign in as, or promote, a user that dev-login did not create.
      throw Errors.conflict(
        "A user with this email already exists and was not created by local dev sign-in. Use a different email.",
      );
    }
    if (!row) {
      row = (
        await client.query(
          `INSERT INTO auth.users (id, email, raw_user_meta_data, email_verified, created_at, updated_at)
           VALUES ($1, $2, $3::jsonb, true, NOW(), NOW())
           RETURNING id, email, role, raw_user_meta_data->>'name' AS name`,
          [uuidv4(), email, JSON.stringify({ name, provider: LOCAL_DEV_PROVIDER })],
        )
      ).rows[0];
    }

    // App-level admin (what Entra first sign-in self-provisions, see seedUserIfMissing).
    // Only reached for users created by dev-login (see the provider check above).
    await client.query(
      `INSERT INTO public.user_roles (user_id, role) VALUES ($1, 'admin'::public.app_role)
       ON CONFLICT (user_id, role) DO NOTHING`,
      [row.id],
    );
    // Organization membership is profiles.org_id; keep an existing org choice.
    await client.query(
      `INSERT INTO public.profiles (id, user_id, org_id, display_name, email)
       VALUES ($1, $1, $2, $3, $4)
       ON CONFLICT (user_id) DO UPDATE
         SET org_id = COALESCE(public.profiles.org_id, EXCLUDED.org_id),
             last_login = NOW()`,
      [row.id, org.id, name, email],
    );
    return { id: row.id as string, email: row.email as string, name: (row.name as string) || name, role: row.role as string };
  });

  const token = signLocalToken({ sub: user.id, email: user.email, name: user.name, role: user.role });
  logger.debug(`dev-login: user ${user.id} (@${user.email.split("@")[1]})`);
  res.json({ token, user });
});

export default router;
