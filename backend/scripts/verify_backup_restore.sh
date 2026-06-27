#!/usr/bin/env bash
# Restore-verify drill — latest backup → scratch DB → ledger integrity (Slice 12.3).
# Loads backend/.env when present; otherwise use exported env vars (see DEPLOY.md §11).
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
  echo "ERROR: DATABASE_ADMIN_URL is required (scratch DB create/drop)" >&2
  exit 1
fi

echo "==> Checking PostgreSQL client tools (pg_dump, pg_restore)"
if ! PYTHONPATH=. python -c "from app.adapters.backup.postgres import pg_tools_available; import sys; sys.exit(0 if pg_tools_available() else 1)"; then
  echo "FAIL: pg_dump/pg_restore not in PATH — install postgresql-client (see DEPLOY.md §11)" >&2
  exit 1
fi

echo "==> Running backup restore verify (latest artifact → scratch DB)"
if PYTHONPATH=. python -m app.features.backups.cli verify; then
  echo "PASS: backup restore verification succeeded"
  exit 0
fi

echo "FAIL: backup restore verification failed" >&2
exit 1
