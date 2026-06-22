# Mizan restore runbook

Short operator guide for database + upload recovery from automated backups (Phase 8).

## What a backup contains

Each artifact is `mizan-backup-<UTC-timestamp>.tar.gz` with:

- `database.dump` — PostgreSQL custom format (`pg_dump -Fc`)
- `uploads/` — copy of the app upload tree (`data/uploads` by default)
- `manifest.json` — timestamp, git tag, row counts, SHA256 content checksum

Artifacts are stored locally (`BACKUP_LOCAL_DIR`) or in an S3-compatible bucket (`BACKUP_S3_*`) with SSE (`AES256`).

## Prerequisites

- PostgreSQL client tools: `pg_dump`, `pg_restore`, `psql`
- Access to target Postgres (admin URL to create databases)
- Latest backup artifact (local path or downloaded from bucket)
- Maintenance window — restoring over production replaces all DB data

## 1. Stop writers

Stop the API, Celery worker, and any scripts that write to the database.

```bash
# example — adjust for your process manager
docker compose stop celery-worker celery-beat
# stop uvicorn / gunicorn
```

## 2. Extract the artifact

```bash
mkdir -p /tmp/mizan-restore && cd /tmp/mizan-restore
tar -xzf /path/to/mizan-backup-YYYYMMDDTHHMMSSZ.tar.gz
cat manifest.json
```

Verify manifest checksum matches extracted content (the verify CLI does this automatically).

## 3. Restore PostgreSQL

**Option A — replace existing database (production cutover)**

```bash
export ADMIN_URL='postgresql://postgres@host:5432/postgres'
export TARGET_DB=mizan

psql "$ADMIN_URL" -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$TARGET_DB' AND pid <> pg_backend_pid();"
psql "$ADMIN_URL" -c "DROP DATABASE IF EXISTS \"$TARGET_DB\";"
psql "$ADMIN_URL" -c "CREATE DATABASE \"$TARGET_DB\" OWNER mizan;"
pg_restore --no-owner --no-acl --dbname="postgresql://mizan:PASSWORD@host:5432/$TARGET_DB" database.dump
```

**Option B — restore to scratch first (recommended sanity check)**

```bash
python -m app.features.backups.cli verify
```

This restores the latest stored backup into a throwaway DB and runs ledger integrity checks.

## 4. Restore uploads

```bash
rsync -a uploads/ /path/to/app/data/uploads/
# or set UPLOAD_DIR to the extracted uploads path temporarily
```

Ensure invoice `stored_path` and bank statement `storage_path` values resolve under the upload root.

## 5. Run migrations (if restoring older dump onto newer code)

```bash
cd backend && alembic upgrade head
```

Only if the running app version is newer than the backup git tag in `manifest.json`.

## 6. Smoke test

```bash
cd backend
pytest tests/test_financial_statements.py -q
python -m app.features.backups.cli verify
```

Confirm entities load, reports balance, and a sample invoice upload path opens.

## 7. Start services

```bash
docker compose up -d db redis
docker compose --profile workers up -d celery-worker celery-beat
# start API
```

## Scheduled backups

- **Schedule:** Celery Beat daily at `BACKUP_SCHEDULE_HOUR:BACKUP_SCHEDULE_MINUTE` UTC (default 03:00)
- **Retention:** 14 daily + 8 weekly (configurable)
- **Manual run:**

```bash
cd backend
python -m app.features.backups.cli run
python -m app.features.backups.cli prune
```

## Environment variables

See `.env.example` — key vars: `DATABASE_URL`, `DATABASE_ADMIN_URL`, `BACKUP_*`, `CELERY_BROKER_URL`, `BACKUP_S3_*`.

## Escalation

If `verify` fails with `IntegrityCheckError`, do not promote the restore to production. Open the error message — it lists unbalanced journals, control-account mismatches, or missing upload files.
