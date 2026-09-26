/**
 * Standards Packs Routes (spec 007, epic B2 — Option B)
 *
 * GET /packs - published standards packs (pronghorn.standards.yml versions).
 */
import { Router, Request, Response } from "express";
import { Errors } from "../middleware/errorHandler";
import db from "../utils/database";

const router = Router();

/**
 * GET /packs
 * Any authenticated user may list the published standards packs (they're
 * referenced read-only from application/repository pages and the onboarding
 * wizard).
 */
router.get("/", async (req: Request, res: Response) => {
  if (!req.user?.id) throw Errors.unauthorized();

  const { rows } = await db.query(
    `SELECT version, published_at, notes, changes, workflow_ref
     FROM public.standards_packs
     ORDER BY published_at DESC`
  );

  res.json(rows);
});

export default router;
