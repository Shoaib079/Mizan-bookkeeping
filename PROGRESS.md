# PROGRESS

## Current

| Field | Value |
|-------|-------|
| **Phase** | 1 — Ledger core + supplier invoices |
| **Last completed slice** | Basic manual journals |
| **Next slice** | Read e-Fatura invoice (PDF) into draft |
| **Branch** | `main` |
| **Last tag** | `v0.8.0-phase1-manual-journals` (pending commit) |

## Resume point

After sign-off: implement read e-Fatura invoice (PDF) into draft slice.

## Session notes

- **Manual journals:** `JournalEntrySource` on `journal_entries` (`manual`, `opening_balance`, `invoice`, `system`); manual flow stamps `manual`; void reversals stamp `system`
- **API:** `POST/GET /entities/{id}/manual-journals`, `GET .../{entry_id}`, `POST .../{entry_id}/void`; list filters `status`, `from`, `to`; lines include account code/name
- **Posting:** `post_journal_entry(..., source=...)` required; single boundary unchanged
- **Deprecated:** `POST /entities/{id}/ledger/entries` removed — use manual-journals; ledger void route retained
- **Alembic:** `007_journal_entry_source`
- **59 pytest** green
