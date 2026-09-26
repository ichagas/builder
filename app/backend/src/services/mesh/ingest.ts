/**
 * Mesh run ingest: HMAC verification and the baseline ratchet (spec 007,
 * WP-BE4, T122; research D-10, D-11; contract in
 * `external/goa-standards-assurance-mesh/README.md` on `wp/BE7`).
 *
 * Kept separate from `routes/mesh.ts` so the security-sensitive signature
 * check and the ratchet math are independently unit-testable against the
 * shared `scripts/test-vectors/signature.json` vector without spinning up
 * Express.
 */
import crypto from "crypto";

export const SIGNATURE_HEADER = "X-Pronghorn-Signature";
const SIGNATURE_PREFIX = "sha256=";

/** Max accepted body size for a mesh report (bytes). Well above any real report_url-referenced report; a full report lives in blob storage, not the request body. */
export const MAX_INGEST_BODY_BYTES = 2 * 1024 * 1024; // 2 MiB

/** Reports older than this are rejected as stale/possibly replayed. */
export const MAX_REPORT_AGE_MINUTES = 15;

/**
 * Compute the expected `X-Pronghorn-Signature` header value for a raw body
 * and secret. Mirrors `scripts/lib/sign.js`'s `sign()` on the CI side.
 */
export function computeSignature(rawBody: Buffer, secret: string): string {
  const hex = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  return `${SIGNATURE_PREFIX}${hex}`;
}

/**
 * Constant-time verification of the `X-Pronghorn-Signature` header against
 * the raw request body and the repository's secret. Returns `false` for any
 * malformed input rather than throwing, so callers can treat every failure
 * mode identically (uniform 401).
 */
export function verifySignature(rawBody: Buffer, secret: string, headerValue: string | undefined): boolean {
  if (!headerValue || !headerValue.startsWith(SIGNATURE_PREFIX)) return false;
  if (!secret) return false;
  const expected = computeSignature(rawBody, secret);
  const expectedBuf = Buffer.from(expected);
  const actualBuf = Buffer.from(headerValue);
  // timingSafeEqual throws on length mismatch, so guard first. A length
  // check does leak one bit of length information, which is unavoidable and
  // not a distinguishing signal for a fixed-length hex signature.
  if (expectedBuf.length !== actualBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, actualBuf);
}

/** One finding as reported by the mesh CI (`scripts/lib/report.js`). */
export interface MeshFinding {
  agent: string;
  rule: string;
  file?: string;
  location?: string;
  severity?: string;
  message?: string;
  fingerprint: string;
}

export interface RatchetResult {
  /** Findings whose fingerprint was not already in the repository's baseline. */
  newFindings: MeshFinding[];
  /** New-finding count per agent (all four agents present, 0 when none). */
  newFindingsByAgent: Record<"green" | "yellow" | "red" | "blue", number>;
}

const KNOWN_AGENTS = ["green", "yellow", "red", "blue"] as const;

/**
 * Partition a run's findings against the repository's known baseline
 * fingerprints (research D-11: the policy acts on new findings only).
 */
export function ratchetFindings(findings: MeshFinding[], baselineFingerprints: Set<string>): RatchetResult {
  const newFindingsByAgent: Record<string, number> = { green: 0, yellow: 0, red: 0, blue: 0 };
  const newFindings: MeshFinding[] = [];

  for (const finding of findings) {
    if (baselineFingerprints.has(finding.fingerprint)) continue;
    newFindings.push(finding);
    if (KNOWN_AGENTS.includes(finding.agent as any)) {
      newFindingsByAgent[finding.agent] = (newFindingsByAgent[finding.agent] || 0) + 1;
    }
  }

  return {
    newFindings,
    newFindingsByAgent: newFindingsByAgent as RatchetResult["newFindingsByAgent"],
  };
}

/** Whether a report's `received_at` is too old to accept (stale/replay guard). */
export function isStaleReport(receivedAt: string, now: Date = new Date(), maxAgeMinutes = MAX_REPORT_AGE_MINUTES): boolean {
  const receivedAtMs = Date.parse(receivedAt);
  if (Number.isNaN(receivedAtMs)) return true;
  const ageMs = now.getTime() - receivedAtMs;
  return ageMs > maxAgeMinutes * 60 * 1000;
}
