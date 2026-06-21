# PROGRESS

## Current

| Field | Value |
|-------|-------|
| **Phase** | 2 — Suppliers & payables |
| **Last completed slice** | Invoice → payable posting (draft-to-ledger) |
| **Next slice** | Phase 3 — Banking hub + bank statements |
| **Branch** | `main` |
| **Last tag** | `v0.15.0-phase2-draft-to-ledger` |

## Resume point

Phase 2 slices are complete pending owner sign-off. Next: Phase 3 — **Bank/cash account tree (per entity)**.

## Session notes

- **Draft-to-ledger posting:** `core/invoices/posting.py` — `post_confirmed_draft()` atomically posts GL journal (`source=invoice`) + supplier payables invoice movement; draft status → `posted` with `journal_entry_id`; Alembic `013`
- **Input VAT account:** default chart code `1500` (Indirilecek KDV); migration seeds missing account on existing entities
- **GL pattern:** debit expense (caller `expense_account_id`) + debit Input VAT per `vat_breakdown` line; credit AP `2000` for gross
- **API:** `POST .../invoices/drafts/{draft_id}/post` with `actor_id`, `expense_account_id`
- **127 pytest** green
