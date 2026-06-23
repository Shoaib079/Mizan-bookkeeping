# Mizan — local development

## Prerequisites

- Python 3.11+
- Node.js 20+
- Docker (for PostgreSQL)

## Quick start

```bash
# 1. Database
docker compose up -d

# 2. Backend (from repo root)
cd backend
python3 -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -e ".[dev]"       # needs python-multipart; packages only app* (see BUGLOG)
uvicorn app.main:app --reload --port 8000

# 3. Frontend (new terminal)
cd frontend
npm install
npm run dev
```

- **API:** http://localhost:8000 — docs at `/docs`
- **App:** http://localhost:3000
- Copy `.env.example` to `.env` when wiring the database (Phase 0+).

## Tests

```bash
cd backend && .venv/bin/pytest -v
cd frontend && npm run build
```

Tests use `mizan_test` database. On first run, bootstrap creates the `mizan` role and databases (uses `DATABASE_ADMIN_URL`, default `postgres@localhost`).

## Migrations

```bash
cd backend && .venv/bin/alembic upgrade head
```

## Project layout

```
backend/     FastAPI — core/, features/, adapters/
frontend/    Next.js — shared design system + app shell
docs/        Planning markdown at repo root (Decisions, ROADMAP, etc.)
```

Build rules: `CURSOR_RULES.md`. Progress: `ROADMAP.md`. Opening balances: `docs/OPENING_BALANCES.md`.
