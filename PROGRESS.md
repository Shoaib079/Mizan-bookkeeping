# PROGRESS

## Current

| Field | Value |
|-------|-------|
| **Phase** | 5 — Cash drawer, forex, staff, partner reimbursements, receivables |
| **Last completed slice** | Forex (FX purchase / holding) |
| **Next slice** | Staff (salary vs advance) |
| **Branch** | `main` |
| **Last tag** | `v0.27.0-phase5-forex-purchase` |

## Resume point

**Forex purchase** done — `FOREIGN_CURRENCY` money accounts under `1010`/`1020`/`1030`; GL holds TRY book cost; `fx_ledger_entries` tracks native quantity + per-purchase `try_cost_kurus`; `post_fx_purchase()` atomic GL + subledger. **Next:** Staff slice (Decisions §16) — salary vs advance, no double-count.

## Session notes

- **Forex purchase:** `core/fx/` + `features/fx/`; `JournalEntrySource.FX_PURCHASE`; Alembic `024`; 234 pytest green
- **Cash drawer:** tag `v0.26.0-phase5-cash-drawer`
