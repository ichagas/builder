/**
 * API v1 Router
 * All versioned routes are mounted here
 */
import { Router } from "express";
import { authMiddleware, optionalAuthMiddleware } from "../../middleware/auth";
import { authRateLimiter } from "../../middleware/rateLimit";

// Route imports
import healthRouter from "../health";
import authRouter from "../auth";
import chatRouter from "../chat";
import projectsRouter from "../projects";
import artifactsRouter from "../artifacts";
import canvasRouter from "../canvas";
import databaseRouter from "../database";
import auditRouter from "../audit";
import collaborationRouter from "../collaboration";

import dbRouter from "../db";
import rpcRouter from "../rpc";
import functionsRouter from "../functions";
import storageRouter from "../storage";
import githubRouter from "../github";
import teamsRouter from "../teams";
import applicationsRouter from "../applications";
import packsRouter from "../packs";
import meshRouter from "../mesh";
import versionsRouter from "../versions";
import workItemsRouter, { workItemByIdRouter } from "../workItems";
import adminIntegrationsRouter from "../admin/integrations";
import onboardingRouter from "../onboarding";

const router = Router();

// =====================================================================// Public Routes (no auth required)
// =====================================================================
router.use("/health", healthRouter);
router.use("/auth", authRateLimiter, authRouter);

// =====================================================================// Protected Routes (auth required)
// =====================================================================
router.use("/chat", authMiddleware, chatRouter);
// versions/work-items (B1) accept BOTH user auth and `?token=` share-token
// access (authorized against `authorize_project_access`), so they use
// optionalAuthMiddleware and are mounted ahead of the authMiddleware-gated
// /projects router below to avoid its 401 short-circuit for anonymous,
// token-only requests.
router.use("/projects", optionalAuthMiddleware, versionsRouter);
router.use("/projects", optionalAuthMiddleware, workItemsRouter);
router.use("/work-items", optionalAuthMiddleware, workItemByIdRouter);
router.use("/projects", authMiddleware, projectsRouter);
router.use("/artifacts", authMiddleware, artifactsRouter);
router.use("/canvas", authMiddleware, canvasRouter);
router.use("/database", authMiddleware, databaseRouter);
router.use("/audit", authMiddleware, auditRouter);
router.use("/collaboration", authMiddleware, collaborationRouter);
router.use("/github", optionalAuthMiddleware, githubRouter);
router.use("/teams", authMiddleware, teamsRouter);
router.use("/applications", authMiddleware, applicationsRouter);
router.use("/packs", authMiddleware, packsRouter);
// Mixed auth: POST /mesh/runs authenticates via the X-Pronghorn-Signature
// HMAC (no user session), every other /mesh route requires req.user — see
// routes/mesh.ts.
router.use("/mesh", optionalAuthMiddleware, meshRouter);
router.use("/admin/integrations", authMiddleware, adminIntegrationsRouter);
// Mixed auth (WP-BE6, T141): POST /onboarding/runs/:id/callback authenticates
// via a per-run bearer token (services/onboarding/callbackAuth.ts, no user
// session — the sandbox job calls it), every other /onboarding route
// requires req.user — see routes/onboarding.ts.
router.use("/onboarding", optionalAuthMiddleware, onboardingRouter);

// - db is protected (require auth)
// - rpc and functions use optional auth (some calls allow anonymous)
// - storage uses optional auth (public files can be accessed without auth)
router.use("/db", authMiddleware, dbRouter);
router.use("/rpc", optionalAuthMiddleware, rpcRouter);
router.use("/functions", optionalAuthMiddleware, functionsRouter);
router.use("/storage", optionalAuthMiddleware, storageRouter);

export default router;
