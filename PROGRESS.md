# PROGRESS

## Current

| Field | Value |
|-------|-------|
| **Phase** | 8.5 — Pre-frontend API hardening |
| **Last completed slice** | Pagination + search + filters (Phase 8.5 Slice 3) |
| **Next slice** | Flexible dates + soft period locks (Phase 8.5 Slice 4) |
| **Branch** | `main` |
| **Last tag** | `v0.47.5-phase8.5-pagination-filters` |

## Resume point

**Phase 8.5 Slice 3 done.** Shared `app/core/listing/` module; all list endpoints return `{items, total, limit, offset}` with `q` (Turkish-aware), `from`/`to`, `min_amount`/`max_amount`, `status`, and relevant `*_id` filters. New `GET /entities/{id}/ledger/entries`. **Next: Slice 4 — flexible dates + soft period locks.**

## Pre-sign-off verification (2026-06-23)

| Check | Result |
|-------|--------|
| Full pytest (Alembic-provisioned test DB) | **444 passed**, 2 skipped |
| `alembic upgrade head` on empty DB | **GREEN** (through `040_journal_amend_links`) |

## Recent

- 2026-06-23 — Pagination + search + filters (`v0.47.5-phase8.5-pagination-filters`, 444 pytest)
- 2026-06-23 — Atomic correct/amend (`v0.47.4-phase8.5-correct-amend`, 438 pytest)
- 2026-06-23 — Idempotency on writes (`v0.47.3-phase8.5-idempotency`, 432 pytest)
- 2026-06-22 — DB provisioning integrity (`v0.47.2-phase8-db-provisioning`, 423 pytest)
- 2026-06-22 — Auth hardening + guard tests (`v0.47.1-phase8-auth-hardening`, 420 pytest)
- 2026-06-22 — Launch readiness / Clerk auth (`v0.47.0-phase8-launch-readiness`, 412 pytest)
