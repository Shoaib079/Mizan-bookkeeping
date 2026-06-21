# PROGRESS

## Current

| Field | Value |
|-------|-------|
| **Phase** | 5 — Cash drawer, forex, staff, partner reimbursements, receivables |
| **Last completed slice** | Staff (salary vs advance) |
| **Next slice** | Partner reimbursements |
| **Branch** | `main` |
| **Last tag** | `v0.28.0-phase5-staff` |

## Resume point

**Staff slice** done — `employees` CRUD; `staff_ledger_entries` append-only; TRY accrual/advance/payment GL + subledger; FX accrual subledger-only, expense at payment via owner-entered `try_cost_kurus`; `2250` Salaries Payable mirrors AP pattern. **Next:** Partner reimbursements (Decisions §17).

## Session notes

- **Staff:** `core/staff/` + `features/staff/`; `JournalEntrySource.STAFF_*`; `FxMovementType.SPEND`; Alembic `025`; 243 pytest green
- **Forex purchase:** tag `v0.27.0-phase5-forex-purchase`
- **Cash drawer:** tag `v0.26.0-phase5-cash-drawer`
