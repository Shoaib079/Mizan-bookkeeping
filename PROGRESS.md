# PROGRESS

## Current

| Field | Value |
|-------|-------|
| **Phase** | 5 — Cash drawer, forex, staff, partner reimbursements, receivables |
| **Last completed slice** | Partner reimbursements |
| **Next slice** | Receivables |
| **Branch** | `main` |
| **Last tag** | `v0.29.0-phase5-partner-reimbursements` |

## Resume point

**Partner reimbursements slice** done — `partners` CRUD; `partner_ledger_entries` append-only; expense fronted Dr expense/Cr `2150`; reimbursement Dr `2150`/Cr cash (no second expense); per-partner opening balance via `partner_id` lines; control account reconciles. **Next:** Receivables (Decisions §18).

## Session notes

- **Partners:** `core/partners/` + `features/partners/`; `JournalEntrySource.PARTNER_*`; per-partner OB; Alembic `026`; 252 pytest green
- **Staff:** `core/staff/` + `features/staff/`; `JournalEntrySource.STAFF_*`; `FxMovementType.SPEND`; Alembic `025`; 243 pytest green
- **Forex purchase:** tag `v0.27.0-phase5-forex-purchase`
- **Cash drawer:** tag `v0.26.0-phase5-cash-drawer`
