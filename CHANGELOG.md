# CHANGELOG

Every change in plain English, dated (see CURSOR_RULES.md §8).

## 2026-06-21

Initial planning package committed to git (docs, rules, roadmap, design system, preview).

## 2026-06-21 (build)

Phase 0 — **App scaffold & repo setup**: FastAPI backend with `core/` layout and integer kuruş money type; Next.js frontend with Mizan design tokens and app shell; PostgreSQL via docker-compose; dev guide and Cursor rules wired; 6 backend tests passing.

Phase 0 — **Multi-restaurant foundation**: `Entity` registry; `EntityScopedMixin`; PostgreSQL RLS; `entity_context()`; 6 isolation tests (12 pytest total).

Phase 0 — **Opening-balances plan**: `docs/OPENING_BALANCES.md`; default restaurant chart seed; opening balance validation + day-one journal draft; onboarding validate API; **Phase 0 complete** (21 pytest total).

Phase 1 — **Chart of accounts + entity scoping**: persisted `accounts` per entity; seed/list API; Alembic `002_accounts_rls`; RLS isolation tests (27 pytest total).

Phase 1 — **Double-entry posting service**: `journal_entries` + `journal_entry_lines`; `post_journal_entry()` single posting boundary; `POST /entities/{id}/ledger/entries`; Alembic `003_journal_rls`, `004_accounts_posting_lookup`; balanced/unbalanced/zero/cross-entity tests (37 pytest total).

Phase 1 — **Ledger immutability, void/reverse, audit trail**: posted entries immutable (ORM + DB triggers); `void_journal_entry()` posts linked reversal; `ledger_audit_events` with `actor_id`; `POST /entities/{id}/ledger/entries/{entry_id}/void`; Alembic `005_ledger_void_audit` (44 pytest total). Tag `v0.7.0-phase1-ledger-void-audit`.

Phase 1 — **Ledger DB immutability (bootstrap + void gate)**: centralized `apply_ledger_immutability()` wired into test/dev bootstrap and Alembic `006`; void metadata updates require transaction-local `app.journal_void_update` gate; `ledger_audit_events` append-only at DB; 8 raw-SQL immutability tests (52 pytest total). Tag `v0.7.1-phase1-ledger-db-immutability`.
