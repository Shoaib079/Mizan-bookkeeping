#!/usr/bin/env bash
# Staging smoke — liveness, readiness, and CORS preflight against a deployed API.
# Usage: API_URL=https://mizan-api-staging.onrender.com FRONTEND_ORIGIN=https://staging.example.com ./scripts/smoke_staging.sh
set -euo pipefail

API_URL="${API_URL:?Set API_URL to the staging API base URL (https://...)}"
FRONTEND_ORIGIN="${FRONTEND_ORIGIN:-}"

echo "==> GET ${API_URL}/health"
health_body="$(curl -fsS "${API_URL}/health")"
echo "$health_body" | grep -q '"status":"ok"' || {
  echo "FAIL: /health did not return status ok" >&2
  exit 1
}

echo "==> GET ${API_URL}/health/ready"
ready_code="$(curl -sS -o /tmp/mizan-ready.json -w '%{http_code}' "${API_URL}/health/ready")"
ready_body="$(cat /tmp/mizan-ready.json)"
echo "$ready_body"
if [[ "$ready_code" != "200" ]]; then
  echo "FAIL: /health/ready returned HTTP $ready_code (expected 200 when DB is up)" >&2
  exit 1
fi
echo "$ready_body" | grep -q '"db":"up"' || {
  echo "FAIL: /health/ready db not up" >&2
  exit 1
}

if [[ -n "$FRONTEND_ORIGIN" ]]; then
  echo "==> CORS preflight from ${FRONTEND_ORIGIN}"
  cors_header="$(curl -sS -D - -o /dev/null -X OPTIONS "${API_URL}/health" \
    -H "Origin: ${FRONTEND_ORIGIN}" \
    -H "Access-Control-Request-Method: GET" | tr -d '\r' | awk 'tolower($0) ~ /^access-control-allow-origin:/ {print $2}')"
  if [[ "$cors_header" != "$FRONTEND_ORIGIN" ]]; then
    echo "FAIL: CORS allow-origin was '$cors_header' (expected '$FRONTEND_ORIGIN')" >&2
    exit 1
  fi
  echo "CORS ok"
fi

echo "==> Automated checks passed"
echo ""
echo "Manual Clerk sign-in checks (test keys on staging, live keys on production):"
echo "  1. Open the Netlify frontend in a private window."
echo "  2. Sign in — Clerk modal completes without error."
echo "  3. Create a restaurant — no 401/403 from the API."
echo "  4. Settings → Members loads for the owner."
echo "  5. Record one test expense or sale — save succeeds and appears in list."
echo ""
echo "Staging smoke passed"
