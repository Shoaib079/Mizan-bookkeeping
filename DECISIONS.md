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

## 2026-06-21 — Ledger DB immutability bootstrap + void gate

**Choice:** Centralize PostgreSQL immutability triggers in `apply_ledger_immutability()` (bootstrap + Alembic `006`). Void metadata (`status`, `reversed_by_entry_id`, `voided_at`) updates require transaction-local `set_config('app.journal_void_update', '1', true)` — set by `journal_void_update_allowed(session)` during `void_journal_entry()`. `ledger_audit_events` is append-only at DB (no UPDATE/DELETE).

**Why:** v0.7.0 triggers existed only via Alembic; test/dev bootstrap used `create_all` without triggers, so raw SQL could bypass ORM listeners. Hardening closes that gap without new product surface.

## 2026-06-21 — Manual journals via dedicated API + entry source typing

**Choice:** Add `JournalEntrySource` on `journal_entries` (`manual`, `opening_balance`, `invoice`, `system`). Accountant adjustments use `features/manual_journals/` with `POST/GET /entities/{id}/manual-journals` (list/get/void). All posts go through `post_journal_entry(..., source=...)`. Void reversals stamp `source=system`.

**Why:** Decisions §1 — manual journals are a distinct, audited flow; source typing lets list/filter exclude automated entries (invoices, opening balances, void reversals) without ad-hoc flags.

**API migration:** Removed generic `POST .../ledger/entries` (no source typing). Kept `POST .../ledger/entries/{id}/void` for ledger-wide void; manual-journals also exposes `POST .../manual-journals/{id}/void` with enriched response (account code/name on lines).

**Immutability:** `source` is immutable after post (ORM + DB trigger). No PATCH on entries.

## 2026-06-21 — e-Fatura read into draft (no posting)

**Choice:** `features/invoices/` with `invoice_drafts` table (entity-scoped RLS). Upload via `POST .../invoices/efatura/draft` (multipart). Prefer UBL-TR XML (`extract_efatura_xml`); PDF v1 uses fixture registry for tests and optional `pypdf` text + regex heuristics for common GİB layouts. Unknown/unreadable PDFs return 422 — full vision OCR deferred.

**Why:** Decisions §7 — supplier invoices from e-Fatura; prefer XML, fall back to PDF; per-rate KDV breakdown; net + VAT = gross check. Decisions §8 — SHA256 `file_fingerprint` for duplicate detection per entity. Slice is **read into draft only** — no ledger posting, payables, or supplier master.

**Duplicate handling:** Same fingerprint + entity → HTTP 409 with `existing_draft_id`. Cross-entity: same file allowed (fingerprint scoped per entity).

**Math:** `validate_invoice_totals()` — integer kuruş, zero tolerance.

**Storage:** `adapters/storage/local.py` writes to configurable `upload_dir` (default `data/uploads/`).

## 2026-06-21 — Opening balance validate API blocks unmodeled categories

**Choice:** Whitelist aggregate codes only; refuse FX (`1010`–`1030`), partner (`2150`), and future sub-account codes with explicit **not supported yet** errors.

**Why:** Block, don't guess — especially FX as plain kuruş (Decisions §15 quantity model).

## 2026-06-21 — Supplier master per entity (Phase 2)

**Choice:** `features/suppliers/` with `suppliers` table (entity-scoped RLS). One supplier record per VKN per entity; same real-world supplier across restaurants = separate rows. VKN is 10–11 digits, immutable after create. Deactivate via `is_active=false` only — no hard delete.

**Why:** Decisions §8 — suppliers tracked per restaurant/entity; VKN from e-Fatura for matching; no heavy name-matching. Slice is **master data only** — no payables ledger, posting, or payments yet.

**API:** `POST/GET/PATCH /entities/{id}/suppliers`; `GET .../suppliers/by-vkn/{vkn}` for future draft→supplier linking. Duplicate VKN within entity → HTTP 409.

**Unique constraint:** `(entity_id, vkn)`. Cross-entity: same VKN allowed (separate books per entity).

## 2026-06-21 — Payables ledger & balance (Phase 2)

**Choice:** `core/payables/` with `supplier_ledger_entries` table (entity-scoped RLS, append-only). Single write boundary: `record_supplier_movement()`. Signed integer kuruş: positive increases payable, negative decreases. Movement types include `opening_balance`, `adjustment`, `invoice`, `payment`, `credit_note`; only `opening_balance` and `adjustment` writable via API this slice.

**Why:** Decisions §8 — ledger/balance-based payables; running supplier ledger; payables page shows all supplier balances + total; no invoice-by-invoice payment allocation. No GL posting from payables movements this slice.

**Immutability:** ORM event listeners + PostgreSQL BEFORE UPDATE/DELETE triggers (`apply_payables_immutability()`). Corrections via reversing adjustment movement (future).

**API:** `GET /entities/{id}/payables` (total + per-supplier balances); `GET .../suppliers/{id}/ledger`; `POST .../suppliers/{id}/ledger/movements` with `actor_id`, `movement_date`, `movement_type`, `amount_kurus`, `description`.

**Balance:** `current_balance_kurus(supplier_id)` = SUM(`amount_kurus`); entity total = sum across active suppliers.

