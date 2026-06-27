#!/usr/bin/env bash
# Production schema migrate — Alembic upgrade head only (no schema drop).
# Requires DATABASE_ADMIN_URL + DATABASE_URL in the environment (see DEPLOY.md).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "ERROR: DATABASE_URL is required" >&2
  exit 1
fi
if [[ -z "${DATABASE_ADMIN_URL:-}" ]]; then
  echo "ERROR: DATABASE_ADMIN_URL is required for Alembic migrations" >&2
  exit 1
fi

echo "==> Running alembic upgrade head (schema owner via DATABASE_ADMIN_URL)"
PYTHONPATH=. python -c "from app.db.provisioning import run_production_migrations; run_production_migrations(); print('migrate ok')"
