# BUGLOG

Bugs: symptom, root cause, fix, guarding test (see CURSOR_RULES.md §8).

## 2026-07-29 — Period comparison compared a month against the wrong dates

**Symptom:** Reports → Period comparison for **01.07.2026 – 31.07.2026** showed *"Prior: 31.05.2026 – 30.06.2026"*. Owner: *"prior month date must be 01.06 to 30.06 not 31.05 thats not month."*

**Root cause:** `_prior_period` shifted back by the **same number of days** as the current range. July is 31 days, so it stepped back 31 days from 30 June and landed on 31 May. Equal-length is a sound rule for an arbitrary window and the wrong one for a calendar month, because **months are not equal length**. The same flaw would have shifted a whole-year comparison by a day whenever a leap year was involved.

**Fix:** `_prior_period` now recognises calendar periods.
- **Whole calendar month → the previous whole calendar month.** Derived as `from_date − 1 day` (the last day of the previous month) then `.replace(day=1)`, so February, leap years and the January→December rollover all come out right without special cases.
- **Whole calendar year → the previous whole calendar year.**
- **Anything else keeps the equal-length window** — there is no calendar answer for 1–15 July, so same-length-immediately-before remains the only defensible rule.

`is_whole_month` / `is_whole_year` are exported so the intent is testable rather than buried in a branch. The explicit `prior_from` / `prior_to` query params already on the API are unaffected — they still override everything.

**Two existing tests asserted the buggy behaviour** (`prior_from == 2026-01-29` in both the service and API tests) and were updated; a second test was added alongside to keep the equal-length rule covered for partial ranges.

**Guarding test:** `backend/tests/test_prior_period.py` (14, pure date logic — no DB): the reported case, March→short February, leap February, January→December, whole year, partial month, arbitrary window, single day, and an invariant that the prior period never overlaps the current one.

## 2026-07-29 — Staff net position counted the advance twice

**Symptom:** An employee's card read **Net position −5.460,00 ₺** with "Salary owed −2.730,00" and "Advance held −2.730,00", while the ledger's own running balance ended at **−2.730,00**. Owner: *"they do not match… in summary i only owe 2730 not 5400 smth."*

**Root cause:** the card computed `netPosition = balance_minor − outstanding_advance_minor`. But `balance_minor` is `current_balance_minor`, which **sums every staff ledger row including `ADVANCE_PAID`** — so the advance was already in it. Subtracting it again deducted the same 2.730 twice. The "Salary owed" line compounded the confusion by showing `balance_minor` (the net figure) under a label that means something else entirely.

The data was never wrong; `balance_minor` was correct all along, and the staff **directory** column — which shows `balance_minor` raw — has always been right. Only the detail card mis-assembled it.

**Fix:** `lib/staff-net-position.ts`.
- **Net position = `balance_minor`.** It already nets everything; nothing more to do to it.
- **Salary owed = `remaining_accrual_minor`** — accrued less paid, advances excluded. This field was already on the API and simply wasn't being used.
- **Less advance held = `outstanding_advance_minor`.**
- **The two lines are components, not a complete decomposition.** Incentives, directly-paid extra days and opening balances move the balance without belonging to either, so the card computes the residual and shows an **"Other movements"** line when it isn't zero, rather than presenting a subtraction that doesn't add up.
- Added a caption under the figure — "The employee holds this much of your money" / "You owe this to the employee" — because a signed number alone never made the direction obvious.

**Guarding test:** `frontend/src/lib/staff-net-position.test.ts` (7), including this exact reproduction (0 owed, 2.730 advance, −2.730 net) and the Latif case (13.440 owed against a 13.440 advance nets to zero while both components stay visible).

## 2026-07-27 — Money in with no home: bank accounts could never reach "Reconciled"

**Symptom:** Certain inflows on an imported bank statement — bank interest, a supplier refund, an insurance payout, an owner depositing miscellaneous income — had **no classification that fit**. The line sat in the review queue permanently, so `unreconciled_count` never hit 0 and the account never showed as reconciled on Reports → Bank reconciliation.

**Root cause (audit, 2026-07-27):** the classification chart was **asymmetric**. All 21 classifications are reachable and direction is enforced both in the UI (`classificationOptionsForAmount`) and server-side (21 validations) — that part was sound. But of the options, **13 outflow classifications had a catch-all** (`rent_utility` = "Expense from bank", pick any expense GL) while the **7 inflow classifications had none**. Every outflow could always be booked somewhere; an inflow that wasn't a customer payment, card settlement, delivery settlement, loan receipt or partner contribution had nowhere to go.

**Fix:** added `other_income` — "Income to bank", the inflow twin of "Expense from bank". Posts `Dr bank / Cr chosen income account`.
- `StatementLineClassification.OTHER_INCOME` (`statement_models.py`)
- `build_bank_income_posting_lines` / `_validate_income_gl_account` / `post_bank_income` (`core/banking/statement_posting.py`)
- Validation branch requires an **inflow**, an `actor_id`, and an `income_account_id` (`statements.py`)
- **The income account must be a revenue account.** Crediting an expense would silently record a refund; crediting a liability would hide the income entirely. Enforced server-side, and the picker only offers revenue accounts (`filterRevenueAccounts`).
- **Second bug found while wiring:** `correct_statement_line` accepted `income_account_id` but **dropped it** when delegating to `classify_statement_line`, so every *correction* to other_income would have failed with "income_account_id is required". Fixed and covered.
- Frontend: option in `STATEMENT_CLASSIFICATION_OPTIONS` (`direction: "inflow"`, `target: "income"`), `incomeAccounts` on the pickers hook, and the picker wired into classify row, classify bar, review row and bulk bar.

**Deliberate asymmetry with expenses:** the income picker has **no first-in-list default**, unlike the expense picker. The first revenue account is Sales Revenue, so a silent default would book bank interest as food sales and quietly inflate the top line. The user must pick.

**Guarding tests:** `backend/tests/test_statement_other_income.py` (5: Dr bank / Cr income shape, outflow rejected, missing account rejected, non-revenue account rejected, correction keeps the account) and `frontend/src/lib/statement-other-income.test.ts` (8). ✅ **Backend pytest run green by owner 2026-07-27** (sandbox can't run it — Python 3.11 + Postgres absent). `tsc` + 546 frontend tests + `py_compile` also green.

## 2026-07-13 — Staff advance can't be applied against extra-days owed (OPEN — handed to Cursor)

**Symptom:** Outstanding advance grows and can never be netted, even at 0-cash payment. India Gate / "Latif Coşgun": staff balance 170 ₺ but outstanding advance 13.515 ₺ = 75 (23.05 excess) + 13.440 (08.06). Owner owes 13.440 for extra days AND holds a 13.440 advance; they offset on the balance but sit gross with no way to net them.

**Root cause (diagnosed 2026-07-13):** `EXTRA_DAYS_ACCRUED` is persisted with **no period** (`post_extra_days_paid`, `core/staff/posting.py` ~1191) and is **excluded from `remaining_accrual_minor`** (`core/staff/ledger.py` ~182). The salary-payment dialog uses `post_period_salary_payment`'s period-scoped `advance_applied = min(advance, period_remaining)`, so extra-days-owed is invisible → advances can never apply to it → a 0-cash payment applies 0. Reachable from two entry points: staff page and the Expenses form (`manual-expense-form.tsx`).

**Related report #2 (same subsystem):** a 15.000 cash salary payment **silently auto-applied** the full 13.515 advance (`advance_applied = min(advance, period_remaining)`), and the entry then **can't be edited** (`service.py:586` blocks correcting a payment with an `ADVANCE_APPLIED` sibling — only Void works). Owner wants control over advance application + a correction path.

**Fix (IMPLEMENTED 2026-07-13, ⚠️ re-run pytest — design revised after owner feedback):** the root cause was that extra-days were invisible to the netting math, **not** auto-apply itself. Owner: *"i want it automatic i do not wanna go do the outstanding payable or advances one by one — that is why i am creating this software."* Final design:
1. `remaining_accrual_minor` now **includes EXTRA_DAYS_ACCRUED** (excludes EXTRA_DAYS_PAID — direct pay never enters payable). This is the actual bug fix: extra-days owed is now visible to every netting path.
2. **Advances net AUTOMATICALLY against ALL owed** (`post_salary_payment`, `post_period_salary_payment`): cash settles total owed (this period + prior + extra-days), the advance clears whatever is still owed, and **only surplus beyond ALL debt parks as a new advance** — which stops the old advance→re-advance loop (13.515 recycling).
3. New explicit **`post_apply_advance`** kept as a manual escape hatch (Dr Salaries Payable / Cr 1300, no cash) + `POST /staff/employees/{id}/apply-advance` + "Apply advance" button — useful to net an advance when no payment is being recorded (e.g. Latif's stranded extra-days).
4. `service.py:586` dead-end now directs to Void (reverses payment + advance-applied together).
5. `SalaryPeriodStatusRead.total_owed_minor` exposes total owed (incl. extra-days + the about-to-accrue month) so the dialog preview mirrors the backend; `staff-salary.ts` previews updated.
6. Extra-days ledger rows are now **voidable in the UI** (correct via void + re-enter; edit stays off because days×rate metadata isn't rebuilt by an amount edit).
Brief superseded: `CURSOR_BRIEF_staff_advance_extra_days.md`.

**Guarding test:** `tests/test_staff_apply_advance.py` (7 tests incl. the **Latif reproduction**: 13.440 extra-days owed + 13.440 advance → apply → both zero, balance unchanged; report-#2 reproduction: 15.000 cash / 38.000 owed / 13.515 advance → advance untouched). Updated to the new design: `test_staff.py`, `test_staff_period_payment.py`, `test_subledger_void.py`, `frontend/src/lib/staff-salary.test.ts`. **Owner: run `cd backend && .venv/bin/pytest -q` before merge — money-critical.**

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
