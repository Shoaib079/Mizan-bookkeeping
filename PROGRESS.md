# PROGRESS

## Current

| Field | Value |
|-------|-------|
| **Phase** | 6 — Sales intake + tips + expenses |
| **Last completed slice** | Delivery platform reports |
| **Next slice** | Commission e-Faturas (vendor pipeline) |
| **Branch** | `main` |
| **Last tag** | (pending) / `v0.33.0-phase6-delivery-platform-reports` |

## Resume point

**Delivery platform reports** done — manual JSON intake; math check → `needs_review`; post Dr clearing / Cr revenue (gross); settlement Dr bank / Cr clearing (net); per-platform reconciliation; `delivery_settlement` bank classify.

## Session notes

- **Delivery reports:** `delivery_reports` + `delivery_settlements`; clearing `1410`/`1420`/`1430`; `post_delivery_report()` / `post_delivery_settlement()`; API under `/entities/{id}/delivery/...`; statement classify `delivery_settlement`; Alembic `030`; 289 pytest green
- **POS daily summary:** duplicate-day guard tag `v0.32.1`; 279 pytest
