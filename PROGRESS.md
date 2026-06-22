# PROGRESS

## Current

| Field | Value |
|-------|-------|
| **Phase** | 7 — Dashboard, reports, Excel export, financial statements |
| **Last completed slice** | Dashboard |
| **Next slice** | P&L & Balance Sheet |
| **Branch** | `main` |
| **Last tag** | `v0.38.0-phase7-dashboard` |

## Resume point

**Phase 7 Slice 2 done.** Entity dashboard read API `GET /entities/{id}/dashboard?from=&to=` — period sales breakdown (cash/card/delivery/other), expenses, net result, payables preview, receivables, TRY money position, FX wallets (native qty separate), delivery platforms + in-transit clearing (when `delivery_enabled`), needs-review queue counts. **Next:** Phase 7 P&L & Balance Sheet slice.

## Recent

- 2026-06-22 — Dashboard (`v0.38.0-phase7-dashboard`, 339 pytest)
- 2026-06-22 — Delivery sales report (`v0.37.0-phase7-delivery-sales-report`, 326 pytest)
- 2026-06-22 — Expenses + spelling tolerance (`034`, `v0.36.0-phase6-expenses`, 317 pytest)
