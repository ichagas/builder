/**
 * Central place for the env vars the harness and the served apps must agree
 * on. e2e/scripts/serve-app.sh exports the matching VITE_* values when it
 * starts vite, so these must stay in sync with that script.
 */
export const config = {
  apiBaseUrl: process.env.API_BASE_URL || `http://localhost:${process.env.API_PORT || 3140}`,
  feBaseUrl: process.env.BASE_URL || `http://localhost:${process.env.FE_PORT || 8140}`,
  msal: {
    clientId: process.env.E2E_ENTRA_CLIENT_ID || "00000000-e2e-4000-8000-clientid0001",
    tenantId: process.env.E2E_ENTRA_TENANT_ID || "00000000-e2e-4000-8000-tenantid0001",
    jwtSecret: process.env.E2E_JWT_SECRET || "e2e-local-jwt-secret-do-not-use-in-prod",
  },
} as const;
