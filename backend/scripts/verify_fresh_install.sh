#!/usr/bin/env bash
# Fresh-install guard — clean venv, editable install, boot check, full pytest.
# Fails the build if dependencies, packaging, or import wiring regresses.
set -euo pipefail

if [[ -z "${DATABASE_ADMIN_URL:-}" ]]; then
  echo "ERROR: DATABASE_ADMIN_URL is not set." >&2
  echo "  This script needs a Postgres superuser URL to bootstrap the test DB." >&2
  echo "  Example (matches docker-compose / backend/.env):" >&2
  echo "    export DATABASE_ADMIN_URL='postgresql+psycopg://mizan:mizan_dev@localhost:5432/postgres'" >&2
  echo "  CI sets this in .github/workflows/ci.yml; locally export it before running." >&2
  exit 1
fi
export DATABASE_ADMIN_URL

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
BACKEND="$ROOT/backend"
VENV="${FRESH_INSTALL_VENV:-$BACKEND/.venv-fresh-verify}"

cleanup() {
  if [[ "${KEEP_FRESH_VENV:-}" != "1" ]]; then
    rm -rf "$VENV"
  fi
}
trap cleanup EXIT

echo "==> Fresh venv at $VENV"
python3 -m venv "$VENV"
"$VENV/bin/pip" install -q -U pip setuptools wheel
"$VENV/bin/pip" install -q -e "$BACKEND[dev]"

echo "==> Boot check (import app.main)"
(
  cd "$BACKEND"
  export APP_ENV=test
  export AUTH_ENFORCEMENT=false
  export CLERK_TEST_MODE=true
  "$VENV/bin/python" -c "import app.main; print('boot ok:', app.main.app.title)"
)

echo "==> Full pytest"
(
  cd "$BACKEND"
  export APP_ENV=test
  export AUTH_ENFORCEMENT=false
  export CLERK_TEST_MODE=true
  "$VENV/bin/pytest" -q
)

echo "==> Fresh-install verify passed"
