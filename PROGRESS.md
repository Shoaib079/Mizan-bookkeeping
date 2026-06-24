# PROGRESS

## Current

| Field | Value |
|-------|-------|
| **Phase** | Phase 9 — frontend |
| **Last completed slice** | Phase 9 read-back lists + Clerk login (`v0.56.0`) |
| **Next slice** | Phase 9 Slice 3 — Suppliers & payables; owner sign-off on money-critical Phase 8.7 slices |
| **Branch** | `main` |
| **Last tag** | `v0.56.0-phase9-readback-clerk` |

## Resume point

**Phase 8.7 + Phase 9 core (2026-06-24)** — committed `d2a624b`, tags `v0.52.0` … `v0.55.0`:

- **Backend:** migration `048`, expense receipt intake/OCR, manual daily sales, `tip-photos` wrapper.
- **Frontend:** sidebar **New** menu, receipt review at `/review/receipts/[id]`.

**In progress:** Phase 9 Slice 3 — Suppliers & payables UI.

**Awaiting:** owner sign-off on money-critical backend slices (Phase 8.7 D1–D3, tips A/B/C).

## Pre-sign-off verification (2026-06-24)

| Check | Result |
|-------|--------|
| Full pytest (Alembic-provisioned test DB) | **533 passed**, 2 skipped (incl. `test_expense_receipt`, `test_manual_daily_sales`) |
| `alembic upgrade head` on empty DB | **GREEN** (through `048_expense_receipt_intake`) |
| Frontend `npm run build` | **GREEN** |

## Recent

- 2026-06-24 — **DONE** Phase 9 read-back lists + Clerk login (`v0.56.0-phase9-readback-clerk`, 535 pytest)
- 2026-06-24 — **DONE** Phase 8.7 D0–D3 + Phase 9 New menu + receipt review (`d2a624b`, `v0.52.0`–`v0.55.0`)
- 2026-06-24 — **PLANNED** Phase 8.7 + Phase 9 New menu — plan + ROADMAP
- 2026-06-24 — Expense-photo OCR cash-tip (Slice C): tip-only stub (`v0.51.0-expense-photo-tip-ocr-slice-c`, 522 pytest; awaiting sign-off)
