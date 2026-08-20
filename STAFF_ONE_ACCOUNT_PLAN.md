STATUS 2026-08-21: PARKED BY OWNER (decision 2026-08-18). Part 1 — one signed
balance, the owed/advance invariant, no Apply-advance button — is the shipped
model. The 1300→2250 merge described below is deferred indefinitely; re-decide
before building. The honest cost list is kept for that day.

# Merging 1300 into 2250 — one staff account, plus and minus

Owner's decision, 18 August 2026: staff should read like partners — one signed
balance, "if balance goes to negative he owes me and if positive he owes me
kinda thing" — and the advance machinery should go with it.

Part 1 is shipped: the invariant that salary owed and advance held can never
both stand, the signed balance on the page, and the removal of the Apply
advance button. **That is emulation.** It posts a journal entry each time to
move value between two accounts, which is work the merged model would not do
at all. This document is the real change.

Nothing here has been built. Read it before agreeing to it.

---

## 1. What is actually true today

Two GL accounts carry one relationship.

| Code | Name | Type | Meaning |
|---|---|---|---|
| `2250` | Salaries Payable | Liability | the business owes the employee |
| `1300` | Employee Advances | Asset | the employee owes the business |

Partners have one account, `2150`, which runs both directions — which is
exactly why a partner balance is just a number with a sign and needs nothing
applied to it.

The four staff postings that touch `1300`:

- advance paid — `Dr 1300 / Cr cash`
- advance returned — `Dr cash / Cr 1300`
- advance applied — `Dr 2250 / Cr 1300` (no money)
- salary payment consuming an advance — the same offset folded in

Sites that would change: **six** in `core/staff/posting.py`, one in
`core/staff/partner_funded_payment.py`, three in
`features/staff/correction_lines.py`.

## 2. What the merge does

Delete `1300`. Every posting above targets `2250` instead:

- advance paid — `Dr 2250 / Cr cash`
- advance returned — `Dr cash / Cr 2250`
- advance applied — **stops existing.** There is nothing to move.

An advance simply drives `2250` debit for that employee. Salary accrual drives
it credit. The balance is the answer, and `min(owed, advance)` is not a
question anyone can ask.

## 3. What this costs — the honest list

**a. `ADVANCE_APPLIED` becomes meaningless, but the rows remain.**
Historical entries carry that movement type and their journal lines credit an
account that no longer exists. They cannot be rewritten without falsifying
posted books. The type has to survive as read-only history while being
unwritable going forward — a state the codebase has no precedent for.
`WRITABLE_MOVEMENT_TYPES` already exists and is the right seam.

**b. Employee advances stop being an asset on the balance sheet.**
The report classifies generically by `account_type` (verified —
`financial_statements.py` groups on `AccountType.ASSET/LIABILITY/EQUITY`, with
no reference to `1300` anywhere in `features/reports/`), so nothing breaks.
But money owed *to* the business by staff will now sit inside a liability
account as a debit rather than appearing among current assets. Entity-wide it
will almost always still net credit for a restaurant, so this is presentational
rather than material — **and it is the one thing an accountant would notice.**
It should be your call, not mine.

**c. Two control-account ties become one.**
`staff_employee_advances_subledger_total` and its `ControlAccountTie` row go.
`staff_salaries_payable_subledger_total` must widen from four movement types to
all of them. The integrity check in `features/backups/integrity.py` drops from
`staff_sub == 2250 − 1300` to `staff_sub == 2250`.

This is a genuine loss of a check. Today the two accounts tie *separately*, so
an advance mis-posted as salary is caught. After the merge both land in the
same account and net out, so that class of error becomes invisible to the tie.
Nothing else catches it.

**d. Live books need migrating.**
India Gate has real `1300` balances. This is the irreversible part.

**e. FX is not a blocker.** I expected it to be and checked: the lira cost of a
foreign-currency advance lives on the subledger row (`try_cost_kurus`), not in
`1300` — see `outstanding_advance_try_kurus`. Merging the GL account does not
lose the rate. This also means the TRY-only restriction on settlement
disappears along with settlement itself.

## 4. The migration

Alembic revision `096`, following `095_delete_entity_function.py`.

1. **Report before touching.** Per entity, per employee: `1300` balance,
   `2250` balance, and the merged figure. Printed and saved, not just logged.
   You read it and approve before step 2 runs.
2. **One journal entry per entity**, dated the migration date, sourced
   `SYSTEM`, description naming this document: `Dr 2250 / Cr 1300` for the
   whole outstanding advance balance. Not an UPDATE of historical lines — the
   old entries stay exactly as posted, and the books show the reclassification
   as an event, which is what it is.
3. **Deactivate `1300`** rather than deleting the row, so historical journal
   lines still resolve to an account with a name.
4. **Re-run the same report** and diff. Every employee's merged figure must be
   unchanged from step 1.

Reversible up to step 3 by voiding the step-2 entries.

## 5. Order of work

1. Widen the payable tie and drop the advances tie, with the integrity check —
   tests first, since this is the safety net for everything after.
2. Repoint the ten posting sites. No behaviour change yet beyond the account.
3. Delete `advance_settlement` and its invariant. It exists only to paper over
   two accounts. **Its tests become the regression suite for the merge** —
   every one of them should still pass unchanged, because the outcomes it
   asserts are exactly what one account produces natively.
4. Make `ADVANCE_APPLIED` unwritable, keep it readable.
5. Migration `096`.
6. Frontend: `remaining_accrual_minor` and `outstanding_advance_minor` leave
   the payload; `staffNetPosition` collapses to the balance it already
   computes; the conditional netting panel goes, since nothing can net.

Steps 1–4 are reversible. Step 5 is not.

## 6. What I would want from you before starting

- Confirmation on **3b** — advances leaving the asset side. This is the only
  item your accountant would see, and it is a judgement about your books, not
  about the code.
- Whether the pre-migration report should go to you as a PDF. Your standing
  rule is PDF-only for anything leaving the app.

## 7. Rejected alternative

Keeping both accounts and hiding the second figure — what part 1 does. It
works, and it is where things stand today. It was rejected because the
emulation posts a journal entry every time an advance meets owed salary,
purely to shuffle value between two accounts that are about to become one.
Noise in the books, permanently, to avoid a migration once.
