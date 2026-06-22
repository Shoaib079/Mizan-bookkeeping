# PROGRESS

## Current

| Field | Value |
|-------|-------|
| **Phase** | 6 — Sales intake + tips + expenses |
| **Last completed slice** | Tips (pass-through, not revenue/expense) |
| **Next slice** | Expenses + spelling tolerance |
| **Branch** | `main` |
| **Last tag** | `v0.35.0-phase6-tips` |

## Resume point

**User-managed delivery platforms** done — `delivery_platforms` table; owner add/rename/deactivate; clearing sub-accounts under parent `1450`; reports/settlements/commission/reconciliation keyed by `delivery_platform_id` (no fixed enum). **Tips pass-through** done — card/cash accrual to `2260` Tips Payable; cash payout drains pot (not expense). **Next:** expenses slice.

## Session notes

- **Tips pass-through:** `tip_accruals` + `tip_payouts`; card Dr `1400`/Cr `2260`; cash held Dr cash/Cr `2260`; payout Dr `2260`/Cr cash; balance endpoint; Alembic `033`; 307 pytest green
- **User-managed platforms:** `delivery_platforms` + API `.../delivery/platforms`; migration `032` from legacy `1410`–`1430`; default chart parent `1450` only; 300 pytest green
- **Commission e-Faturas:** `post_delivery_commission_draft()` credits platform clearing GL (not AP); Alembic `031`
- **Delivery reports:** `delivery_reports` + `delivery_settlements`; Alembic `030`
