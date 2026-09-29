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
  // US6 Onboarding wizard (T150, WP-O1) -- a `github_app` integration
  // connection scoped to owner "e2e-goa" (the same namespace US5's seeded
  // repositories use) for assuranceTeamId's organization, so NO-02's
  // `PUT .../repositories` scope check (services/onboarding/
  // repositoryScope.ts) passes for an "e2e-goa/..." full_name without ever
  // calling the real GitHub API (that check is DB-only) -- see
  // us6.onboarding.spec.ts for why the live import list itself isn't
  // exercised here (no real GitHub App installation in the e2e stack).
  // Renumbered from ...901 at merge: WP-A6 and WP-V1 also used 901.
  onboardingGitHubConnectionId: "00000000-0000-4000-8000-000000000904",
  onboardingAllowedOwner: "e2e-goa",
  onboardingOutOfScopeFullName: "e2e-unauthorized-org/some-repo",
  // NV-06 version scoping (T113, WP-V4): two requirement deltas recorded
  // against workItemScheduledId (scheduled into versionNextId), shown above
  // the phase tool on /p/:versionsProjectId/v/<versionNextId>/...
  reqChangeNewId: "00000000-0000-4000-8000-000000000940",
  reqChangeChangedId: "00000000-0000-4000-8000-000000000941",

  // US4 Release tool (T112, WP-V3, NV-05): block 930..93f. Two isolated
  // projects so no release spec touches the shared versions project.
  // releaseFirstProjectId: building era (stage 'building'), v1.0.0 building,
  // one shipped + one unfinished change (the unfinished one blocks the first
  // release). releaseOrderedProjectId: stage 'released', v1.0.0 released,
  // v1.0.1 hotfix (open, ranks first) and v1.1.0 next (blocked by the hotfix,
  // has one shipped and one unfinished change that carries over).
  releaseFirstProjectId: "00000000-0000-4000-8000-000000000930",
  releaseFirstVersionId: "00000000-0000-4000-8000-000000000931",
  releaseFirstShippedItemId: "00000000-0000-4000-8000-000000000932",
  releaseFirstActiveItemId: "00000000-0000-4000-8000-000000000933",
  releaseOrderedProjectId: "00000000-0000-4000-8000-000000000934",
  releaseOrderedReleasedVersionId: "00000000-0000-4000-8000-000000000935",
  releaseOrderedHotfixVersionId: "00000000-0000-4000-8000-000000000936",
  releaseOrderedNextVersionId: "00000000-0000-4000-8000-000000000937",
  releaseOrderedNextShippedItemId: "00000000-0000-4000-8000-000000000938",
  releaseOrderedNextActiveItemId: "00000000-0000-4000-8000-000000000939",
  releaseOrderedHotfixShippedItemId: "00000000-0000-4000-8000-00000000093a",

  // US4 Change page (T111, WP-V2, NV-03/NV-04) -- own project, ids ...920-...92f.
  changeProjectId: "00000000-0000-4000-8000-000000000920",
  changeVersionReleasedId: "00000000-0000-4000-8000-000000000921", // v2.0.0, current
  changeVersionNextId: "00000000-0000-4000-8000-000000000922", // v2.1.0
  changeVersionHotfixId: "00000000-0000-4000-8000-000000000923", // v2.0.1
  changeBugId: "00000000-0000-4000-8000-000000000924", // WI-920: Define, design skipped, bug report, one delta
  changeEnhancementId: "00000000-0000-4000-8000-000000000925", // WI-921: Design, affects the two nodes below
  changeNodeApiId: "00000000-0000-4000-8000-000000000926", // "Checkout API"
  changeNodeDbId: "00000000-0000-4000-8000-000000000927", // "Orders database"
  changeNodeOtherId: "00000000-0000-4000-8000-000000000928", // "Marketing site" (not affected)
  changeShipItemId: "00000000-0000-4000-8000-00000000092b", // WI-923: on Ship, with a preview
  changeLockedItemId: "00000000-0000-4000-8000-00000000092c", // WI-922: shipped in released v2.0.0

  // US6 onboarding steps 3-5 (T152, WP-O2, NO-03/04/05) -- ids ...990-...99f. Runs on
  // assuranceTeamId in fixed states (see seed.sql), read-only in the tests.
  onboardingReadyRunId: "00000000-0000-4000-8000-000000000990",
  onboardingReadyRepoId: "00000000-0000-4000-8000-000000000991", // e2e-goa/onboard-ready, one generated file
  onboardingReadyBrokenRepoId: "00000000-0000-4000-8000-000000000992", // e2e-goa/onboard-broken, sandbox error
  onboardingRunningRunId: "00000000-0000-4000-8000-000000000993",
  onboardingRunningRepoId: "00000000-0000-4000-8000-000000000994",
  onboardingFailedRunId: "00000000-0000-4000-8000-000000000995",
  onboardingFailedRepoId: "00000000-0000-4000-8000-000000000996",
  onboardingPrsOpenRunId: "00000000-0000-4000-8000-000000000997", // linked to Permits API (811), PR #42 open
  onboardingPrsOpenRepoId: "00000000-0000-4000-8000-000000000998",
} as const;
