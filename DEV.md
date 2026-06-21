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
source .venv/bin/activate
pip install -e ".[dev]"
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

## Project layout

```
backend/     FastAPI — core/, features/, adapters/
frontend/    Next.js — shared design system + app shell
docs/        Planning markdown at repo root (Decisions, ROADMAP, etc.)
```

Build rules: `CURSOR_RULES.md`. Progress: `ROADMAP.md`.
