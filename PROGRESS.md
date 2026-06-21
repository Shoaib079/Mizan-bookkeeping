# PROGRESS

## Current

| Field | Value |
|-------|-------|
| **Phase** | 2 — Suppliers & payables |
| **Last completed slice** | Payables ledger & balance |
| **Next slice** | Invoice → payable posting |
| **Branch** | `main` |
| **Last tag** | `v0.11.0-phase2-payables-ledger` (`48dbdd7`) |

## Resume point

Start Phase 2 — Invoice → payable posting (payables ledger complete).

## Session notes

- **Payables ledger:** `supplier_ledger_entries` table with RLS; append-only (ORM + DB triggers)
- **Write boundary:** `record_supplier_movement()` in `core/payables/ledger.py` — only path to write ledger rows
- **Movement types:** `opening_balance`, `adjustment` writable this slice; `invoice`, `payment`, `credit_note` reserved
- **Signed amounts:** positive = payable up (owe more); negative = payable down
- **Balance:** `SUM(amount_kurus)` per supplier; entity total on payables list
- **API:** `GET .../payables`, `GET .../suppliers/{id}/ledger`, `POST .../suppliers/{id}/ledger/movements`
- **Alembic:** `010_supplier_ledger`
- **97 pytest** green
