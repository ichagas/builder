/**
 * Fixed ids inserted by e2e/seed.sql. Kept in sync by hand — if you add a
 * row to seed.sql, add its id here too so specs don't hardcode UUID strings.
 */
export const seed = {
  orgId: "00000000-0000-4000-8000-000000000001",
  ownerUserId: "00000000-0000-4000-8000-0000000000a1",
  ownerEmail: "e2e-owner@pronghorn.test",
  ownerName: "E2E Owner",
  projectId: "00000000-0000-4000-8000-000000000101",
  viewerTokenId: "00000000-0000-4000-8000-000000000501",
  viewerToken: "00000000-0000-4000-8000-000000000511",
  editorTokenId: "00000000-0000-4000-8000-000000000502",
  editorToken: "00000000-0000-4000-8000-000000000512",
  requirementId: "00000000-0000-4000-8000-000000000401",
  standardCategoryId: "00000000-0000-4000-8000-000000000201",
  standardId: "00000000-0000-4000-8000-000000000202",
  techStackId: "00000000-0000-4000-8000-000000000301",
  buildBookId: "00000000-0000-4000-8000-000000000601",
  publishedProjectId: "00000000-0000-4000-8000-000000000701",
} as const;
