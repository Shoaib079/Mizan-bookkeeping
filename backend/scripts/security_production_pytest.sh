#!/usr/bin/env bash
# Pre-launch guard tests under production-like auth/CORS env (Slice 12.5).
#
# Launch settings (auth enforcement, Clerk live keys, CORS) are exercised with
# production-like values. Database access stays on the pytest test DB:
#   APP_ENV=test  → conftest provisions mizan_test via Alembic (not production DB).
#
# Provisions its own venv (CI has no pre-existing backend/.venv).
# Requires: Postgres up, DATABASE_ADMIN_URL if non-default.
set -euo pipefail

BACKEND="$(cd "$(dirname "$0")/.." && pwd)"
VENV="${PROD_PYTEST_VENV:-$BACKEND/.venv-prod-pytest}"

cleanup() {
  if [[ "${KEEP_PROD_PYTEST_VENV:-}" != "1" ]]; then
    rm -rf "$VENV"
  fi
}
trap cleanup EXIT

echo "==> Production guard pytest venv at $VENV"
python3 -m venv "$VENV"
"$VENV/bin/pip" install -q -U pip setuptools wheel
"$VENV/bin/pip" install -q -e "$BACKEND[dev]"

cd "$BACKEND"

export APP_ENV=test
export AUTH_ENFORCEMENT=true
export CLERK_TEST_MODE=false
export CORS_ORIGINS=https://app.example.com
export CLERK_JWKS_URL=https://example.clerk.accounts.dev/.well-known/jwks.json
export CLERK_ISSUER=https://example.clerk.accounts.dev
export CLERK_AUDIENCE=pk_live_production_pytest_placeholder
export CLERK_SECRET_KEY=sk_live_production_pytest_placeholder
export CLERK_PUBLISHABLE_KEY=pk_live_production_pytest_placeholder
# DB URLs: use backend/.env or config.py defaults (mizan:mizan_dev locally; CI sets postgres superuser).

echo "==> Production-like guard pytest (test DB via APP_ENV=test)"
"$VENV/bin/pytest" -q tests/test_launch_settings.py tests/test_security_invariants.py

echo "==> Production guard pytest passed"
