# PROGRESS

## Current

| Field | Value |
|-------|-------|
| **Phase** | 6 — Sales intake + tips + expenses |
| **Last completed slice** | Commission e-Faturas |
| **Next slice** | Tips (pass-through, not revenue/expense) |
| **Branch** | `main` |
| **Last tag** | (pending) / `v0.34.0-phase6-delivery-commission-efatura` |

## Resume point

**Commission e-Faturas** done — reuse `invoice_drafts` with `delivery_commission` kind; link posted `delivery_report`; `post_delivery_commission_draft()` Dr `5500` + Dr `1500` / Cr platform clearing (not AP); reconciliation clearing → 0 after report + settlement + commission. **Next:** tips pass-through slice.

## Session notes

- **Commission e-Faturas:** `invoice_kind` + `delivery_report_id` on drafts; `commission_journal_entry_id` on reports; `5500` expense account; `post_delivery_commission_draft()`; API link/post; Alembic `031`; 295 pytest green
- **Delivery reports:** `delivery_reports` + `delivery_settlements`; clearing `1410`/`1420`/`1430`; `post_delivery_report()` / `post_delivery_settlement()`; API under `/entities/{id}/delivery/...`; statement classify `delivery_settlement`; Alembic `030`; 289 pytest green
- **POS daily summary:** duplicate-day guard tag `v0.32.1`; 279 pytest
