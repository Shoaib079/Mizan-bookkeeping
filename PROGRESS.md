# PROGRESS

## Current

| Field | Value |
|-------|-------|
| **Phase** | 7 — Dashboard, reports, Excel export, financial statements |
| **Last completed slice** | P&L & Balance Sheet |
| **Next slice** | Cash flow statement |
| **Branch** | `main` |
| **Last tag** | `v0.39.0-phase7-pl-balance-sheet` |

## Resume point

**Phase 7 Slice 3 done.** P&L `GET /entities/{id}/reports/profit-and-loss?from=&to=` and Balance Sheet `GET /entities/{id}/reports/balance-sheet?as_of=` — posted GL only, natural-sign balances via `core/ledger/balances.py`, unclosed net income on equity section. **Next:** Phase 7 Cash flow statement slice.

## Recent

- 2026-06-22 — P&L & Balance Sheet (`v0.39.0-phase7-pl-balance-sheet`, 347 pytest)
- 2026-06-22 — Dashboard (`v0.38.0-phase7-dashboard`, 339 pytest)
- 2026-06-22 — Delivery sales report (`v0.37.0-phase7-delivery-sales-report`, 326 pytest)
- 2026-06-22 — Expenses + spelling tolerance (`034`, `v0.36.0-phase6-expenses`, 317 pytest)
