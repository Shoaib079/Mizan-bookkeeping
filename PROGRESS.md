# PROGRESS

## Current

| Field | Value |
|-------|-------|
| **Phase** | 3 — Banking hub + bank statements |
| **Last completed slice** | Near-match payment/transfer detection |
| **Next slice** | Phase 4 — POS settlement + credit cards |
| **Branch** | `main` |
| **Last tag** | `v0.21.0-phase3-near-match-review` |

## Resume point

Phase 3 complete pending owner sign-off. **Near-match slice approved 2026-06-21** — commit `v0.21.0-phase3-near-match-review`. Next: **Phase 4 — POS settlement + credit cards**.

## Session notes

- **Opening balances:** `post_opening_balances()` in `core/onboarding/posting.py` — extended validate/post for aggregate codes, `money_account_id` (bank/cash GL sub-accounts), and `supplier_id` (aggregated AP `2000` control line); `3900` equity offset; supplier subledger rows with `journal_entry_id`; one-time post guard; `POST .../opening-balances/post`; optional `go_live_date` entity setting
- **Near-match detection:** ±3 day window; exact date auto-link; near-match → `needs_review` (no second GL post); confirm via `confirm_supplier_ledger_entry_id` / `confirm_account_transfer_id`; Alembic `018`
- **GL posting policy:** ROADMAP + DECISIONS table — all real-event classifications must post in their slice (`bank_fee` etc. deferred to Phase 4+)
- **179 pytest** green
