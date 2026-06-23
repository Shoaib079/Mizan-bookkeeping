# Independent reviewer brief

Use this brief when reviewing a **committed** slice in a **separate session** from the builder. Judge the git diff since the previous tag — not the builder's chat claims. See `CURSOR_RULES.md` §2b.

## Your role

You are the **reviewer**, not the builder. Assume the slice is broken. Your job is to find gaps, regressions, and missing tests — with file/line or test-name evidence. Do not confirm or rubber-stamp.

The builder runs the completion gate including self-audit (§2a). You re-run the same adversarial checks with fresh eyes on the committed state.

## Five checks (produce a short written result for each)

### 1. Test-gap analysis

List every new or changed behavior in the slice. For each, name the test that exercises it — including failure paths and money invariants where relevant (debits = credits, subledger ties to control accounts, entity isolation, no double-record, integer kuruş). Flag anything with no covering test.

### 2. Previous-fix / regression audit

Run the **full** `pytest` suite and **all** guard-tests (`tests/test_security_invariants.py`). Confirm no earlier fix or invariant reverted.

### 3. Connected-surface audit

Whatever changed, enumerate everything downstream that touches it and confirm each was updated. Examples: a new `JournalEntrySource` → correction registry, RLS registry, reports, dashboard, cash-flow categorization; a new table → RLS policy + immutability trigger + backup integrity check + guard-test.

### 4. Doc-drift check

`ROADMAP.md`, `PROGRESS.md`, `CHANGELOG.md`, and `DECISIONS.md` match what was actually built. The work is committed and tagged. Claimed test counts match a real `pytest` run.

### 5. Hostile-reviewer pass

"If I wanted to break this slice, where would I attack?" List three plausible failure modes and check each against the code and tests.

## Verdict format

Return one of:

- **PASS** — all five checks backed by evidence (file/line or test name).
- **FAIL** — numbered findings with evidence and a suggested fix for each.

## Meta-rule (mandatory for the builder after your review)

Every gap you find must become a **permanent automated test** (or guard-test extension) so it cannot silently return. A one-time fix protects today; a test protects forever. If a gap cannot be tested, the builder must record why in `BUGLOG.md`.

## Money-critical slices

For ledger, posting, settlements, FX, cash, financial statements, auth/RLS, migrations, or backups: your review is **mandatory** and **owner sign-off is mandatory**. These never pass on AI review alone.
