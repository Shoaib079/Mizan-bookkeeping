# PROGRESS

## Current

| Field | Value |
|-------|-------|
| **Phase** | Phase 9 — frontend; Phase 8.8 adversarial follow-ups (H5 remains) |
| **Last completed slice** | Phase 8.8 H4 — card-tip day ops guidance (`v0.58.3-phase8.8-h4-z-ops-guidance`) |
| **Next slice** | Phase 8.8 H5 — docs dedup; Phase 9 Slice 3 — Suppliers & payables |
| **Branch** | `main` |
| **Last tag** | `v0.58.3-phase8.8-h4-z-ops-guidance` |

## Resume point

**Owner sign-off complete (2026-06-21)** — money-critical slices approved:

- Tips Slice A (`v0.48.0`), B2 (`v0.50.0`), C (`v0.51.0`); B1 (`v0.49.0`) superseded by `v0.57.0`
- Phase 8.7 D1–D3 (`v0.52.0`–`v0.54.0`, `d2a624b`)
- Phase 9 New menu + receipt review (`v0.55.0`), read-back + Clerk (`v0.56.0`)
- Z match-or-review (`v0.57.0`, `a6dd4e6`)

**Next:** Phase 8.8 H5 — docs dedup. Phase 9 Slice 3 — Suppliers & payables UI.

## Verification (2026-06-24 — H4)

| Check | Result |
|-------|--------|
| Full pytest (Alembic-provisioned test DB) | **543 passed**, 2 skipped |
| `backend/scripts/verify_fresh_install.sh` | **GREEN** |

## Verification (2026-06-24 — H3)

| Check | Result |
|-------|--------|
| Full pytest (Alembic-provisioned test DB) | **542 passed**, 2 skipped |
| `backend/scripts/verify_fresh_install.sh` | **GREEN** |

## Verification (2026-06-24 — H2)

| Check | Result |
|-------|--------|
| Full pytest (Alembic-provisioned test DB) | **538 passed**, 2 skipped |
| `backend/scripts/verify_fresh_install.sh` | **GREEN** |

## Verification (2026-06-24 — H1)

| Check | Result |
|-------|--------|
| Full pytest (Alembic-provisioned test DB) | **536 passed**, 2 skipped |
| `backend/scripts/verify_fresh_install.sh` | **GREEN** |

## Pre-sign-off verification (2026-06-21)

| Check | Result |
|-------|--------|
| Full pytest (Alembic-provisioned test DB) | **535 passed**, 2 skipped |
| `alembic upgrade head` on empty DB | **GREEN** (through `048_expense_receipt_intake`) |
| `backend/scripts/verify_fresh_install.sh` | **GREEN** |
| Frontend `npm run build` | **GREEN** |

## Recent

- 2026-06-24 — **Phase 8.8 H3** — expense receipt test gaps (`v0.58.2-phase8.8-h3-expense-receipt-guards`, 542 pytest)
- 2026-06-24 — **Phase 8.8 H2** — tips expense cash-only at API (`v0.58.1-phase8.8-h2-tips-cash-only`, 538 pytest)
- 2026-06-24 — **Phase 8.8 H1** — commission sweep timing guard (`v0.58.0-phase8.8-h1-commission-sweep-guard`, 536 pytest)
- 2026-06-21 — **Owner sign-off** — tips A/B2/C, Phase 8.7, Phase 9 core, Z (`v0.57.1-owner-sign-off`)
- 2026-06-24 — Z match-or-review — no POS tip posting (`v0.57.0-pos-z-match-or-review`, 534 pytest)
- 2026-06-24 — Phase 9 read-back lists + Clerk login (`v0.56.0-phase9-readback-clerk`, 535 pytest)
- 2026-06-24 — Phase 8.7 D0–D3 + Phase 9 New menu + receipt review (`d2a624b`, `v0.52.0`–`v0.55.0`)
