#!/usr/bin/env bash
# T072 (WP-X1): automated check for the legacy-path redirects in nginx.conf.
#
# Runs the *real* nginx.conf (no interpretation, no mocking) in a throwaway
# `nginx:alpine` container with a dummy index.html mounted in place of a
# build, `nginx -t`s the config, then curls every legacy URL from
# specs/007-frontend-new/contracts/routes.md §1 (the same table
# e2e/shell/redirects.spec.ts and e2e/routes.ts exercise against the real
# router) and asserts each one comes back `301` with the exact `Location`
# the contract specifies.
#
# Usage:
#   app/frontend-new/scripts/test-nginx-redirects.sh
#
# Requires Docker. On the dev machine, this repo enforces "one Docker stack
# at a time" -- see AGENTS.md / the WP-X1 task notes for the lock script.
# This script itself does not take that lock; callers running it alongside
# other Docker-using agents must take the lock first.
#
# Exits non-zero on the first failure (after printing every check's result).

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRONTEND_NEW_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
CONTAINER_NAME="frontend-new-nginx-redirect-test-$$"
PORT="${TEST_NGINX_PORT:-18080}"
FAIL=0

TMP_HTML_DIR="$(mktemp -d)"
trap 'docker rm -f "$CONTAINER_NAME" >/dev/null 2>&1; rm -rf "$TMP_HTML_DIR"' EXIT

echo "<!doctype html><html><body>dummy SPA shell</body></html>" > "$TMP_HTML_DIR/index.html"

echo "==> nginx -t (config syntax check)"
docker run --rm \
  -v "$FRONTEND_NEW_DIR/nginx.conf:/etc/nginx/nginx.conf:ro" \
  -v "$TMP_HTML_DIR:/usr/share/nginx/html:ro" \
  nginx:alpine nginx -t
if [ $? -ne 0 ]; then
  echo "FAIL: nginx -t reported a config error"
  exit 1
fi

echo "==> starting throwaway nginx container"
docker run -d --rm \
  --name "$CONTAINER_NAME" \
  -p "$PORT:80" \
  -v "$FRONTEND_NEW_DIR/nginx.conf:/etc/nginx/nginx.conf:ro" \
  -v "$TMP_HTML_DIR:/usr/share/nginx/html:ro" \
  nginx:alpine >/dev/null

BASE="http://localhost:$PORT"

# Wait for nginx to accept connections.
for i in $(seq 1 30); do
  if curl -s -o /dev/null "$BASE/health"; then
    break
  fi
  sleep 0.5
done

# id/token fixtures -- match e2e/lib/seedIds.ts so this exercises the same
# shapes the Playwright spec does.
PROJECT_ID="00000000-0000-4000-8000-000000000101"
BUILD_BOOK_ID="00000000-0000-4000-8000-000000000601"
TOKEN="e2e-redirect-token"

# check <method> <path> <expected-status> <expected-location-or-empty>
check() {
  local path="$1" expected_status="$2" expected_location="$3"
  local resp status location

  resp="$(curl -s -D - -o /dev/null "$BASE$path")"
  status="$(printf '%s' "$resp" | head -1 | tr -d '\r' | awk '{print $2}')"
  # nginx's `return 301 /path` emits an absolute URI (scheme://host/path);
  # strip the scheme+host so callers can assert just the path+query, which
  # is what the contract (routes.md §1) and redirects.tsx specify.
  location="$(printf '%s' "$resp" | grep -i '^location:' | tr -d '\r' | sed -E 's#^[Ll]ocation: https?://[^/]+##')"

  if [ "$status" != "$expected_status" ]; then
    echo "FAIL  $path -> expected status $expected_status, got $status"
    FAIL=1
    return
  fi
  if [ -n "$expected_location" ] && [ "$location" != "$expected_location" ]; then
    echo "FAIL  $path -> expected Location '$expected_location', got '$location'"
    FAIL=1
    return
  fi
  echo "OK    $path -> $status $location"
}

echo "==> checking /health and SPA fallback still work"
check "/health" "200" ""
check "/this-route-does-not-exist-anywhere" "200" ""   # SPA fallback serves index.html

echo "==> checking top-level renames (routes.md §1)"
check "/dashboard" "301" "/projects"
check "/gallery" "301" "/library/gallery"
check "/standards" "301" "/library/standards"
check "/tech-stacks" "301" "/library/tech-stacks"
check "/build-books" "301" "/library/build-books"
check "/build-books/new" "301" "/library/build-books/new"
check "/build-books/$BUILD_BOOK_ID" "301" "/library/build-books/$BUILD_BOOK_ID"
check "/build-books/$BUILD_BOOK_ID/edit" "301" "/library/build-books/$BUILD_BOOK_ID/edit"

echo "==> checking query-string passthrough on a simple redirect"
check "/dashboard?foo=bar" "301" "/projects?foo=bar"

echo "==> checking project pages (plain, routes.md §1)"
check "/project/$PROJECT_ID/settings" "301" "/p/$PROJECT_ID/settings"
check "/project/$PROJECT_ID/requirements" "301" "/p/$PROJECT_ID/v/current/define/requirements"
check "/project/$PROJECT_ID/standards" "301" "/p/$PROJECT_ID/v/current/define/standards"
check "/project/$PROJECT_ID/artifacts" "301" "/p/$PROJECT_ID/v/current/define/artifacts"
check "/project/$PROJECT_ID/chat" "301" "/p/$PROJECT_ID/v/current/define/chat"
check "/project/$PROJECT_ID/canvas" "301" "/p/$PROJECT_ID/v/current/design/canvas"
check "/project/$PROJECT_ID/specifications" "301" "/p/$PROJECT_ID/v/current/design/specifications"
check "/project/$PROJECT_ID/build" "301" "/p/$PROJECT_ID/v/current/build/agent"
check "/project/$PROJECT_ID/repository" "301" "/p/$PROJECT_ID/v/current/build/repository"
check "/project/$PROJECT_ID/database" "301" "/p/$PROJECT_ID/v/current/build/database"
check "/project/$PROJECT_ID/deploy" "301" "/p/$PROJECT_ID/v/current/ship/environments"
check "/project/$PROJECT_ID/audit" "301" "/p/$PROJECT_ID/v/current/ship/audit"
check "/project/$PROJECT_ID/present" "301" "/p/$PROJECT_ID/v/current/ship/present"

echo "==> checking project pages with /t/:token (share links, routes.md §1)"
check "/project/$PROJECT_ID/settings/t/$TOKEN" "301" "/p/$PROJECT_ID/settings?t=$TOKEN"
check "/project/$PROJECT_ID/requirements/t/$TOKEN" "301" "/p/$PROJECT_ID/v/current/define/requirements?t=$TOKEN"
check "/project/$PROJECT_ID/standards/t/$TOKEN" "301" "/p/$PROJECT_ID/v/current/define/standards?t=$TOKEN"
check "/project/$PROJECT_ID/artifacts/t/$TOKEN" "301" "/p/$PROJECT_ID/v/current/define/artifacts?t=$TOKEN"
check "/project/$PROJECT_ID/chat/t/$TOKEN" "301" "/p/$PROJECT_ID/v/current/define/chat?t=$TOKEN"
check "/project/$PROJECT_ID/canvas/t/$TOKEN" "301" "/p/$PROJECT_ID/v/current/design/canvas?t=$TOKEN"
check "/project/$PROJECT_ID/specifications/t/$TOKEN" "301" "/p/$PROJECT_ID/v/current/design/specifications?t=$TOKEN"
check "/project/$PROJECT_ID/build/t/$TOKEN" "301" "/p/$PROJECT_ID/v/current/build/agent?t=$TOKEN"
check "/project/$PROJECT_ID/repository/t/$TOKEN" "301" "/p/$PROJECT_ID/v/current/build/repository?t=$TOKEN"
check "/project/$PROJECT_ID/database/t/$TOKEN" "301" "/p/$PROJECT_ID/v/current/build/database?t=$TOKEN"
check "/project/$PROJECT_ID/deploy/t/$TOKEN" "301" "/p/$PROJECT_ID/v/current/ship/environments?t=$TOKEN"
check "/project/$PROJECT_ID/audit/t/$TOKEN" "301" "/p/$PROJECT_ID/v/current/ship/audit?t=$TOKEN"
check "/project/$PROJECT_ID/present/t/$TOKEN" "301" "/p/$PROJECT_ID/v/current/ship/present?t=$TOKEN"

echo "==> checking paths that must NOT redirect (identical in both apps)"
check "/auth" "200" ""
check "/auth/callback" "200" ""
check "/github/callback" "200" ""
check "/terms" "200" ""
check "/privacy" "200" ""
check "/license" "200" ""
check "/settings/profile" "200" ""
check "/settings/organization" "200" ""
# "/" is intentionally left to the SPA (client-side auth check) -- see the
# comment above the LEGACY-PATH REWRITES block in nginx.conf.
check "/" "200" ""

echo "==> checking legacy .auth/* -> /auth still works (pre-existing rule)"
check "/.auth/login/aad" "302" "/auth"

if [ "$FAIL" -ne 0 ]; then
  echo
  echo "One or more redirect checks FAILED."
  exit 1
fi

echo
echo "All redirect checks passed."
