# PROGRESS

## Current

| Field | Value |
|-------|-------|
| **Phase** | 8.5 — Pre-frontend API hardening |
| **Last completed slice** | Correct / amend operation (Phase 8.5 Slice 2) |
| **Next slice** | Pagination + filters (Phase 8.5 Slice 3) |
| **Branch** | `main` |
| **Last tag** | `v0.47.4-phase8.5-correct-amend` |

## Resume point

**Phase 8.5 Slice 2 done.** `correct_journal_entry()` atomically voids + posts reversal + corrected entry in one transaction; amend links on `journal_entries`; `LedgerAuditAction.AMEND`; generic `POST .../ledger/entries/{id}/correct` API. Alembic `040_journal_amend_links`. **Next: Slice 3 — pagination + filters on list endpoints.**

## Pre-sign-off verification (2026-06-22)

| Check | Result |
|-------|--------|
| Full pytest (Alembic-provisioned test DB) | **438 passed**, 2 skipped |
| `alembic upgrade head` on empty DB | **GREEN** (through `040_journal_amend_links`) |
| `alembic check` (model drift) | **GREEN** — no new upgrade ops (indexes/uniques hand-managed in migrations) |
| Alembic provisioning tests | RLS on all entity-scoped tables + ledger immutability triggers verified |
| Secrets in git | `.env` gitignored; `.gitignore` covers `.env`, `backend/data/`, `backups/` |
| `pip-audit` (backend deps) | No known high/critical CVEs (prior slice) |

## Recent

- 2026-06-23 — Atomic correct/amend (`v0.47.4-phase8.5-correct-amend`, 438 pytest)
- 2026-06-23 — Idempotency on writes (`v0.47.3-phase8.5-idempotency`, 432 pytest)
- 2026-06-22 — DB provisioning integrity (`v0.47.2-phase8-db-provisioning`, 423 pytest)
- 2026-06-22 — Auth hardening + guard tests (`v0.47.1-phase8-auth-hardening`, 420 pytest)
- 2026-06-22 — Launch readiness / Clerk auth (`v0.47.0-phase8-launch-readiness`, 412 pytest)
- 2026-06-22 — Roles & permissions (`v0.44.0-phase8-roles-permissions`, 389 pytest)
- 2026-06-22 — Excel export (`v0.43.0-phase7-excel-export`, 378 pytest)
- 2026-06-22 — Period comparison (`v0.42.0-phase7-period-comparison`, 371 pytest)
- 2026-06-22 — Per-rate KDV report (`v0.41.0-phase7-kdv-input-report`, 363 pytest)
- 2026-06-22 — Cash flow statement (`v0.40.0-phase7-cash-flow`, 354 pytest)
- 2026-06-22 — P&L & Balance Sheet (`v0.39.0-phase7-pl-balance-sheet`, 347 pytest)
