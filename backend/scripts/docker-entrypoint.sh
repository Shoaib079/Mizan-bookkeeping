#!/bin/sh
# Railway/Render volumes mount at /app/data as root:root. Prepare dirs, chown, drop to app.
set -e

upload_dir="${UPLOAD_DIR:-data/uploads}"
backup_dir="${BACKUP_LOCAL_DIR:-data/backups}"

mkdir -p "$upload_dir" "$backup_dir"

if [ -d /app/data ]; then
    chown -R app:app /app/data
fi

if [ "$#" -eq 0 ]; then
    set -- uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}"
fi

exec gosu app "$@"
