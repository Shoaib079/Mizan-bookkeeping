# PROGRESS

## Current

| Field | Value |
|-------|-------|
| **Phase** | 4 — POS settlement + credit cards |
| **Last completed slice** | Card sales → bank deposit reconciliation |
| **Next slice** | Phase 4 owner sign-off |
| **Branch** | `main` |
| **Last tag** | `v0.24.0-phase4-card-sales-reconciliation` |

## Resume point

Phase 4 Slice 3 complete pending owner sign-off. **Card sales → bank deposit reconciliation** — commit/tag `v0.24.0-phase4-card-sales-reconciliation`. Phase 4 all slices done; pending owner sign-off before Phase 5.

## Session notes

- **Card sales reconciliation:** `card_sales_batches` table; `post_card_sales_batch()` Dr `1400` / Cr `4000`; settlement commission explicit or inferred from linked batch (Dr bank + Dr `5300` / Cr `1400` gross); `GET .../pos/clearing-reconciliation`; Alembic `021`
- **Credit card clearing accounts:** `MoneyAccountKind.CREDIT_CARD` with GL sub-accounts `2101+` under `2100`; tree API `credit_cards` branch; opening balance `money_account_id` lines use `gl_account.normal_balance` (CREDIT for liability cards); reject aggregate `2100` when card sub-accounts exist; Alembic `020`
- **POS settlement intake:** `post_pos_settlement()` in `core/pos/posting.py` — Dr bank GL sub-account / Cr `1400` Card Sales Clearing; `pos_settlements` table with `journal_entry_id`; statement classify `pos_settlement` (inflow only, posts GL); manual + list/detail API at `POST/GET .../pos/settlements`; Alembic `019`
- **205 pytest** green
