# PROGRESS

## Current

| Field | Value |
|-------|-------|
| **Phase** | 1 — Ledger core + supplier invoices |
| **Last completed slice** | Ledger immutability, void/reverse, audit trail |
| **Next slice** | Basic manual journals |
| **Branch** | `main` |
| **Last tag** | `v0.7.0-phase1-ledger-void-audit` (pending commit) |

## Resume point

After sign-off: implement basic manual journals UI/API slice.

## Session notes

- **Immutability:** posted `journal_entries` / lines cannot be edited or deleted (ORM events + PostgreSQL triggers); void metadata updates only via `void_journal_entry`
- **Void/reverse:** `void_journal_entry()` posts balanced reversing entry linked via `reverses_entry_id` / `reversed_by_entry_id`; original marked `voided`
- **Audit:** `ledger_audit_events` records post/void with `actor_id`, timestamp, optional reason; entity-scoped RLS
- **API:** `POST /entities/{id}/ledger/entries` (requires `actor_id`); `POST /entities/{id}/ledger/entries/{entry_id}/void`
- **Alembic:** `005_ledger_void_audit`
- **44 pytest** green
