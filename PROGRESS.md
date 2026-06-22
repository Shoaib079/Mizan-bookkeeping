# PROGRESS

## Current

| Field | Value |
|-------|-------|
| **Phase** | 8 — Roles & permissions, backups, security hardening, launch |
| **Last completed slice** | Roles & permissions (Phase 8 Slice 1) |
| **Next slice** | Backups |
| **Branch** | `main` |
| **Last tag** | `v0.44.0-phase8-roles-permissions` |

## Resume point

**Phase 8 Slice 1 done.** Entity roles and permission layer — `users` + `entity_memberships` tables; four roles (`owner`, `partner`, `cashier`, `partner_view_only`); extensible `Permission` strings; v1 identity via `X-User-Id` header; `AUTH_ENFORCEMENT` flag (default off, set `true` in production). Financial reports (P&L, balance sheet, cash flow, period comparison + exports) guarded when enforcement on — cashier blocked; dashboard/KDV/delivery sales remain open to cashier. Membership CRUD API. **Phase 7 owner signed off.** **Next:** Backups.

## Recent

- 2026-06-22 — Roles & permissions (`v0.44.0-phase8-roles-permissions`, 389 pytest)
- 2026-06-22 — Excel export (`v0.43.0-phase7-excel-export`, 378 pytest)
- 2026-06-22 — Period comparison (`v0.42.0-phase7-period-comparison`, 371 pytest)
- 2026-06-22 — Per-rate KDV report (`v0.41.0-phase7-kdv-input-report`, 363 pytest)
- 2026-06-22 — Cash flow statement (`v0.40.0-phase7-cash-flow`, 354 pytest)
- 2026-06-22 — P&L & Balance Sheet (`v0.39.0-phase7-pl-balance-sheet`, 347 pytest)
