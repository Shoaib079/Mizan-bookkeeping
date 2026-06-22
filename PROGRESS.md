# PROGRESS

## Current

| Field | Value |
|-------|-------|
| **Phase** | 6 — Sales intake + tips + expenses |
| **Last completed slice** | User-managed delivery platforms |
| **Next slice** | Tips (pass-through, not revenue/expense) |
| **Branch** | `main` |
| **Last tag** | `v0.34.1-phase6-delivery-platforms-managed` |

## Resume point

**User-managed delivery platforms** done — `delivery_platforms` table; owner add/rename/deactivate; clearing sub-accounts under parent `1450`; reports/settlements/commission/reconciliation keyed by `delivery_platform_id` (no fixed enum). **Next:** tips pass-through slice.

## Session notes

- **User-managed platforms:** `delivery_platforms` + API `.../delivery/platforms`; migration `032` from legacy `1410`–`1430`; default chart parent `1450` only; 300 pytest green
- **Commission e-Faturas:** `post_delivery_commission_draft()` credits platform clearing GL (not AP); Alembic `031`
- **Delivery reports:** `delivery_reports` + `delivery_settlements`; Alembic `030`
