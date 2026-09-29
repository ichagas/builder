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
  // US5 Assurance console (T130, WP-A1) -- e2e-owner is a member (owner
  // role) of assuranceTeamId, and an organization admin (see `role` above),
  // so assuranceOtherTeamId is reachable only through GET /teams (D-8).
  assuranceTeamId: "00000000-0000-4000-8000-000000000801",
  assuranceOtherTeamId: "00000000-0000-4000-8000-000000000802",
  assuranceApp1Id: "00000000-0000-4000-8000-000000000811",
  assuranceApp2Id: "00000000-0000-4000-8000-000000000812",
  assuranceOtherTeamAppId: "00000000-0000-4000-8000-000000000813",
  // US4 Versions and changes (T110, WP-V1) -- its own project (not the
  // shared baseline `projectId`) so seeding a real version timeline and
  // triage inbox here can't shift any PR-xx regression spec that navigates
  // `projectId`'s `v/current/...` routes (those keep the D-7 "no versions
  // yet" fallback).
  versionsProjectId: "00000000-0000-4000-8000-000000000102",
  versionCurrentId: "00000000-0000-4000-8000-000000000901",
  versionNextId: "00000000-0000-4000-8000-000000000902",
  // High-severity bug -- NV-02 suggests scheduling this into a hotfix.
  workItemHotfixBugId: "00000000-0000-4000-8000-000000000911",
  // Enhancement, no severity -- NV-02 suggests scheduling this into the
  // next open (non-hotfix) version instead.
  workItemNextEnhancementId: "00000000-0000-4000-8000-000000000912",
  // Already scheduled into versionNextId (status active) -- gives the "In
  // progress" lane a non-zero change count to assert on.
  workItemScheduledId: "00000000-0000-4000-8000-000000000913",
  // Admin -> Integrations (T136, WP-A6, NA-08). memberUserId is an
  // organization member with no `user_roles` 'admin' row -- proves the page
  // (and the backend behind it) refuse anyone but an organization admin.
  memberUserId: "00000000-0000-4000-8000-0000000000a2",
  memberEmail: "e2e-member@pronghorn.test",
  memberName: "E2E Member",
  // Renumbered from ...901 at merge: WP-O1 and WP-V1 also used 901.
  azureDevOpsConnectionId: "00000000-0000-4000-8000-000000000903",
  // T131, WP-A2: application page (NA-03/NA-04) -- assuranceApp1's two
  // repositories, in different `part` groups ("api"/"worker").
  assuranceRepo1Id: "00000000-0000-4000-8000-000000000821", // e2e-goa/permits-api, part "api", on the latest pack
  assuranceRepo2Id: "00000000-0000-4000-8000-000000000822", // e2e-goa/permits-worker, part "worker", behind + not reporting
  assuranceExceptionId: "00000000-0000-4000-8000-000000000841",
} as const;
