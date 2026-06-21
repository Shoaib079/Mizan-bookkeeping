# PROGRESS

## Current

| Field | Value |
|-------|-------|
| **Phase** | 3 — Banking hub + bank statements |
| **Last completed slice** | Transfer linking (own-account) |
| **Next slice** | Opening balances |
| **Branch** | `main` |
| **Last tag** | `v0.19.0-phase3-transfer-linking` |

## Resume point

Phase 3 Slice 3 complete: **2026-06-21**. Next: **Opening balances**.

## Session notes

- **Transfer linking:** `post_account_transfer()` in `core/banking/posting.py` — Dr destination asset GL, Cr source asset GL (`JournalEntrySource.TRANSFER`); `account_transfers` with statement line FKs; classify outflow posts transfer; inflow links existing outflow transfer (same amount/date/counterpart) or posts if none; manual `POST/GET .../banking/transfers`; Alembic `017`
- **160 pytest** green
