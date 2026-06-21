# PROGRESS

## Current

| Field | Value |
|-------|-------|
| **Phase** | 3 — Banking hub + bank statements |
| **Last completed slice** | Bank/cash account tree (Phase 3) |
| **Next slice** | Statement import & classify |
| **Branch** | `main` |
| **Last tag** | `v0.17.0-phase3-bank-cash-tree` |

## Resume point

Phase 2 owner sign-off: **2026-06-21**. Phase 3 Slice 1 complete: **2026-06-21**. Next: **Statement import & classify**.

## Session notes

- **Bank/cash account tree:** `money_accounts` table + `accounts.parent_account_id`; GL sub-accounts under `1100` (bank) / `1000` (cash) with auto codes `1101+` / `1001+`; `features/banking/` service + API; tree endpoint with child balances and parent rollup; Alembic `015`
- **API:** `POST/GET/PATCH /entities/{id}/banking/accounts`, `GET .../tree`; create requires seeded chart
- **Posting:** `post_supplier_payment()` accepts named bank sub-account GL ids; aggregate `1100`/`1000` remain valid
- **143 pytest** green
