#!/usr/bin/env bash
# WP-F6 (T016): bring the E2E stack (Postgres x2 + API) up or down.
#
# Every port and the compose project name are configurable so several agents
# can run this in parallel without colliding. Defaults match the ports this
# agent (WP-F6) used for its own runs.
#
# Usage:
#   e2e/scripts/stack.sh up
#   e2e/scripts/stack.sh down
#
# Env vars (all optional):
#   COMPOSE_PROJECT_NAME   default: pronghorn-e2e
#   DB_PORT                default: 55432
#   GENAPPS_DB_PORT        default: 55433
#   API_PORT               default: 3140
#   E2E_ENTRA_TENANT_ID / E2E_ENTRA_CLIENT_ID / E2E_JWT_SECRET
#                          must match e2e/lib/config.ts and serve-app.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
E2E_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
REPO_ROOT="$(cd "$E2E_DIR/.." && pwd)"

export COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-pronghorn-e2e}"
export POSTGRES_PORT="${DB_PORT:-55432}"
export POSTGRES_GENAPPS_PORT="${GENAPPS_DB_PORT:-55433}"
API_PORT="${API_PORT:-3140}"
RUN_DIR="$E2E_DIR/.run/$COMPOSE_PROJECT_NAME"
PID_FILE="$RUN_DIR/api.pid"
LOG_FILE="$RUN_DIR/api.log"

COMPOSE=(docker compose -f "$E2E_DIR/docker-compose.e2e.yml" -p "$COMPOSE_PROJECT_NAME" --profile e2e)

cmd="${1:-}"

up() {
  mkdir -p "$RUN_DIR"

  # Stage migrations + seed.sql into one directory (see docker-compose.e2e.yml
  # for why this can't just be two bind mounts into the same path).
  export E2E_INITDB_DIR="$RUN_DIR/initdb"
  rm -rf "$E2E_INITDB_DIR"
  mkdir -p "$E2E_INITDB_DIR"
  cp "$REPO_ROOT"/infra/migrations/*.sql "$E2E_INITDB_DIR"/
  cp "$E2E_DIR/seed.sql" "$E2E_INITDB_DIR"/zz-seed.sql # "zz" sorts after NNN_*.sql

  echo "[stack] starting Postgres (project=$COMPOSE_PROJECT_NAME, db=$POSTGRES_PORT, genapps=$POSTGRES_GENAPPS_PORT)"
  "${COMPOSE[@]}" up -d

  echo "[stack] waiting for db to be healthy..."
  until "${COMPOSE[@]}" ps db --format json 2>/dev/null | grep -q '"Health":"healthy"'; do
    sleep 1
  done

  if [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
    echo "[stack] API already running on PID $(cat "$PID_FILE")"
  else
    echo "[stack] starting API on port $API_PORT (log: $LOG_FILE)"
    (
      cd "$REPO_ROOT/app/backend"
      export NODE_ENV="test"
      export PORT="$API_PORT"
      export POSTGRES_HOST="localhost"
      export POSTGRES_PORT="$POSTGRES_PORT"
      export POSTGRES_USER="${POSTGRES_USER:-pronghorn_admin}"
      export POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-localdev123}"
      export POSTGRES_DATABASE="${POSTGRES_DB:-pronghorn}"
      export POSTGRES_GENAPPS_HOST="localhost"
      export POSTGRES_GENAPPS_PORT="$POSTGRES_GENAPPS_PORT"
      export POSTGRES_GENAPPS_USER="${POSTGRES_GENAPPS_USER:-pronghorn_genapps_admin}"
      export POSTGRES_GENAPPS_PASSWORD="${POSTGRES_GENAPPS_PASSWORD:-localdev123}"
      # Fake Entra values: never validated against real Azure AD in e2e. The
      # backend's authMiddleware falls back to a JWT_SECRET-signed local JWT
      # whenever Azure AD/JWKS validation fails (see
      # app/backend/src/middleware/auth.ts) -- that's the path our mock
      # bearer tokens (e2e/lib/msalCache.ts) are designed to take.
      export ENTRA_TENANT_ID="${E2E_ENTRA_TENANT_ID:-00000000-e2e-4000-8000-tenantid0001}"
      export ENTRA_CLIENT_ID="${E2E_ENTRA_CLIENT_ID:-00000000-e2e-4000-8000-clientid0001}"
      export JWT_SECRET="${E2E_JWT_SECRET:-e2e-local-jwt-secret-do-not-use-in-prod}"
      # The served app's origin isn't in the API's hardcoded CORS allowlist
      # (index.ts) by default -- ALLOWED_ORIGINS overrides it. Covers the
      # handful of FE ports agents are likely to pick (8140-8149).
      export ALLOWED_ORIGINS="${ALLOWED_ORIGINS:-http://localhost:8140,http://localhost:8141,http://localhost:8142,http://localhost:8143,http://localhost:8144,http://localhost:8145,http://localhost:8146,http://localhost:8147,http://localhost:8148,http://localhost:8149}"
      export GITHUB_ORG="${GITHUB_ORG:-e2e-not-configured}"
      # repoBlobStore.ts (repo staging blob storage) requires this to be set
      # to construct its BlobServiceClient at boot, but doesn't touch the
      # network until a blob operation actually runs -- so a fake value lets
      # the API start offline. Real blob operations (repo staging content)
      # will fail when exercised; that's expected and noted as a coverage
      # gap (PR-11) in e2e/README.md.
      export AZURE_STORAGE_ACCOUNT_NAME="${AZURE_STORAGE_ACCOUNT_NAME:-e2eoffline}"
      export STORAGE_BASE_PATH="$RUN_DIR/storage"
      mkdir -p "$STORAGE_BASE_PATH"
      nohup npx ts-node src/index.ts > "$LOG_FILE" 2>&1 &
      echo $! > "$PID_FILE"
    )
    echo "[stack] API PID $(cat "$PID_FILE"), waiting for /health..."
    for _ in $(seq 1 60); do
      if curl -fsS "http://localhost:$API_PORT/health" >/dev/null 2>&1; then
        echo "[stack] API is up on http://localhost:$API_PORT"
        break
      fi
      sleep 1
    done
  fi
}

down() {
  if [ -f "$PID_FILE" ]; then
    pid="$(cat "$PID_FILE")"
    if kill -0 "$pid" 2>/dev/null; then
      echo "[stack] stopping API PID $pid"
      kill "$pid" 2>/dev/null || true
      wait "$pid" 2>/dev/null || true
    fi
    rm -f "$PID_FILE"
  fi
  echo "[stack] stopping Postgres (project=$COMPOSE_PROJECT_NAME)"
  "${COMPOSE[@]}" down -v
}

case "$cmd" in
  up) up ;;
  down) down ;;
  *)
    echo "Usage: $0 up|down" >&2
    exit 1
    ;;
esac
