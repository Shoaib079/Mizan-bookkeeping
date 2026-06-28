# Mizan — local development

## Prerequisites

- Python 3.11+
- Node.js 20+
- Docker (for PostgreSQL)

## Quick start

Run each block in its **own terminal**. Do not paste inline `# comments` on command lines — zsh may pass them as arguments.

### Terminal 1 — database

```bash
cd /Users/shoaib/Documents/NEW_APP_PLAN
docker compose up -d
```

If you see **port 5432 already allocated**, another Postgres container is running (often `erp-pytest-pg`). Either stop it:

```bash
docker stop erp-pytest-pg
docker compose up -d
```

…or skip `mizan-db` if you already have `mizan` / `mizan_dev` on localhost:5432 from another dev database.

### Terminal 2 — backend

```bash
cd /Users/shoaib/Documents/NEW_APP_PLAN
cp .env.example .env
cp .env backend/.env

cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
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

Optional frontend env (create `frontend/.env.local` if you change the API URL):

```
NEXT_PUBLIC_API_URL=http://localhost:8000
```

Leave `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` unset unless you have real Clerk keys.

## URLs

- **API:** http://localhost:8000 — docs at `/docs`
- **App:** http://localhost:3000

## Tests

```bash
cd backend && .venv/bin/pytest -v
cd frontend && npm run build
```

**Fresh-install guard** (clean venv → editable install → boot → full pytest). Export `DATABASE_ADMIN_URL` before running verify/bootstrap scripts (e.g. `export DATABASE_ADMIN_URL='postgresql+psycopg://mizan:mizan_dev@localhost:5432/postgres'`).

```bash
bash backend/scripts/verify_fresh_install.sh
```

CI runs the same script on every push/PR (`.github/workflows/ci.yml`).

Tests use `mizan_test` database. On first run, bootstrap creates the `mizan` role and databases.

**With Docker Compose** (`POSTGRES_USER=mizan`), pass the admin URL so bootstrap can create DBs and apply `NOBYPASSRLS` on the app role (required for entity-isolation tests):

```bash
cd backend && source .venv/bin/activate
DATABASE_ADMIN_URL='postgresql+psycopg://mizan:mizan_dev@localhost:5432/postgres' pytest -q
```

Without Docker, default `DATABASE_ADMIN_URL` is `postgres@localhost` (see `.env.example`).

## Migrations

Alembic runs as the **schema owner** (`mizan` with Docker Compose), not as `mizan_app`. After each upgrade it grants DML to `mizan_app` automatically.

```bash
cd backend && .venv/bin/alembic upgrade head
```

With Docker Compose, set `DATABASE_ADMIN_URL` in `.env` (see Environment above) so migrations and role bootstrap use `mizan:mizan_dev`.

## Project layout

```
backend/     FastAPI — core/, features/, adapters/
frontend/    Next.js — shared design system + app shell
docs/        Planning markdown at repo root (Decisions, ROADMAP, etc.)
```

Build rules: `CURSOR_RULES.md`. Progress: `ROADMAP.md`. Opening balances: `docs/OPENING_BALANCES.md`.
