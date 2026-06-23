# PROGRESS

## Current

| Field | Value |
|-------|-------|
| **Phase** | Tips treatment fix — Slice C complete (expense-photo OCR cash-tip) |
| **Last completed slice** | Slice C — expense-photo OCR reads a tip → `5700` cash-tip draft in Needs Review |
| **Next slice** | Phase 9 frontend |
| **Branch** | `main` |
| **Last tag** | `v0.51.0-expense-photo-tip-ocr-slice-c` |

## Resume point

**Slice C complete** (2026-06-24) — expense-photo OCR cash-tip. `adapters/ocr_ai/expense_photo.py` reads a tip off an uploaded receipt photo (fixture registry → UTF-8 text heuristics; Turkish `Bahşiş`/`Servis` + English `Tip`/`Gratuity`; amounts via shared `parse_try_loose`) and the expenses service creates a `5700 Tips Expense` draft in **Needs Review** — review-first, nothing auto-posts. `POST .../expenses/tip-photos` (multipart: file + `money_account_id` + `actor_id`); `POST .../expenses/tip-photos/{id}/confirm` posts `Dr 5700 / Cr cash` via the existing posting boundary (`JournalEntrySource.EXPENSE_ENTRY`, editable amount/account/date on confirm). Per-entity duplicate-photo guard: new nullable `expense_entries.source_document_fingerprint` (+ `source_document_path`) + unique `(entity_id, source_document_fingerprint)`; concurrent-upload race caught → clean 409. No-tip read → zero-amount draft the owner must fill before it can post. Migration `047_expense_source_document` (additive/nullable — manual expenses unchanged; no new `JournalEntrySource`, so no correction/cash-flow/RLS registry changes). Full suite **522 passed**, 2 skipped. **Money-critical — awaiting owner sign-off.** This completes the tips-treatment work (Slices A + B + C). Next: **Phase 9 frontend**.

## Pre-sign-off verification (2026-06-24)

| Check | Result |
|-------|--------|
| Full pytest (Alembic-provisioned test DB) | **522 passed**, 2 skipped |
| `alembic upgrade head` on empty DB | **GREEN** (through `047_expense_source_document`) |
| `backend/scripts/verify_fresh_install.sh` | **GREEN** |

## Recent

- 2026-06-24 — Expense-photo OCR cash-tip (Slice C): photo → 5700 Needs Review draft → confirm Dr 5700/Cr cash (`v0.51.0-expense-photo-tip-ocr-slice-c`, 522 pytest)
- 2026-06-24 — Card commission total clearance (Slice B2): one-button residual → 5300 sweep (`v0.50.0-pos-commission-total-clearance-slice-b2`, 511 pytest)
- 2026-06-24 — Card tips via Z report (Slice B1): per-entity basis + Needs Review (`v0.49.0-pos-card-tips-z-report-slice-b1`, 506 pytest)
- 2026-06-23 — Tips → expense (Slice A): retire 2260/tips subsystem, gross sales (`v0.48.0-tips-expense-slice-a`, 497 pytest)
- 2026-06-23 — Phase 8.6 audit fixes (`v0.47.13` … `v0.47.19`, 501 pytest)
- 2026-06-23 — Period locks review fixes (`v0.47.12`, 483 pytest)
- 2026-06-23 — PDF export review fixes (`v0.47.11`, 473 pytest)
- 2026-06-23 — PDF export — financial statements (`v0.47.10-phase8.5-pdf-export`, 469 pytest)
- 2026-06-23 — Flexible dates + soft period locks (`v0.47.9-phase8.5-period-locks`, 464 pytest)
