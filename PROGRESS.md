# PROGRESS

## Current

| Field | Value |
|-------|-------|
| **Phase** | 4 — POS settlement + credit cards |
| **Last completed slice** | POS settlement intake |
| **Next slice** | Credit card clearing accounts |
| **Branch** | `main` |
| **Last tag** | `v0.22.0-phase4-pos-settlement-intake` |

## Resume point

Phase 4 Slice 1 complete pending owner sign-off. **POS settlement intake** — commit/tag `v0.22.0-phase4-pos-settlement-intake`. Next: **Phase 4 Slice 2 — Credit card clearing accounts**.

## Session notes

- **POS settlement intake:** `post_pos_settlement()` in `core/pos/posting.py` — Dr bank GL sub-account / Cr `1400` Card Sales Clearing; `pos_settlements` table with `journal_entry_id`; statement classify `pos_settlement` (inflow only, posts GL); manual + list/detail API at `POST/GET .../pos/settlements`; Alembic `019`
- **Near-match detection:** ±3 day window; exact date auto-link; near-match → `needs_review` (no second GL post); confirm via `confirm_supplier_ledger_entry_id` / `confirm_account_transfer_id`; Alembic `018`
- **GL posting policy:** ROADMAP + DECISIONS table — all real-event classifications must post in their slice
- **187 pytest** green
