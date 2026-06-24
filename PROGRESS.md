# PROGRESS

## Current

| Field | Value |
|-------|-------|
| **Phase** | Phase 9 — frontend (New menu + receipt review in progress) |
| **Last completed slice** | Phase 8.7 D0–D3 — expense receipt OCR + manual daily sales (implementation; awaiting sign-off/tags) |
| **Next slice** | Owner sign-off on Phase 8.7 money-critical slices; Phase 9 read-back lists + Clerk login |
| **Branch** | `main` |
| **Last tag** | `v0.51.0-expense-photo-tip-ocr-slice-c` |

## Resume point

**Phase 8.7 + Phase 9 core (2026-06-24)** — implemented per plan `.cursor/plans/expense_ocr_+_add_menu_a4ddb775.plan.md`:

- **Backend:** migration `048`, `expense_receipt_intakes` + lines, `POST /expense-receipts` upload/confirm/reject, `expense_receipt.py` OCR adapter, `POST /pos/manual-daily-sales`, `tip-photos` folded into unified intake wrapper.
- **Frontend:** sidebar **New** menu (manual expense, manual daily sales, receipt upload), receipt review at `/review/receipts/[id]`.

**Awaiting:** owner sign-off on money-critical backend slices; version tags `v0.52.0` … `v0.55.0`; commit when requested.

## Pre-sign-off verification (2026-06-24)

| Check | Result |
|-------|--------|
| Full pytest (Alembic-provisioned test DB) | **533 passed**, 2 skipped (incl. `test_expense_receipt`, `test_manual_daily_sales`) |
| `alembic upgrade head` on empty DB | **GREEN** (through `048_expense_receipt_intake`) |
| Frontend `npm run build` | **GREEN** |

## Recent

- 2026-06-24 — **IMPLEMENTED** Phase 8.7 D0–D3 + Phase 9 New menu + receipt review (uncommitted; awaiting sign-off/tags)
- 2026-06-24 — **PLANNED** Phase 8.7 + Phase 9 New menu — plan + ROADMAP
- 2026-06-24 — Expense-photo OCR cash-tip (Slice C): tip-only stub (`v0.51.0-expense-photo-tip-ocr-slice-c`, 522 pytest; awaiting sign-off)
