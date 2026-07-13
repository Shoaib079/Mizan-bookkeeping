# BUGLOG

Bugs: symptom, root cause, fix, guarding test (see CURSOR_RULES.md §8).

## 2026-07-13 — "Clear bank commission" dumped the whole clearing residual as Bank Charges (184k)

**Symptom:** Bank Charges (5300) jumped to 184,628.82 ₺ after clicking "Clear bank commission" on the card-clearing page. Real commission was ~20k.

**Root cause:** the sweep (`post_card_commission_clearance`) books the **entire** card-clearing (1400) balance to commission, assuming the residual is commission. The residual was mostly **undeposited card sales** — including days recorded **twice** (a manual daily-sales batch *and* a POS-daily-summary batch for the same date), which double-counted revenue into clearing. So the sweep dumped ~184k of not-yet-deposited sales as an expense.

**Fix:** (1) the sweep entry is now **voidable from the General Ledger** (added `pos_commission_sweep` to a void-safe set; the generic ledger void reverses Dr 1400 / Cr 5300). (2) **Card sales batches** list gained a status column + **Void** so duplicate live batches can be removed (guards: POS-summary batches route to the daily-summary void; already-settled batches require the settlement voided first). (3) **Large-amount guard**: `clear_card_commission` raises `SuspiciousClearanceAmountError` (→ 409, confirm dialog) when the residual exceeds ~10% of card sales. **Owner data cleanup:** void the 184k sweep, void duplicate batches, classify the missing card deposits.

**Guarding test:** ⚠️ pending — owner to add `test_clear_commission_guard` + card-sales-batch void tests; `tsc`/`py_compile` clean this session, backend pytest not run in sandbox.

## 2026-07-13 — Edit forms opened as a fresh entry (wrong amount sign + wrong account)

**Symptom:** Editing a customer payment showed the amount as `−13.200` (which also blocked saving, since the form requires a positive amount), and "Received into" defaulted to the first account in the list rather than the account actually used — easy to save a mistake (wrong bank).

**Root cause:** correction forms prefilled the **signed ledger value** and reset the account selector to `accounts[0]`; the payment's money account wasn't exposed on the ledger read at all.

**Fix:** prefill `Math.abs(amount)` across the correct-* forms; new backend helper resolves the money account off the payment's journal line and exposes `payment_account_id` (customer/supplier/staff/partner + supplier activity) and `try_cash_money_account_id` (FX purchase); forms restore the recorded account (and, for customer FX payments, the forex amount + derived rate).

**Guarding test:** ⚠️ pending — owner to add read-exposes-payment-account tests per subledger; `tsc`/`py_compile` clean, backend pytest not run in sandbox.

## 2026-07-13 — "In transit" showed a phantom residual after a net-bank commission sweep

**Symptom:** After clearing commission, the card-clearing card showed a non-zero "In transit" even though the actual clearing balance was zero.

**Root cause:** `in_transit_kurus` was computed as `total_card_sales − total_settled_gross` (subledger), which ignores commission recognised by the sweep (Cr 1400 with no settlement row) and counted voided rows.

**Fix:** `get_clearing_reconciliation` now derives `in_transit_kurus` from the **GL clearing balance** (which nets sales − deposits − sweeps), and the sales/settled totals **exclude voided** batches/settlements. In-transit and clearing balance always agree now.

**Guarding test:** ⚠️ pending — existing `test_card_sales_reconciliation` assertions still hold (their scenarios have in-transit == clearing balance); add a post-sweep case. Backend pytest not run in sandbox.

## 2026-06-23 — Tips recorded as a liability instead of an expense

**Symptom:** Tips were booked to `2260 Tips Payable` (a pass-through liability) and the POS confirm carved tips out of sales revenue, so both the tip and the underlying sale were understated/mismodelled. Owner's real workflow: a tip is taken from the drawer and paid to staff immediately and written on the expense list — it is an expense, and sales are gross.

**Root cause:** Phase 6 modelled tips as a pass-through liability (`tip_accruals`/`tip_payouts` → `2260`), and Phase 8.6 Item 4 added a POS revenue carve-out to the same liability — both based on an incorrect product assumption.

**Fix (Slice A):** Tips are an **expense from cash** (`Dr 5700 Tips Expense / Cr cash`) via the existing expenses pipeline; sales post **gross**. Removed the entire Tips Payable subsystem (account `2260`, `tip_accruals`/`tip_payouts`, `features/tips/`, `core/tips/posting.py`, tips router, `JournalEntrySource.TIP_*` + correction registry, control-account tie, RLS, cash-flow wiring, POS `tips_kurus` carve-out). Migration `045_tips_expense_not_liability` drops the tables/column, removes `2260`, seeds `5700` — guarded to abort if any tip rows or `2260` postings exist (never hard-delete real financial data; reverse via the posting boundary instead).

**Guarding test:** `test_tips.py::test_tip_posts_dr_5700_cr_cash` (Dr 5700 / Cr cash, no 2260), `test_default_chart.py::test_default_chart_includes_tips_expense_not_payable`, `test_pos_daily_summary.py` gross-revenue assertions, migration guard in `045`. Tag `v0.48.0-tips-expense-slice-a`. **Money-critical — owner sign-off required.**

## 2026-06-23 — Fresh `pip install -e ".[dev]"` failed on clean machine

**Symptom:** On a new venv, `pip install -e ".[dev]"` in `backend/` failed with setuptools error: *Multiple top-level packages discovered in a flat-layout: `app`, `data`, `alembic`*.

**Root cause:** Default setuptools package discovery treated `alembic/` (migrations) and `data/` (fixtures) as installable top-level packages alongside `app/`.

**Fix:** `backend/pyproject.toml` — `[tool.setuptools.packages.find] include = ["app*"]` so only the application package is installed.

**Guarding test:** `backend/scripts/verify_fresh_install.sh` + `.github/workflows/ci.yml` (clean venv, `pip install -e ".[dev]"`, boot, full pytest).

## 2026-06-23 — Staff advance applied twice on partial salary payments

**Symptom:** Accrue 100k, advance 50k, pay 30k then 20k — both 1300 and 2250 showed −50k wrongly.

**Root cause:** `SALARY_PAYMENT` recorded only cash paid; `outstanding_advance_minor` never reduced on apply.

**Fix:** `ADVANCE_APPLIED` movement; full payable clearance on payment; FX path aligned.

**Guarding test:** `test_partial_salary_payment_applies_advance_only_once`, staff tie test. Tag `v0.47.14`. **Money-critical — owner sign-off.**

## 2026-06-23 — Payables adjustments posted without GL

**Symptom:** ADJUSTMENT/OPENING_BALANCE via API with `journal_entry_id=None`.

**Root cause:** Subledger API bypassed posting boundary.

**Fix:** `post_supplier_manual_movement()` with GL counterpart. Tag `v0.47.15`. **Money-critical — owner sign-off.**

## 2026-06-23 — POS daily totals double-counted tips as revenue

**Symptom:** Full total credited to 4000 while tips also hit 2260.

**Root cause:** No tips at intake; gross posted to revenue.

**Fix:** `tips_kurus` intake; revenue = total − tips at confirm. Tag `v0.47.17`. **Money-critical — owner sign-off.**

## 2026-06-23 — POS/delivery settlements not idempotent

**Symptom:** Duplicate settlement posts / re-classify could double-count.

**Fix:** UNIQUE batch id + dedup + bank link-existing. Tag `v0.47.16`.

## 2026-06-23 — FX purchase classified as operating cash flow

**Fix:** Investing bucket + registry guard. Tag `v0.47.18`.

## 2026-06-23 — Subledger immutability not registry-guarded

**Fix:** `IMMUTABLE_SUBLEDGER_TABLES` + raw SQL tests. Tag `v0.47.19`.

## 2026-06-23 — Period lock audit trail mutable at database layer

**Symptom:** `period_lock_audit_events` and `period_locks` had no append-only/delete protection unlike ledger audit tables.

**Root cause:** Slice 4 added tables but did not extend the canonical immutability trigger tail; no registry guard for audit tables.

**Fix:** `IMMUTABLE_AUDIT_TABLES` registry + `apply_audit_immutability()` (append-only on all `*_audit_events` tables); `period_locks_no_delete` trigger; migration `042_period_lock_immutability`; table-existence checks so migration 038 can run before period-lock tables exist.

**Guarding test:** `test_immutable_audit_registry_covers_all_audit_tables`, `test_immutable_audit_tables_have_append_only_triggers`, `test_period_locks_table_has_delete_protection_trigger` in `test_security_invariants.py`; provisioning tests in `test_db_provisioning.py`; raw SQL tests in `test_period_locks.py`.

## 2026-06-23 — FastAPI file-upload routes missing runtime dependency

**Symptom:** After editable install, importing the app or hitting upload endpoints failed with FastAPI’s `python-multipart` requirement error.

**Root cause:** `python-multipart` was not listed in `[project] dependencies` despite multipart/form upload routes (invoices, POS, bank statements, etc.).

**Fix:** `backend/pyproject.toml` — added `python-multipart>=0.0.9` to `dependencies`.

**Guarding test:** Manual — empty venv install then `uvicorn app.main:app` or pytest suite (upload tests exercise multipart).

## 2026-06-23 — PDF export top-level reportlab import broke fresh install / test collection

**Symptom:** With `reportlab` missing or not yet installed, `import app.main` and full pytest collection failed because `pdf_export.py` imported reportlab at module top and `api.py` imported `pdf_export` at module top.

**Root cause:** Optional-feeling PDF dependency wired as a hard import-time dependency on the entire API.

**Fix:** Lazy-import reportlab inside PDF build functions only (`_require_reportlab()`). Bundle DejaVu Sans TTF fonts in `app/assets/fonts/` for Unicode (₺, ğ, ı, İ, ş); `assert_text_renderable()` fails loudly on missing glyphs. Bold totals use `DejaVuSans-Bold`.

**Guarding test:** `test_pdf_export_has_no_top_level_reportlab_import`, `test_bundled_pdf_fonts_ship_with_package`, `test_app_main_imports_after_editable_install` in `test_security_invariants.py`; `test_pdf_renders_turkish_entity_name_and_glyphs` + strict ₺ assertions in `test_pdf_export.py`; `backend/scripts/verify_fresh_install.sh` + `.github/workflows/ci.yml`.
