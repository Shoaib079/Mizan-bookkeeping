#!/usr/bin/env bash
# Staging backup drill — create backup, then restore-verify (Slice 12.3).
# Owner runs on Render worker shell or any host with DATABASE_* + BACKUP_S3_* set.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ -f "$ROOT/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$ROOT/.env"
  set +a
fi

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "ERROR: DATABASE_URL is required" >&2
  exit 1
fi
if [[ -z "${DATABASE_ADMIN_URL:-}" ]]; then
  echo "ERROR: DATABASE_ADMIN_URL is required" >&2
  exit 1
fi

echo "==> Checking PostgreSQL client tools"
if ! PYTHONPATH=. python -c "from app.adapters.backup.postgres import pg_tools_available; import sys; sys.exit(0 if pg_tools_available() else 1)"; then
  echo "FAIL: pg_dump/pg_restore not in PATH" >&2
  exit 1
fi

echo "==> Creating backup artifact"
PYTHONPATH=. python -m app.features.backups.cli run

echo "==> Restore-verify latest backup"
exec "$ROOT/scripts/verify_backup_restore.sh"
