# Follow-ups (spec 007): recorded, not implemented

Gaps found while building the new capabilities. Each needs a backend or
contract change, or a decision, so none was done in the frontend work packages.

## Backend endpoints

- [ ] `GET /teams/portfolio-summary`: organization-level aggregate. A5 (All teams) makes N+1 portfolio calls (one per team) and A4 (packs) shows adoption per team only.
- [ ] Policy row delete/reset endpoint. Undoing an inherited check writes an explicit policy row instead of removing the override.
- [ ] Exception revoke endpoint (exceptions can be created, not revoked).
- [ ] An auth/org endpoint that returns the caller's organization id. `useOrganizationId` derives it from the caller's teams, falling back to the organization row for admins with no teams.
- [ ] A per-change staged files/tests endpoint. The V2 Change page "Build" step has no data source for it.

## Backend behavior

- [ ] The backend never advances a work item's `phase_state` on schedule or accept, and never sets `design: skipped` for bugs. V2 carries a client-side fallback that should be removed once the backend does this.

## Realtime

- [ ] Log lines missed during a disconnect are not replayed (O2 onboarding run log). The wizard keeps the lines it received; a reconnect needs a replay-from-offset or a refetch of the run's log.

## Frontend, decided in P3

- `useLongTask` now fails and prunes a running task with no update for 30 minutes (`STALE_RUNNING_MS`). Tasks are not persisted, so a reload already clears the store; a persisted store would need the same TTL applied on load.
