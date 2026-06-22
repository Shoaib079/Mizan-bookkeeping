# PROGRESS

## Current

| Field | Value |
|-------|-------|
| **Phase** | 5 — Cash drawer, forex, staff, partner reimbursements, receivables |
| **Last completed slice** | FX spend / conversion |
| **Next slice** | Phase 5 owner sign-off |
| **Branch** | `main` |
| **Last tag** | `ce1e965` / `v0.31.0-phase5-fx-spend` |

## Resume point

**FX spend / conversion** done — `post_fx_conversion()` and `post_fx_expense_spend()` at average cost; realized gain/loss on conversion only (`4200`/`5600`); holdings never revalued. All six Phase 5 slices done; pending owner sign-off.

## Session notes

- **FX spend:** `core/fx/average_cost.py`, `core/fx/spend_posting.py`; `JournalEntrySource.FX_CONVERSION`, `FX_EXPENSE_SPEND`; chart `4200`/`5600`; 266 pytest green
- **Receivables:** tag `v0.30.0-phase5-receivables`
- **Partners:** tag `v0.29.0-phase5-partner-reimbursements`
