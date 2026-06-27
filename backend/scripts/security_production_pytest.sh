#!/usr/bin/env bash
# Pre-launch guard tests under production-like auth/CORS env (Slice 12.5).
#
# Launch settings (auth enforcement, Clerk live keys, CORS) are exercised with
# production-like values. Database access stays on the pytest test DB:
#   APP_ENV=test  → conftest provisions mizan_test via Alembic (not production DB).
#
# Requires: Postgres up, backend/.venv with dev deps, DATABASE_ADMIN_URL if non-default.
set -euo pipefail

BACKEND="$(cd "$(dirname "$0")/.." && pwd)"
VENV="${BACKEND}/.venv"
if [[ ! -x "$VENV/bin/pytest" ]]; then
  echo "FAIL: $VENV/bin/pytest not found — run: cd backend && python3 -m venv .venv && pip install -e '.[dev]'" >&2
  exit 1
fi

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
