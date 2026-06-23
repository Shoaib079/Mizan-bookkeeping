# PROGRESS

## Current

| Field | Value |
|-------|-------|
| **Phase** | Tips treatment fix — Slice A complete (tips = expense, gross sales) |
| **Last completed slice** | Slice A — tips liability → cash expense + retire dead code |
| **Next slice** | Slice B (gated) — Z-report ↔ bank total-clearance design + owner sign-off; then Slice C — expense-photo OCR |
| **Branch** | `main` |
| **Last tag** | `v0.48.0-tips-expense-slice-a` |

## Resume point

**Slice A complete** (2026-06-23) — tips are now an **expense from cash** (`Dr 5700 / Cr cash`) and **sales post gross**; the Tips Payable (2260) liability subsystem is fully removed. Migration `045_tips_expense_not_liability` (guarded). Full suite **497 passed**, 2 skipped. **Money-critical — awaiting owner sign-off.** Next: **Slice B** (gated) — confirm total-clearance tolerance/period + per-entity settings, then write the GL/Needs-Review design for owner sign-off before coding; then **Slice C** — `adapters/ocr_ai/expense_photo.py` reads a tip from an expense photo into a `5700` cash-tip draft in Needs Review.

## Pre-sign-off verification (2026-06-23)

| Check | Result |
|-------|--------|
| Full pytest (Alembic-provisioned test DB) | **497 passed**, 2 skipped |
| `alembic upgrade head` on empty DB | **GREEN** (through `045_tips_expense_not_liability`) |
| `backend/scripts/verify_fresh_install.sh` | **GREEN** |

## Recent

- 2026-06-23 — Tips → expense (Slice A): retire 2260/tips subsystem, gross sales (`v0.48.0-tips-expense-slice-a`, 497 pytest)
- 2026-06-23 — Phase 8.6 audit fixes (`v0.47.13` … `v0.47.19`, 501 pytest)
- 2026-06-23 — Period locks review fixes (`v0.47.12`, 483 pytest)
- 2026-06-23 — PDF export review fixes (`v0.47.11`, 473 pytest)
- 2026-06-23 — PDF export — financial statements (`v0.47.10-phase8.5-pdf-export`, 469 pytest)
- 2026-06-23 — Flexible dates + soft period locks (`v0.47.9-phase8.5-period-locks`, 464 pytest)
