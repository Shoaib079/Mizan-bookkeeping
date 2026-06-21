# PROGRESS

## Current

| Field | Value |
|-------|-------|
| **Phase** | 5 — Cash drawer, forex, staff, partner reimbursements, receivables |
| **Last completed slice** | Phase 4 complete (owner signed off) |
| **Next slice** | Cash drawer (Phase 5 Slice 1) |
| **Branch** | `main` |
| **Last tag** | `9a8a927` / `v0.25.0-phase4-cc-payment-bank-fee-gl` |

## Resume point

Phase 4 owner sign-off recorded. Active work: **Phase 5 Slice 1 — Cash drawer** (Decisions §14): cash movements on TRY drawer money accounts, EOD close with physical count vs GL expected balance, over/short posts to `5400`, day locked on close. Cash money accounts under `1000` already exist from Phase 3.

## Session notes

- **Phase 4 owner sign-off:** All four slices done; tag `v0.25.0-phase4-cc-payment-bank-fee-gl`; 215 pytest green
- **Phase 5 Slice 1 (cash drawer):** In progress — `features/cash/`, `core/cash/posting.py`, Alembic `023`
