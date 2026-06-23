# PROGRESS

## Current

| Field | Value |
|-------|-------|
| **Phase** | 8.5 — Pre-frontend API hardening (complete) |
| **Last completed slice** | PDF export — financial statements (Phase 8.5 Slice 5) |
| **Next slice** | Phase 9 Slice 1 — Auth + entity context (frontend) |
| **Branch** | `main` |
| **Last tag** | `v0.47.12` |

## Resume point

**Phase 8.5 complete.** All five hardening slices done: idempotency, correct/amend, pagination, period locks, PDF export for financial statements. **Next: Phase 9 — Frontend (auth + entity context first).**

## Pre-sign-off verification (2026-06-23)

| Check | Result |
|-------|--------|
| Full pytest (Alembic-provisioned test DB) | **469 passed**, 2 skipped |
| `alembic upgrade head` on empty DB | **GREEN** (through `041_period_locks`) |

## Recent

- 2026-06-23 — PDF export — financial statements (`v0.47.10-phase8.5-pdf-export`, 469 pytest)
- 2026-06-23 — Flexible dates + soft period locks (`v0.47.9-phase8.5-period-locks`, 464 pytest)
- 2026-06-23 — Correct/amend whitelist guard (`v0.47.7-phase8.5-correct-whitelist`, 454 pytest)
- 2026-06-23 — Pagination + search + filters (`v0.47.5-phase8.5-pagination-filters`, 444 pytest)
- 2026-06-23 — Atomic correct/amend (`v0.47.4-phase8.5-correct-amend`, 438 pytest)
- 2026-06-23 — Idempotency on writes (`v0.47.3-phase8.5-idempotency`, 432 pytest)
