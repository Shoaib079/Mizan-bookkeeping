# PROGRESS

Current phase/slice, resume point, session notes. Update when starting, pausing, or ending work (see CURSOR_RULES.md §8).

## Current

| Field | Value |
|-------|-------|
| **Phase** | 0 — Setup (in progress) |
| **Completed slices** | Project rules & docs · App scaffold · **Multi-restaurant foundation** |
| **Next slice** | **Opening-balances plan** |
| **Branch** | `main` |
| **Last tag** | *(pending commit — v0.2.0-phase0-entity-isolation)* |

## Resume point

After owner sign-off on **multi-restaurant foundation**:
1. Document opening-balances onboarding approach (Decisions §19)
2. Then Phase 1 — ledger core + chart of accounts

## Session notes (2026-06-21)

- **Multi-restaurant foundation:** `Entity` registry, `EntitySetting` (entity-scoped), `EntityScopedMixin`, PostgreSQL **RLS** on scoped tables, `entity_context()` for automatic query scoping, Alembic migration `001_entities_rls`
- **Isolation tests:** 6 tests prove Restaurant A data invisible to B (ORM, raw SQL, API, cross-write blocked)
- **12 pytest tests** green

## Record-keeping logs (all present)

| File | Purpose |
|------|---------|
| `PROGRESS.md` | This file — resume point |
| `CHANGELOG.md` | Dated change history |
| `BUGLOG.md` | Bugs + root cause + guarding tests |
| `DECISIONS.md` | Technical decision log |
| `TESTS.md` | Test register |
| `ROADMAP.md` | Phase/slice tracker |

## Core reference docs (repo root)

| File | Role |
|------|------|
| `Restaurant_Bookkeeping_App_Decisions.md` | WHAT to build |
| `ARCHITECTURE.md` | Code structure |
| `DESIGN_SYSTEM.md` | Look + UX |
