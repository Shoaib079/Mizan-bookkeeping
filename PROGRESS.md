# PROGRESS

## Current

| Field | Value |
|-------|-------|
| **Phase** | 2 — Suppliers & payables |
| **Last completed slice** | Payment reduces payable |
| **Next slice** | Invoice → payable posting (draft-to-ledger) |
| **Branch** | `main` |
| **Last tag** | `v0.14.0-phase2-payment-reduces-payable` |

## Resume point

Start Phase 2 — **Invoice → payable posting (draft-to-ledger)**: confirmed draft posts payable movement + GL journal entry. Do **not** implement until owner sign-off on payment slice.

## Session notes

- **Draft → supplier linking:** nullable `supplier_id` FK; auto-link on upload when VKN matches; `POST .../link-supplier` / `POST .../unlink-supplier`; Alembic `011`
- **Draft review:** `confirmed` status; `confirmed_at` / `confirmed_by`; confirm requires linked supplier; reject → `needs_review`; confirmed drafts immutable; list filter `?status=`; Alembic `012`
- **Payment reduces payable:** `record_supplier_payment()` — positive API amount stored as negative movement; overpayment rejected (balance cannot go negative); payables ledger only — **no GL/bank posting**; `POST .../suppliers/{id}/payments`
- **117 pytest** green
