# PROGRESS

## Current

| Field | Value |
|-------|-------|
| **Phase** | 5 — Cash drawer, forex, staff, partner reimbursements, receivables |
| **Last completed slice** | Cash drawer |
| **Next slice** | Forex (FX holdings, conversions) |
| **Branch** | `main` |
| **Last tag** | `ea0867c` / `v0.26.0-phase5-cash-drawer` |

## Resume point

**Cash drawer** done — cash in/out on TRY drawer money accounts (`MoneyAccountKind.CASH` under `1000`); auto-opens per-day session; EOD close compares physical count to GL expected balance; over/short posts Dr/Cr `5400`; day locked after close. **Next:** Forex slice (Decisions §15) — FX wallets by quantity under Cash branch (`1010`/`1020`/`1030`), no online rates.

## Session notes

- **Cash drawer:** `features/cash/` + `core/cash/posting.py`; `JournalEntrySource.CASH_MOVEMENT` / `CASH_DRAWER_CLOSE`; Alembic `023`; 224 pytest green
- **Phase 4 owner sign-off:** tag `v0.25.0-phase4-cc-payment-bank-fee-gl`

## Open questions (Forex slice)

- Whether FX money accounts reuse `MoneyAccountKind.CASH` with currency metadata or need a new kind
- How FX purchase TRY amount is stored (Decisions: quiet safeguard for average cost — separate column vs movement metadata)
