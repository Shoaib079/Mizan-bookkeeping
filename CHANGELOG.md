# CHANGELOG

Every change in plain English, dated (see CURSOR_RULES.md §8).

## 2026-06-21

Initial planning package committed to git (docs, rules, roadmap, design system, preview).

## 2026-06-21 (build)

Phase 0 — **App scaffold & repo setup**: FastAPI backend with `core/` layout and integer kuruş money type; Next.js frontend with Mizan design tokens and app shell; PostgreSQL via docker-compose; dev guide and Cursor rules wired; 6 backend tests passing.

Phase 0 — **Multi-restaurant foundation**: `Entity` registry; `EntityScopedMixin`; PostgreSQL RLS; `entity_context()`; 6 isolation tests (12 pytest total).

Phase 0 — **Opening-balances plan**: `docs/OPENING_BALANCES.md`; default restaurant chart seed; opening balance validation + day-one journal draft; onboarding validate API; **Phase 0 complete** (21 pytest total).

Phase 1 — **Chart of accounts + entity scoping**: persisted `accounts` per entity; seed/list API; Alembic `002_accounts_rls`; RLS isolation tests (27 pytest total).
