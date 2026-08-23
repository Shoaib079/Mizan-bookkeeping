# Cursor brief — Staff advance can't be applied against extra-days (money-critical)

> **⛔ SUPERSEDED 2026-07-13 — fix already implemented in-repo** (see BUGLOG 2026-07-13). Do NOT re-implement. Kept only as diagnosis/design record. If owner's `pytest -q` shows failures in the staff suite, use this doc as context to fix them.

**Paste this whole file to Cursor.** It has full repo + test access; this session did not (no Python 3.11/Postgres, can't run `pytest`). Follow `CURSOR_RULES.md` (recovery protocol, completion gate) and treat this as **money-critical → owner sign-off + full `pytest` before merge**. Do **not** hard-delete financial data; reverse via the posting boundary. Update `ROADMAP.md` / `CHANGELOG.md` / `BUGLOG.md` / `DECISIONS.md` when done.

## Symptom (owner-reported, real data — India Gate / employee "Latif Coşgun")

Owner pays staff and the **outstanding advance keeps growing and can never be netted down**, even though the money nets to zero on the balance. Concretely, Latif shows **Staff balance 170,00 ₺** but **Outstanding advance 13.515,00 ₺** at the same time.

Owner traced it (correct): **outstanding advance 13.515 = 75 (23.05 excess) + 13.440 (08.06)**. The 06.06 pair (`Advance applied +13.515` / `Advance paid — excess as advance −13.515`, same journal) is a **pure wash** and contributes nothing.

The **13.440** is the bug case:
- 08.06 `Extra days accrued (7 days) +13.440` — "Extra days pay" used in **accrue-only** mode (no cash account) → `Dr salary expense / Cr salaries payable`, `EXTRA_DAYS_ACCRUED`, **no period tag**.
- 08.06 `Advance paid — excess as advance −13.440` — a **separate** salary payment whose named period had no salary due, so the excess-as-advance rule parked the whole 13.440 as an advance.

Net: owner **owes 13.440 for extra days** AND holds a **13.440 advance** — they offset on the balance, but both sit gross and **there is no way in the app to net them**.

**Owner already tried the documented workaround** — posting a salary payment for that period with **0 cash** — and it changed nothing. Owner also noted the **same bug is reachable from a second entry point**: recording a staff salary/extra-days **from the Expenses form** (`frontend/src/components/forms/manual-expense-form.tsx`), which routes to the same staff posting engine.

## Root cause (found this session — please verify, then fix)

Extra-days accruals are invisible to the advance-application math, so an advance can never be applied against extra-days owed:

1. `EXTRA_DAYS_ACCRUED` is persisted **without `period_year`/`period_month`** — `post_extra_days_paid` in `backend/app/core/staff/posting.py` (~line 1191) calls `persist_staff_ledger_entry(... movement_type=EXTRA_DAYS_ACCRUED ...)` with **no period**.
2. `remaining_accrual_minor` in `backend/app/core/staff/ledger.py` (~line 182) sums only `SALARY_ACCRUED + SALARY_PAYMENT` — it **ignores `EXTRA_DAYS_ACCRUED`**.
3. `period_remaining_minor` / `period_paid_minor` are **period-scoped**; extra-days have no period, so they're never counted.
4. The salary-payment dialog uses `post_period_salary_payment` (`posting.py` ~line 880), which computes `advance_applied = min(advance_minor, period_remaining)`. With extra-days invisible, `period_remaining` for the paid month is 0 → `advance_applied = 0` → **the owner's 0-cash payment did nothing** (matches the report exactly).

Net: there is **no code path** that applies an outstanding advance against extra-days owed. Voiding/re-entering can't fix it because the tool to net them doesn't exist.

## Recommended fix (verify + choose the cleanest; owner prefers option A)

**A. Add a dedicated "Apply advance" action** (recommended — most contained, easiest to test):
- New endpoint + staff-page button "Apply advance to salary owed."
- Posts **no cash**: `Dr Salaries Payable / Cr 1300 Employee Advances`, records `ADVANCE_APPLIED`, capped at `min(outstanding_advance, total_salary_owed_including_extra_days)`.
- "Total salary owed" must include `EXTRA_DAYS_ACCRUED` (see fix 2 below). For Latif this applies 13.440 against the 13.440 extra-days owed → both drop to 0, balance stays 170.

**B. And make extra-days count as owed so this can't drift again:** include `EXTRA_DAYS_ACCRUED` in `remaining_accrual_minor` (and, if you also change the payment path, in the advance-application base) so a salary payment can naturally settle extra-days and apply advances against them. Decide whether extra-days should also carry a period tag, or be treated as period-agnostic "owed."

Keep both frontend entry points consistent: the staff page (`components/forms/staff-salary-payment-dialog.tsx`, `staff-extra-days-form.tsx`) **and** the Expenses form (`components/forms/manual-expense-form.tsx`).

## Second owner report (2026-07-13, same subsystem) — forced auto-apply + can't correct

Owner recorded a **15.000 cash** salary payment for Latif (Jun 2026). The system **auto-applied the full 13.515 outstanding advance** on top without being asked, then **blocked editing** the entry. Ledger (06.07.2026):
- `Salary accrual (Jun 2026) +38.000` → bal 38.170
- `Salary payment −28.515` → bal 9.655  (= 15.000 cash **+ 13.515 advance auto-applied**, `payable_cleared` = 28.515)
- `Advance applied +13.515` → bal 23.170

Two problems:
1. **Forced auto-apply.** `post_period_salary_payment` computes `advance_applied = min(advance_minor, period_remaining)` and always applies it — the owner had no choice to pay cash only. (Accounting-wise applying an advance when salary is earned is *defensible*, but it must be the owner's decision / visible, not silent.)
2. **Can't correct it.** `backend/app/features/staff/service.py:586` raises *"salary payment with advance applied cannot be corrected via this endpoint yet"* whenever the payment has an `ADVANCE_APPLIED` sibling in the same journal. So **Edit is dead**; only **Void** works — the owner hit a wall.

## Recommended unified design (resolves BOTH reports)

**Decouple advance application from the salary payment.** Make a salary payment **pay cash only** (predictable, no silent advance consumption), and make advance application an **explicit, owner-chosen action** ("Apply advance to salary owed") that nets against **all** unpaid salary — regular accruals **and** extra-days. This single change:
- fixes report #1 (advance can finally be applied against extra-days owed), and
- fixes report #2 (payments stop silently applying advances; the owner decides when to net).

Plus: **allow correcting (or cleanly voiding) a salary payment that applied an advance** — remove/replace the `service.py:586` block so `ADVANCE_APPLIED`-linked payments have a real correction path (void the whole journal + re-post, consistent with the existing void-and-reenter pattern).

If the team prefers to keep auto-apply, then at minimum it must be (a) shown/confirmed before posting and (b) correctable. But the decoupled design above is cleaner and is what the owner's workflow implies.

## Key files
- `backend/app/core/staff/posting.py` — `post_period_salary_payment` (~880), `post_salary_payment` (~555), `post_extra_days_paid` (~1133), `build_try_combined_salary_and_excess_advance_lines` (~722).
- `backend/app/core/staff/ledger.py` — `remaining_accrual_minor` (~182), `period_remaining_minor` (~193), `outstanding_advance_minor` (~207), `_sum_by_type`.
- `backend/app/features/staff/service.py` — `record_staff_payment` (~430), `record_extra_days_paid` (~364), `get_salary_period_status` (~321), **the correction block at line 586** ("salary payment with advance applied cannot be corrected via this endpoint yet").
- `backend/app/features/staff/api.py` — staff endpoints (add the new "apply advance" one).
- Frontend — `app/staff/[id]/page.tsx`, `components/forms/{staff-salary-payment-dialog,staff-extra-days-form,correct-staff-ledger-form,manual-expense-form}.tsx`.
- Prior related fix for context: `BUGLOG.md` 2026-06-23 "Staff advance applied twice on partial salary payments" (the `ADVANCE_APPLIED` movement).

## Tests to add (must be green before merge)
1. Extra-days accrued + outstanding advance → "Apply advance" nets both to zero, no cash, balance unchanged.
2. `remaining_accrual_minor` includes `EXTRA_DAYS_ACCRUED`.
3. A salary payment paying **less cash than total owed (incl. extra days)** applies the advance against extra-days too (not parked as new advance).
4. Regression: existing period-scoped salary payment + excess-as-advance behaviour unchanged for the normal (no-extra-days) case.
5. Both entry points (staff page + Expenses form) produce identical postings.
6. Reproduce Latif: 75 + 13.440 advance, extra-days 13.440 owed → after "Apply advance", advance = 75, extra-days owed = 0, balance 170.
7. Salary payment pays **cash only** — a 15.000 payment against 38.000 owed with a 13.515 advance does **not** silently apply the advance (report #2). If auto-apply is kept instead, it's confirmed before posting.
8. A salary payment that applied an advance **can be corrected/voided** cleanly (remove the `service.py:586` block); voiding reverses payment + `ADVANCE_APPLIED` together (same journal) and restores the advance.

## Guardrails
Money-critical. Owner runs full `pytest` locally + signs off. No hard delete of financial rows (migration guards abort if real postings exist). Update the four docs + tag on completion per `CURSOR_RULES.md`.
