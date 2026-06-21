# PROGRESS

## Current

| Field | Value |
|-------|-------|
| **Phase** | 3 — Banking hub + bank statements |
| **Last completed slice** | Opening balances |
| **Next slice** | Phase 4 — POS settlement + credit cards |
| **Branch** | `main` |
| **Last tag** | `v0.20.0-phase3-opening-balances` |

## Resume point

Phase 3 Slice 4 complete: **2026-06-21**. Phase 3 complete pending owner sign-off. Next: **Phase 4 — POS settlement + credit cards**.

## Session notes

- **Opening balances:** `post_opening_balances()` in `core/onboarding/posting.py` — extended validate/post for aggregate codes, `money_account_id` (bank/cash GL sub-accounts), and `supplier_id` (aggregated AP `2000` control line); `3900` equity offset; supplier subledger rows with `journal_entry_id`; one-time post guard; `POST .../opening-balances/post`; optional `go_live_date` entity setting
- **172 pytest** green
