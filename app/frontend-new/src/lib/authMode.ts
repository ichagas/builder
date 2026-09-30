/**
 * Frontend auth mode.
 *
 * "Mock" (local dev sign-in) is active only when ALL hold:
 *   - a Vite dev build (import.meta.env.DEV) — production builds always use MSAL,
 *     and the branch is dead-code eliminated from them;
 *   - VITE_AUTH_MODE=mock;
 *   - no VITE_ENTRA_CLIENT_ID is configured. The e2e harness exports
 *     VITE_AUTH_MODE=mock together with fake Entra ids and a seeded MSAL
 *     cache, so a configured client id keeps MSAL mode (unchanged).
 *
 * Read at call time (not module load) so tests can stub the env.
 */
export function isMockAuth(): boolean {
  return (
    import.meta.env.DEV === true &&
    import.meta.env.VITE_AUTH_MODE === "mock" &&
    !import.meta.env.VITE_ENTRA_CLIENT_ID
  );
}
