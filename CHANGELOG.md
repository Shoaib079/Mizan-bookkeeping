# CHANGELOG

Every change in plain English, dated (see CURSOR_RULES.md §8).

## 2026-06-21

Initial planning package committed to git (docs, rules, roadmap, design system, preview).

## 2026-06-21 (build)

Phase 0 — **App scaffold & repo setup**: FastAPI backend with `core/` layout and integer kuruş money type; Next.js frontend with Mizan design tokens and app shell; PostgreSQL via docker-compose; dev guide and Cursor rules wired; 6 backend tests passing.

Phase 0 — **Multi-restaurant foundation**: `Entity` registry; `EntityScopedMixin` (mandatory `entity_id` on business tables); PostgreSQL row-level security; `entity_context()` for scoped reads/writes; entity settings API; Alembic migration; 6 isolation tests proving Restaurant A data never visible to Restaurant B (12 pytest total).
