#!/usr/bin/env bash
# WP-F6 (T016): serve app/frontend-new against the E2E stack's API, on a configurable port, with the same fake Entra
# client/tenant ids the mock-auth cache in e2e/lib/msalCache.ts signs
# tokens for (see stack.sh for the matching backend-side values).
#
# Usage:
#   e2e/scripts/serve-app.sh new 8141
#
# Env vars (all optional): API_PORT (default 3140), E2E_ENTRA_TENANT_ID,
# E2E_ENTRA_CLIENT_ID.
set -euo pipefail

APP="${1:?Usage: serve-app.sh new <port>}"
PORT="${2:?Usage: serve-app.sh new <port>}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# The legacy frontend was removed (T074); "new" is kept as the app name so
# existing callers (quickstart, orchestration scripts) keep working.
case "$APP" in
  new) APP_DIR="$REPO_ROOT/app/frontend-new" ;;
  *)
    echo "Unknown app '$APP'. Only 'new' (app/frontend-new) exists." >&2
    exit 1
    ;;
esac

export VITE_API_BASE_URL="http://localhost:${API_PORT:-3140}"
export VITE_AUTH_MODE="mock"
export VITE_ENTRA_TENANT_ID="${E2E_ENTRA_TENANT_ID:-00000000-e2e-4000-8000-tenantid0001}"
export VITE_ENTRA_CLIENT_ID="${E2E_ENTRA_CLIENT_ID:-00000000-e2e-4000-8000-clientid0001}"
export VITE_AZURE_REDIRECT_URI="http://localhost:${PORT}"

cd "$APP_DIR"
echo "[serve-app] serving $APP on http://localhost:$PORT against API $VITE_API_BASE_URL"
exec npx vite --port "$PORT" --strictPort
