# PROGRESS

## Current

| Field | Value |
|-------|-------|
| **Phase** | 2 — Suppliers & payables |
| **Last completed slice** | Supplier master (per entity) |
| **Next slice** | Payables ledger & balance |
| **Branch** | `main` |
| **Last tag** | `v0.10.0-phase2-supplier-master` (`63ed5cf`) |

## Resume point

Start Phase 2 — Payables ledger & balance (supplier master complete).

## Session notes

- **Supplier master:** `suppliers` table with RLS; unique `(entity_id, vkn)`; soft deactivate via `is_active=false` (no hard delete)
- **VKN:** 10–11 digit Turkish tax ID; immutable after create
- **API:** `POST/GET/PATCH /entities/{id}/suppliers`, `GET .../suppliers/by-vkn/{vkn}`
- **Isolation:** same VKN allowed across entities; duplicate VKN within entity → HTTP 409
- **Alembic:** `009_suppliers`
- **85 pytest** green
