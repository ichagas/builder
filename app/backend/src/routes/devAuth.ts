/**
 * Dev-only local sign-in (AUTH_MODE=local).
 *
 * POST /api/v1/auth/dev-login { email, name } -> { token, user }
 *
 * Mounted by routes/v1/index.ts ONLY when AUTH_MODE=local; otherwise the path
 * does not exist (404). It is a passwordless sign-in for developers without an
 * Entra app registration — never enable it outside a developer machine.
 * Additional guards: loopback-only callers unless AUTH_LOCAL_ALLOW_REMOTE=true.
 */
import { Router, Request, Response } from "express";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";
import db from "../utils/database";
import { logger } from "../utils/logger";
import { Errors } from "../middleware/errorHandler";
import { signLocalToken } from "../config/authMode";

export const LOCAL_DEV_ORG_NAME = "Local Dev";

const devLoginSchema = z.object({
  email: z.string().trim().toLowerCase().max(254).email(),
  name: z.string().trim().min(1).max(100),
});

const LOOPBACK = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);

function isLoopback(req: Request): boolean {
  return LOOPBACK.has(req.socket?.remoteAddress || "");
}

const router = Router();

router.post("/", async (req: Request, res: Response) => {
  if (process.env.AUTH_LOCAL_ALLOW_REMOTE !== "true" && !isLoopback(req)) {
    throw Errors.forbidden("dev-login only accepts requests from the local machine");
  }

  const parsed = devLoginSchema.safeParse(req.body);
  if (!parsed.success) {
    throw Errors.badRequest(parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
  }
  const { email, name } = parsed.data;

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
        "SELECT id, email, role, raw_user_meta_data->>'name' AS name FROM auth.users WHERE email = $1",
        [email],
      )
    ).rows[0];
    if (!row) {
      row = (
        await client.query(
          `INSERT INTO auth.users (id, email, raw_user_meta_data, email_verified, created_at, updated_at)
           VALUES ($1, $2, $3::jsonb, true, NOW(), NOW())
           RETURNING id, email, role, raw_user_meta_data->>'name' AS name`,
          [uuidv4(), email, JSON.stringify({ name, provider: "local-dev" })],
        )
      ).rows[0];
    }

    // App-level admin (what Entra first sign-in self-provisions, see seedUserIfMissing).
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
  logger.info(`dev-login: ${user.email}`);
  res.json({ token, user });
});

export default router;
