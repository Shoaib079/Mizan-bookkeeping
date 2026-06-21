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

## 2026-06-21 — Single posting boundary in core/ledger

**Choice:** All ledger writes go through `post_journal_entry()` in `core/ledger/posting.py`. Journal tables inherit `EntityScopedMixin`; amounts are integer kuruş; validation rejects unbalanced entries, zero lines, inactive/unknown accounts, and cross-entity account references.

**Why:** Decisions §1 / CURSOR_RULES §1 #10 — one boundary prevents bypass paths. Feature APIs delegate to core; no direct journal inserts elsewhere.

**Cross-entity account check:** RLS normally hides other entities' accounts. Posting uses transaction-local `app.posting_lookup` + `accounts_posting_lookup` SELECT policy so the boundary can detect entity mismatch without exposing accounts to normal queries.

## 2026-06-21 — Posted journal immutability + void/reverse + audit

**Choice:** Posted `journal_entries` and lines are immutable at ORM (event listeners) and PostgreSQL (BEFORE UPDATE/DELETE triggers). Corrections only via `void_journal_entry()`, which posts a balanced reversing entry linked to the original. Every post and void writes a row to `ledger_audit_events` with `actor_id`, timestamp, and optional reason.

**Why:** Decisions §1 / CURSOR_RULES §1 #3 — void → reverse → audit; no in-place edits to posted amounts. `actor_id` is a plain UUID parameter until auth lands (no over-engineered ActorContext).

**Void metadata:** Original entry `status=voided`, `reversed_by_entry_id` set; reversal `reverses_entry_id` points at original. Both entries remain visible; net ledger effect is zero.

**API:** `POST .../ledger/entries` requires `actor_id`; `POST .../ledger/entries/{entry_id}/void` with optional `reason` and `void_date`. No PATCH/DELETE on entries.


## 2026-06-21 — Opening balance validate API blocks unmodeled categories

**Choice:** Whitelist aggregate codes only; refuse FX (`1010`–`1030`), partner (`2150`), and future sub-account codes with explicit **not supported yet** errors.

**Why:** Block, don't guess — especially FX as plain kuruş (Decisions §15 quantity model).

