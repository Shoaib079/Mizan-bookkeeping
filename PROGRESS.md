# PROGRESS

## Current

| Field | Value |
|-------|-------|
| **Phase** | 3 — Banking hub + bank statements |
| **Last completed slice** | Statement import & classify (Phase 3) |
| **Next slice** | Transfer linking (own-account) |
| **Branch** | `main` |
| **Last tag** | `v0.18.0-phase3-statement-import-classify` |

## Resume point

Phase 3 Slice 2 complete: **2026-06-21**. Next: **Transfer linking (own-account, not income/expense)**.

## Session notes

- **Statement import & classify:** `bank_statements` + `bank_statement_lines` (entity RLS); CSV parser `adapters/bank_parsers/csv_simple.py`; duplicate SHA256 fingerprint + overlapping period rejection; classify supplier payment links existing manual payment (supplier/amount/date) or calls `post_supplier_payment()`; bank fee/unknown store classification only; Alembic `016`
- **API:** `POST/GET .../banking/accounts/{id}/statements`, `GET .../banking/statements/{id}`, `PATCH .../lines/{id}/classify`
- **151 pytest** green
