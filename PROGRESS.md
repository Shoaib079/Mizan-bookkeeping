# PROGRESS

## Current

| Field | Value |
|-------|-------|
| **Phase** | 1 — Ledger core + supplier invoices |
| **Last completed slice** | Double-entry posting service (single boundary) |
| **Next slice** | Audit trail on all changes |
| **Branch** | `main` |
| **Last tag** | `v0.6.0-phase1-ledger-posting` (`a138cd7`) |

## Resume point

After sign-off: implement audit trail on all ledger/chart changes.

## Session notes

- **Ledger posting:** `journal_entries` + `journal_entry_lines`; `post_journal_entry()` in `core/ledger` — single boundary; debits = credits, integer kuruş, entity-stamped; rejects unbalanced/zero/cross-entity/invalid accounts
- **API:** `POST /entities/{id}/ledger/entries`
- **RLS:** journal tables + `accounts_posting_lookup` policy for cross-entity validation inside posting only
- **37 pytest** green
