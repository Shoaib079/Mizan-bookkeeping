# PROGRESS

## Current

| Field | Value |
|-------|-------|
| **Phase** | Tips treatment fix — Slice B1 complete (card tips via Z report) |
| **Last completed slice** | Slice B1 — card tips via card-terminal Z report + per-entity basis + Needs Review |
| **Next slice** | Slice B2 — commission cadence (`commission_recognition`) + month-end total-clearance sweep; then Slice C — expense-photo OCR |
| **Branch** | `main` |
| **Last tag** | `v0.49.0-pos-card-tips-z-report-slice-b1` |

## Resume point

**Slice B1 complete** (2026-06-24) — restaurants can enter the card-terminal **Z report** on POS confirm (`z_report_kurus`); card tip = `Z − system card sale`, booked per per-entity `card_sale_basis` (`system` pass-through / `z_report` expense / `ask` → Needs Review). Card clearing `1400` always debits the full Z so deposits + the commission sweep clear it to zero. Needs Review guards: `ask` + tip, `tip < 0`, Z with no card sale, `expected_tip_kurus` mismatch. New `JournalEntrySource.POS_CARD_TIP`; migration `046_pos_card_tips_z_report` (additive nullable column). Full suite **506 passed**, 2 skipped. **Money-critical — awaiting owner sign-off.** Next: **Slice B2** — `commission_recognition` setting (per-settlement vs month-end) + month-end total-clearance sweep (`1400` residual → `5300`, idempotent per entity+month); then **Slice C** — expense-photo OCR cash-tip draft.

## Pre-sign-off verification (2026-06-24)

| Check | Result |
|-------|--------|
| Full pytest (Alembic-provisioned test DB) | **506 passed**, 2 skipped |
| `alembic upgrade head` on empty DB | **GREEN** (through `046_pos_card_tips_z_report`) |
| `backend/scripts/verify_fresh_install.sh` | **GREEN** |

## Recent

- 2026-06-24 — Card tips via Z report (Slice B1): per-entity basis + Needs Review (`v0.49.0-pos-card-tips-z-report-slice-b1`, 506 pytest)
- 2026-06-23 — Tips → expense (Slice A): retire 2260/tips subsystem, gross sales (`v0.48.0-tips-expense-slice-a`, 497 pytest)
- 2026-06-23 — Phase 8.6 audit fixes (`v0.47.13` … `v0.47.19`, 501 pytest)
- 2026-06-23 — Period locks review fixes (`v0.47.12`, 483 pytest)
- 2026-06-23 — PDF export review fixes (`v0.47.11`, 473 pytest)
- 2026-06-23 — PDF export — financial statements (`v0.47.10-phase8.5-pdf-export`, 469 pytest)
- 2026-06-23 — Flexible dates + soft period locks (`v0.47.9-phase8.5-period-locks`, 464 pytest)
