/**
 * Frontend auth mode.
 *
 * Local dev sign-in is active only when BOTH hold:
 *   - a Vite dev build (import.meta.env.DEV) — production builds always use
 *     MSAL, and the local branch is dead-code eliminated from them;
 *   - VITE_AUTH_MODE=local, an explicit opt-in (allow-list, not a heuristic).
 *
 * Any other value ("msal", "mock", empty, ...) keeps MSAL. The e2e harness
 * exports VITE_AUTH_MODE=mock meaning "fake MSAL cache": that stays MSAL.
 *
 * Read at call time (not module load) so tests can stub the env.
 */
export function isLocalAuth(): boolean {
  return import.meta.env.DEV === true && import.meta.env.VITE_AUTH_MODE === "local";
}
