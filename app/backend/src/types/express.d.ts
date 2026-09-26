// Extend Express Request interface to include user from auth middleware
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        name?: string;
        role?: string;
      };
      /**
       * Exact bytes of the request body, captured by the global
       * `express.json()` `verify` hook in `index.ts`. Needed by
       * `routes/mesh.ts` (spec 007, WP-BE4) to verify the
       * `X-Pronghorn-Signature` HMAC over the same bytes the CI signed —
       * re-serializing `req.body` would not reproduce the signed string.
       */
      rawBody?: Buffer;
    }
  }
}

export {};
