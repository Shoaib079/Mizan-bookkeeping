#!/usr/bin/env bash
# Restore local mizan from Cloudflare R2 or a downloaded backup tarball.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ -f "$ROOT/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$ROOT/.env"
  set +a
fi

if [[ ! -d "$ROOT/.venv" ]]; then
  echo "ERROR: run from backend with venv: python3 -m venv .venv && pip install -e '.[dev]'" >&2
  exit 1
fi

exec "$ROOT/.venv/bin/python" "$ROOT/scripts/restore_local_from_backup.py" "$@"
