#!/usr/bin/env bash
# Post-migrate integrity check — Alembic head, RLS policies, immutability triggers.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "ERROR: DATABASE_URL is required" >&2
  exit 1
fi

echo "==> Verifying production database integrity"
PYTHONPATH=. python -c "from app.db.provisioning import verify_production_database; verify_production_database(); print('verify ok')"
