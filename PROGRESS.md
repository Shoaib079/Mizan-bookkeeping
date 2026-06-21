# PROGRESS

## Current

| Field | Value |
|-------|-------|
| **Phase** | 3 — Banking hub + bank statements |
| **Last completed slice** | Supplier payment GL posting (Phase 2) |
| **Next slice** | Bank/cash account tree (per entity) |
| **Branch** | `main` |
| **Last tag** | `v0.16.0-phase2-supplier-payment-gl` |

## Resume point

Phase 2 owner sign-off: **2026-06-21**. Next: Phase 3 — **Bank/cash account tree (per entity)**.

## Session notes

- **Supplier payment GL posting:** `core/payables/posting.py` — `post_supplier_payment()` atomically posts GL journal (`source=payment`, Dr AP `2000`, Cr bank/cash asset) + negative payables movement; `journal_entry_id` FK on subledger row; Alembic `014`
- **API:** `POST .../suppliers/{id}/payments` requires `payment_account_id` (active ASSET); returns `journal_entry_id`, `supplier_ledger_entry`, `payable_balance_kurus`
- **Control account:** after invoice + payment, GL AP balance = sum of supplier subledger balances; bank/cash credited by payment amount
- **Opening balance / adjustment** subledger movements do not hit GL — control-account tests use invoice post + payment path
- **Phase 3 note:** bank-statement supplier payment classification must reuse `post_supplier_payment()` OR link to an existing payment (match supplier/amount/date) — never post twice
- **132 pytest** green
