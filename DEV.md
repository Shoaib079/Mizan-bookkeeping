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

Optional frontend env (create `frontend/.env.local` if you change the API URL):

```
NEXT_PUBLIC_API_URL=http://localhost:8000
```

Leave `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` unset unless you have real Clerk keys.

## URLs

- **API:** http://localhost:8000 — docs at `/docs`
- **App:** http://localhost:3000

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

With Docker Compose, set `DATABASE_ADMIN_URL` in `.env` (see Environment above) so migrations and role bootstrap use `mizan:mizan_dev`.

## Project layout

```
backend/     FastAPI — core/, features/, adapters/
frontend/    Next.js — shared design system + app shell
docs/        Planning markdown at repo root (Decisions, ROADMAP, etc.)
```

Build rules: `CURSOR_RULES.md`. Progress: `ROADMAP.md`. Opening balances: `docs/OPENING_BALANCES.md`.
