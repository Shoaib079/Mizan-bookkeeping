# PROGRESS

Current phase/slice, resume point, session notes. Update when starting, pausing, or ending work (see CURSOR_RULES.md §8).

## Current

| Field | Value |
|-------|-------|
| **Phase** | 0 — Setup |
| **Slice** | Multi-restaurant foundation (next) |
| **Branch** | `main` |
| **Gate step** | Not started — awaiting owner sign-off on scaffold slice |

## Resume point

After owner sign-off on **App scaffold & repo setup**:
1. Add `Entity` model + DB session with mandatory `entity_id` scoping
2. Alembic/migrations baseline
3. See ROADMAP Phase 0 — multi-restaurant foundation

## Session notes (2026-06-21)

- Phase 0 scaffold built: `backend/` (FastAPI, core layout, money kuruş type), `frontend/` (Next.js, Mizan tokens, app shell), `docker-compose.yml`, `DEV.md`, `.cursor/rules/mizan.mdc`
- Backend: 6 pytest tests green; frontend production build OK
