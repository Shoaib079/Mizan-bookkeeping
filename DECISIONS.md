# DECISIONS

Significant technical choices and rationale (see CURSOR_RULES.md §8). Product decisions live in Restaurant_Bookkeeping_App_Decisions.md.

## 2026-06-21 — Entity isolation via PostgreSQL RLS

**Choice:** Enforce multi-restaurant isolation at the **database** with PostgreSQL row-level security (`FORCE ROW LEVEL SECURITY`) on every entity-scoped table, plus application `entity_context()` setting `app.current_entity_id`.

**Why:** CURSOR_RULES §1 requires DB-level enforcement so no code path can leak across entities. RLS applies to ORM and raw SQL.

**Pattern for new tables:** inherit `EntityScopedMixin`, add table name to `app/db/rls.py` `RLS_TABLES`, include in Alembic migration.

## 2026-06-21 — Opening balances offset via Opening Balance Equity

**Choice:** User enters natural-side opening figures per balance-sheet account; system generates **Opening Balance Equity (`3900`)** offset so the day-one journal balances.

**Why:** Decisions §19 — running business go-live; standard accounting practice.

**Plan:** `docs/OPENING_BALANCES.md`. Posting lands in Phase 1 `core/ledger`.

## 2026-06-21 — Opening balance validate API blocks unmodeled categories

**Choice:** Whitelist aggregate codes only; refuse FX (`1010`–`1030`), partner (`2150`), and future sub-account codes with explicit **not supported yet** errors.

**Why:** Block, don't guess — especially FX as plain kuruş (Decisions §15 quantity model).

