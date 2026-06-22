# PROGRESS

## Current

| Field | Value |
|-------|-------|
| **Phase** | 5 — Cash drawer, forex, staff, partner reimbursements, receivables |
| **Last completed slice** | Receivables |
| **Next slice** | Phase 6 — Sales intake + tips + expenses |
| **Branch** | `main` |
| **Last tag** | `v0.30.0-phase5-receivables` |

## Resume point

**Receivables slice** done — `customers` CRUD; `customer_ledger_entries` append-only; credit sale Dr `1200`/Cr `4000`; payment Dr bank/Cr `1200` (no second revenue); per-customer opening balance via `customer_id` lines; bank statement `customer_payment` classify; control account reconciles. **Phase 5 complete** — pending owner sign-off. **Next:** Phase 6 — Sales intake.

## Session notes

- **Receivables:** `core/receivables/` + `features/customers/`; `JournalEntrySource.CUSTOMER_*`; per-customer OB; bank `customer_payment` classify; Alembic `027`; 260 pytest green
- **Partners:** `core/partners/` + `features/partners/`; `JournalEntrySource.PARTNER_*`; per-partner OB; Alembic `026`; 252 pytest green
- **Staff:** `core/staff/` + `features/staff/`; `JournalEntrySource.STAFF_*`; `FxMovementType.SPEND`; Alembic `025`; 243 pytest green
- **Forex purchase:** tag `v0.27.0-phase5-forex-purchase`
- **Cash drawer:** tag `v0.26.0-phase5-cash-drawer`
