# PROGRESS

## Current

| Field | Value |
|-------|-------|
| **Phase** | 1 — Ledger core + supplier invoices |
| **Last completed slice** | Chart of accounts + entity scoping |
| **Next slice** | Double-entry posting service (single boundary) |
| **Branch** | `main` |
| **Last tag** | *(this commit — v0.5.0-phase1-chart-of-accounts)* |

## Resume point

After sign-off: implement `core/ledger` posting service — debits = credits, entity-scoped, single boundary.

## Session notes

- **Chart of accounts:** `accounts` table with RLS; `POST/GET /entities/{id}/chart-of-accounts`; seed from default chart (22 accounts)
- **27 pytest** green
