# PROGRESS

## Current

| Field | Value |
|-------|-------|
| **Phase** | 4 — POS settlement + credit cards |
| **Last completed slice** | Credit card clearing accounts |
| **Next slice** | Card sales → bank deposit reconciliation |
| **Branch** | `main` |
| **Last tag** | `v0.23.0-phase4-credit-card-accounts` |

## Resume point

Phase 4 Slice 2 complete pending owner sign-off. **Credit card clearing accounts** — commit/tag `v0.23.0-phase4-credit-card-accounts`. Next: **Phase 4 Slice 3 — Card sales → bank deposit reconciliation**.

## Session notes

- **Credit card clearing accounts:** `MoneyAccountKind.CREDIT_CARD` with GL sub-accounts `2101+` under `2100`; tree API `credit_cards` branch; opening balance `money_account_id` lines use `gl_account.normal_balance` (CREDIT for liability cards); reject aggregate `2100` when card sub-accounts exist; Alembic `020`
- **POS settlement intake:** `post_pos_settlement()` in `core/pos/posting.py` — Dr bank GL sub-account / Cr `1400` Card Sales Clearing; `pos_settlements` table with `journal_entry_id`; statement classify `pos_settlement` (inflow only, posts GL); manual + list/detail API at `POST/GET .../pos/settlements`; Alembic `019`
- **Near-match detection:** ±3 day window; exact date auto-link; near-match → `needs_review` (no second GL post); confirm via `confirm_supplier_ledger_entry_id` / `confirm_account_transfer_id`; Alembic `018`
- **GL posting policy:** ROADMAP + DECISIONS table — all real-event classifications must post in their slice
- **197 pytest** green
