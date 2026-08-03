# Mizan — local development

## Prerequisites

- Python 3.11+
- Node.js 20+
- **PostgreSQL** — prefer **Homebrew** on this Mac (`brew install postgresql@17` then `brew services start postgresql@17`). Docker Compose is optional and not required for day-to-day work or pytest.

## Quick start

Run each block in its **own terminal**. Do not paste inline `# comments` on command lines — zsh may pass them as arguments.

### Terminal 1 — database (Homebrew Postgres)

Confirm it is up:

```bash
pg_isready -h localhost
psql -h localhost -d postgres -c '\du'
```

You want a superuser you can connect as (often your macOS username, e.g. `shoaib`, and/or role `mizan`). No Docker needed if port 5432 answers.

**Optional Docker** (only if you are not using brew Postgres):

```bash
cd /Users/shoaib/Documents/NEW_APP_PLAN
docker compose up -d
```

If brew already owns 5432, do **not** start Docker Postgres — they conflict.

### Terminal 2 — backend

```bash
cd /Users/shoaib/Documents/NEW_APP_PLAN
cp .env.example .env
cp .env backend/.env

cd backend
python3 -m venv .venv
source .venv/bin/activate
python3 -m pip install -e ".[dev]"
# Uses schema owner (mizan) via DATABASE_ADMIN_URL — see Migrations section
alembic upgrade head
uvicorn app.main:app --reload --port 8000
```

**Important:** `backend/.env` must exist. The API loads settings from `backend/.env` when you run uvicorn from the `backend/` folder. Without it, auth defaults to ON and the server crashes with a Clerk error.

Check: http://localhost:8000/docs should load.

### Terminal 3 — frontend

```bash
cd /Users/shoaib/Documents/NEW_APP_PLAN/frontend
npm install
npm run dev
```

Check: http://localhost:3000

## Environment (`.env`)

Copy `.env.example` to **both** repo root and `backend/.env` (same contents).

For local dev without Clerk sign-in, these must be set:

```
AUTH_ENFORCEMENT=false
IDEMPOTENCY_ENFORCEMENT=false
DATABASE_URL=postgresql+psycopg://mizan_app:mizan_dev@localhost:5432/mizan
```

With Docker Compose, also set `DATABASE_ADMIN_URL=postgresql+psycopg://mizan:mizan_dev@localhost:5432/postgres` so bootstrap can create DBs and the `mizan_app` role.

Frontend API URL — create `frontend/.env.local` (Next only reads env from `frontend/`):

```
NEXT_PUBLIC_API_URL=/backend-api
```

That path is a **same-origin proxy** (`next.config.ts` → `http://127.0.0.1:8000`). Do **not** point the browser straight at `:8000` in local dev — many browsers block or flake on that cross-origin call (`NetworkError`).

Leave `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` unset unless you have real Clerk keys. Restart `npm run dev` after changing `.env.local`.

## URLs

- **API (direct / docs):** http://127.0.0.1:8000/docs  
- **App:** http://localhost:3000 (API calls go to `/backend-api/...`)

## Tests (local Homebrew Postgres — no Docker)

Your machine already has **PostgreSQL 17 (Homebrew)** on `localhost:5432`. Agents should **not** start Docker for pytest on this Mac.

### One-time / when roles are missing

```bash
# Superuser is usually your macOS user (peer/trust on localhost)
psql -h localhost -d postgres -c '\du'
```

If role `mizan` is missing, create it (as your superuser):

```bash
psql -h localhost -d postgres <<'SQL'
CREATE ROLE mizan WITH LOGIN SUPERUSER PASSWORD 'mizan_dev';
SQL
```

(`mizan_app` / `mizan_test` are created by the test bootstrap on first pytest.)

### Backend pytest (copy-paste)

```bash
cd /Users/shoaib/Documents/NEW_APP_PLAN/backend
source .venv/bin/activate

# Admin URL = brew superuser that can CREATE ROLE / CREATE DATABASE.
# Use your macOS user (no password) OR mizan:mizan_dev if that role exists:
export DATABASE_ADMIN_URL='postgresql+psycopg://shoaib@localhost:5432/postgres'
# export DATABASE_ADMIN_URL='postgresql+psycopg://mizan:mizan_dev@localhost:5432/postgres'

# Always the venv binary — never bare `python3 -m pytest`
.venv/bin/pytest -q
```

Focused (faster):

```bash
.venv/bin/pytest tests/test_staff.py tests/test_control_account_tie.py -q
```

### Frontend

```bash
cd /Users/shoaib/Documents/NEW_APP_PLAN/frontend
npx vitest run
npx tsc --noEmit
```

**Run pytest through the venv, not the system Python.** A bare `python3 -m pytest` on macOS often hits Homebrew/python.org and lacks project packages (`No module named 'xlrd'`, `sentry_sdk`). `tests/conftest.py` fails fast if the wrong interpreter is used.

Tests use database **`mizan_test`**. Bootstrap creates it on first run when `DATABASE_ADMIN_URL` can create DBs.

**Fresh-install guard** (optional; still needs `DATABASE_ADMIN_URL` set as above):

```bash
export DATABASE_ADMIN_URL='postgresql+psycopg://shoaib@localhost:5432/postgres'
bash backend/scripts/verify_fresh_install.sh
```

## Migrations

Alembic runs as the **schema owner** (`mizan` with Docker Compose), not as `mizan_app`. After each upgrade it grants DML to `mizan_app` automatically.

```bash
cd backend && .venv/bin/alembic upgrade head
```

**Head (2026-08-03):** `088_membership_grants` — adds `entity_memberships.grants` (JSONB) for custom member access; backfills from role preset. **Required** after pulling custom-access code; without it, Settings → Members returns **500 Internal Server Error** (column missing).

### Troubleshooting — Members list 500 / empty team

1. Run `alembic current` — must show `088_membership_grants` (or later).
2. If behind: `cd backend && .venv/bin/alembic upgrade head`
3. Restart the API process (uvicorn / Railway redeploy).
4. Hard refresh Settings → Members & roles.

With Docker Compose, set `DATABASE_ADMIN_URL` in `.env` (see Environment above) so migrations and role bootstrap use `mizan:mizan_dev`.

## Project layout

```
backend/     FastAPI — core/, features/, adapters/
frontend/    Next.js — shared design system + app shell
docs/        Planning markdown at repo root (Decisions, ROADMAP, etc.)
```

Build rules: `CURSOR_RULES.md`. Progress: `ROADMAP.md`. Opening balances: `docs/OPENING_BALANCES.md`.

## Restore live data on local (Cloudflare R2 backup)

Use this to clone production into **local Homebrew Postgres** so you do not re-enter sales or statements by hand. **Never** set `DATABASE_URL` to Neon/Railway for this — only `localhost`.

### Before you start

1. **Stop** local `uvicorn` if it is running (Terminal 2).
2. Confirm local DB: `pg_isready -h localhost`
3. `backend/.env` must use local URLs:

```
DATABASE_URL=postgresql+psycopg://mizan_app:mizan_dev@localhost:5432/mizan
DATABASE_ADMIN_URL=postgresql+psycopg://shoaib@localhost:5432/postgres
AUTH_ENFORCEMENT=false
IDEMPOTENCY_ENFORCEMENT=false
```

(`DATABASE_ADMIN_URL` = your macOS superuser, or `mizan:mizan_dev` if that role exists.)

### Option A — Download from R2 in the script (recommended)

Copy these from **Railway → worker/cron service → Variables** into `backend/.env` (same values as production backup job):

```
BACKUP_S3_BUCKET=...
BACKUP_S3_ENDPOINT_URL=https://....r2.cloudflarestorage.com
BACKUP_S3_ACCESS_KEY_ID=...
BACKUP_S3_SECRET_ACCESS_KEY=...
BACKUP_S3_PREFIX=mizan
BACKUP_S3_REGION=auto
```

Then run:

```bash
cd /Users/shoaib/Documents/NEW_APP_PLAN/backend
source .venv/bin/activate
./scripts/restore_local_from_backup.sh --yes
```

The script downloads the latest `mizan-backup-*.tar.gz`, replaces local `mizan`, copies uploads, runs migrations.

### Option B — Download in Cloudflare dashboard

1. Cloudflare → R2 → your bucket → download latest `mizan-backup-YYYYMMDDTHHMMSSZ.tar.gz`
2. Restore:

```bash
cd /Users/shoaib/Documents/NEW_APP_PLAN/backend
source .venv/bin/activate
./scripts/restore_local_from_backup.sh --artifact ~/Downloads/mizan-backup-YYYYMMDDTHHMMSSZ.tar.gz --yes
```

### After restore

```bash
# Terminal 2 — backend
cd backend && source .venv/bin/activate && uvicorn app.main:app --reload --port 8000

# Terminal 3 — frontend
cd frontend && npm run dev
```

Open http://localhost:3000 — you should see the same restaurant data as on backup night. Test new statement imports on local without touching live.

### Safety

- Restores **only** into local database `mizan` on `localhost`.
- Does **not** modify Neon or Railway.
- Do **not** paste R2 secret keys into chat; keep them in `backend/.env` only.

See also `OPS_RESTORE.md` for production disaster recovery (different procedure).
