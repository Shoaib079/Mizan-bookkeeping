# PROGRESS

## Current

| Field | Value |
|-------|-------|
| **Phase** | Tips treatment fix — Slice B2 complete (card commission total clearance) |
| **Last completed slice** | Slice B2 — card commission total-clearance sweep (residual → 5300, one button) |
| **Next slice** | Slice C — expense-photo OCR cash-tip draft |
| **Branch** | `main` |
| **Last tag** | `v0.50.0-pos-commission-total-clearance-slice-b2` |

## Resume point

**Slice B2 complete** (2026-06-24) — card commission via **total clearance**, zero config. Both banks' card deposits land in the one `1400` clearing account; the leftover after net deposits **is** the commission. One button `POST .../pos/clearing-reconciliation/clear-commission` books the current `1400` residual → `5300` and zeros clearing; repeatable; rejects zero/negative. The `commission_recognition` cadence setting was **dropped** per owner ("keep it automatic"); **no migration**. New `JournalEntrySource.POS_COMMISSION_SWEEP`. Full suite **511 passed**, 2 skipped. **Money-critical — awaiting owner sign-off.** This completes Slice B (card tips B1 + commission B2). Next: **Slice C** — `adapters/ocr_ai/expense_photo.py` reads a tip from an expense photo into a `5700` cash-tip draft in Needs Review.

## Pre-sign-off verification (2026-06-24)

| Check | Result |
|-------|--------|
| Full pytest (Alembic-provisioned test DB) | **511 passed**, 2 skipped |
| `alembic upgrade head` on empty DB | **GREEN** (through `046_pos_card_tips_z_report`) |
| `backend/scripts/verify_fresh_install.sh` | **GREEN** |

## Recent

- 2026-06-24 — Card commission total clearance (Slice B2): one-button residual → 5300 sweep (`v0.50.0-pos-commission-total-clearance-slice-b2`, 511 pytest)
- 2026-06-24 — Card tips via Z report (Slice B1): per-entity basis + Needs Review (`v0.49.0-pos-card-tips-z-report-slice-b1`, 506 pytest)
- 2026-06-23 — Tips → expense (Slice A): retire 2260/tips subsystem, gross sales (`v0.48.0-tips-expense-slice-a`, 497 pytest)
- 2026-06-23 — Phase 8.6 audit fixes (`v0.47.13` … `v0.47.19`, 501 pytest)
- 2026-06-23 — Period locks review fixes (`v0.47.12`, 483 pytest)
- 2026-06-23 — PDF export review fixes (`v0.47.11`, 473 pytest)
- 2026-06-23 — PDF export — financial statements (`v0.47.10-phase8.5-pdf-export`, 469 pytest)
- 2026-06-23 — Flexible dates + soft period locks (`v0.47.9-phase8.5-period-locks`, 464 pytest)
