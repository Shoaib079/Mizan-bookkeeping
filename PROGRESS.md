# PROGRESS

## Current

| Field | Value |
|-------|-------|
| **Phase** | 8.5 — Pre-frontend API hardening |
| **Last completed slice** | Flexible dates + soft period locks (Phase 8.5 Slice 4) |
| **Next slice** | PDF export — financial statements (Phase 8.5 Slice 5) |
| **Branch** | `main` |
| **Last tag** | `v0.47.9-phase8.5-period-locks` |

## Resume point

**Phase 8.5 Slice 4 done.** Go-live date floor on entry dates; soft day/month period locks with owner close/reopen/unlock-write (audited); `dirty` flag when closed periods are touched; central `assert_entry_dates_allowed()` in posting boundary; optional `period_unlock_reason` on mutation payloads; void default date is UTC today. **Next: Slice 5 — PDF export for P&L / balance sheet / cash flow.**

## Pre-sign-off verification (2026-06-23)

| Check | Result |
|-------|--------|
| Full pytest (Alembic-provisioned test DB) | **464 passed**, 2 skipped |
| `alembic upgrade head` on empty DB | **GREEN** (through `041_period_locks`) |

## Recent

- 2026-06-23 — Flexible dates + soft period locks (`v0.47.9-phase8.5-period-locks`, 464 pytest)
- 2026-06-23 — Correct/amend whitelist guard (`v0.47.7-phase8.5-correct-whitelist`, 454 pytest)
- 2026-06-23 — Pagination + search + filters (`v0.47.5-phase8.5-pagination-filters`, 444 pytest)
- 2026-06-23 — Atomic correct/amend (`v0.47.4-phase8.5-correct-amend`, 438 pytest)
- 2026-06-23 — Idempotency on writes (`v0.47.3-phase8.5-idempotency`, 432 pytest)
