# FINANCIAL_AUDIT — accounting-engine credibility review

**Date:** 2026-07-07 · **Scope:** backend accounting core (`core/`), posting flows, reports, safeguards. Static review + executed verification of pure-logic code. DB-backed test suite not runnable in the review sandbox (no Postgres); `TESTS.md` registers 89 test files passing, 0 failing.

**Verdict: the double-entry engine itself is sound and unusually well-defended for an app at this stage. It is not "100% credible" — one verified parsing bug, one structural VAT gap, and two design caveats keep it short of that.**

---

## What holds up (verified)

- **Single posting boundary is real.** Grep confirms `JournalEntry` is only constructed inside `core/ledger`. All 18 posting modules go through `post_journal_entry`/`prepare_journal_entry`, which enforces: ≥2 lines, positive integer kuruş, debits == credits, account active + same entity, period-lock check, audit event.
- **Integer kuruş everywhere.** No float money in the ledger path.
- **DB-level immutability.** Postgres triggers block UPDATE/DELETE on journal lines, DELETE on entries, and gate void-metadata updates behind a session flag. Tampering via raw SQL fails.
- **Void = linked reversal + audit trail;** corrections route per-source with a registry-completeness check (fails fast if a new source is unclassified).
- **Subledger ↔ control account tie framework** covers AP, AR, salaries payable, employee advances, partner capital/reimbursement, FX cost — with auto-discovery of `*_ledger_entries` tables so a new subledger can't silently escape the tie check.
- **Balance sheet self-checks** (`accounting_equation_balanced`), cash flow self-checks (`reconciled_to_categories`), and a cash-flow source registry that raises if any `JournalEntrySource` is unclassified.
- **FX average cost** uses integer floor division; spending the full wallet returns the full cost (no stranded kuruş); overspend blocked.
- **Partner profit split**: floor each share, last partner absorbs the remainder, `assert sum == total`.
- **Invoice totals**: `net + Σvat + other_taxes == gross` enforced with zero tolerance before posting.
- **RLS entity isolation, period locks with go-live floor, idempotency records, duplicate guards** all wired into the posting path.

---

## Findings

### F1 — HIGH · `amount_text_to_kurus` misparses thousands-dot amounts (verified by execution)

`core/money.py` — for input without a comma, the first dot is treated as the decimal point:

| Input | Parsed | Correct (TR) |
|---|---|---|
| `1.234` | **₺1,23** | ₺1.234,00 |
| `1.234.567` | **₺1,23** | ₺1.234.567,00 |
| `1.234,56` | ₺1.234,56 ✓ | — |

`parse_try_loose` in the same file handles these correctly — so the app has **two inconsistent Turkish parsers**, violating the "one Turkish-number parser" rule in ARCHITECTURE.md.

**Exposure:**
- `adapters/ocr_ai/pos_summary.py` calls it **raw** on OCR'd slip text — a slip showing `NAKİT 1.234` prefills ₺1,23 (1000× off). The cash+card==total check and human confirm mitigate, but users confirm prefills blindly.
- `adapters/ocr_ai/efatura.py` PDF path is mostly protected by `_normalize_tr_amount`, but that helper treats any `\d+\.\d{2}` (e.g. `123.45`) as a decimal — ambiguous in Turkish PDFs.
- XML (UBL) path is safe in practice (dot-decimal format), but amounts with >2 decimals are **truncated, not rounded**.
- **`amount_text_to_kurus` has zero test coverage** — `test_money.py` (5 tests) only covers `parse_try_loose`. "Every money rule has a test" is violated exactly where the bug lives.

**Fix:** make `amount_text_to_kurus` use the same dot-groups-of-3 = thousands logic as `parse_try_loose` (or delete it and normalize all callers onto one parser); when a no-comma amount is genuinely ambiguous, flag needs_review instead of guessing; add table-driven tests including `1.234`, `1.234.567`, `123.45`, 3-decimal XML amounts.

### F2 — HIGH (structural, documented deferral) · No output VAT → P&L is not tax-credible

Sales post **gross** (KDV dahil) to `4000`; there is no output-VAT liability account (no 391 equivalent) in the chart. Meanwhile supplier e-fatura expenses post **net** with input VAT to `1500`, but cash/receipt expenses (`core/expenses/posting.py`) post **gross** with no VAT split. Consequences:

- Revenue overstated by output KDV; net income overstated accordingly.
- Expense base is a mix of VAT-exclusive (e-fatura) and VAT-inclusive (receipts/bank rules) — margins are internally inconsistent.
- Input VAT `1500` accumulates as an asset forever; no KDV settlement/offset mechanism, so the balance sheet carries a growing figure that never clears.

DECISIONS.md records this as a deliberate deferral ("gross-only revenue posting for now"), so it's a known scope cut, not a hidden bug — but it is the single biggest gap between "internally consistent books" and "credible financial statements." Until built: label the P&L "KDV dahil revenue / mixed-basis expenses — management view, not tax basis," and keep the accountant workflow external.

### F3 — ✅ RESOLVED 2026-07-27 · Voids rewrite historical reports

`balances.py` excludes **both** the voided original (status) and its reversal (`reverses_entry_id is not null`). So voiding a January entry in March makes January's P&L/balance sheet change retroactively — as if the entry never existed. The reversal entry exists only for audit; it never hits any report.

This is internally consistent and period locks gate it (void checks the original's entry date), but protection only exists **if the owner actually locks months**. A reviewed/exported month can silently change under the current flow. Options: auto-lock past months on report export/sign-off, or switch to the standard convention (include original + reversal in balances) so history is append-only by construction.

**Fix shipped 2026-07-27 (month close slice 2).** Neither option above, but a third: closing a month writes a `period_close_snapshots` row per account — closing balance, period activity, debits, credits — in the same transaction as the lock. P&L and balance sheet then serve the sealed figures for a closed month, so what was exported keeps reading the way it was exported. `view=live` shows how the books read today, and when an owner writes into a sealed month the lock goes `dirty` and the report reports the drift ("the live books now differ by −1.000,00 ₺") instead of silently swapping one number for another.

Deliberate limits, documented so they aren't mistaken for bugs:

- **Exact month ranges only.** A P&L for 15 June–15 July straddles two months and no single snapshot can answer it honestly, so it falls through to live. Same for a balance sheet dated mid-month.
- **A month closed before this shipped has no snapshot** and serves live rather than reporting an empty statement.
- **Only P&L and balance sheet** consult snapshots — the two you'd actually send an accountant. Cash flow, period comparison, the general ledger and the registers stay live by design; they're working views, not filings.
- Deactivating an account after a close does **not** drop it from that month's sealed figures (the as-closed account set comes from the snapshot, not from `is_active`).

Guarding tests: `backend/tests/test_period_close_snapshot.py` (14, including the direct F3 reproduction: close June, void a June entry, June must not move).

### F4 — ✅ RESOLVED 2026-07-27 · No year-end close

Revenue/expense accounts never close to Retained Earnings (`3100` is seeded but never posted to). The balance sheet stays balanced via a computed all-time `unclosed_net_income` line, which is correct math — but after year 2+, that line mixes all years' results and `3100` stays at zero. Fine for v1; add a closing-entry (or virtual year-partition) mechanism before multi-year use, and document the current behavior for the accountant.

**Fix shipped 2026-07-27.** Standard closing entry, not a virtual partition. `Close the year` on the Month close page posts one entry dated 31 December (`JournalEntrySource.YEAR_END_CLOSE`) that debits every revenue balance, credits every expense balance, and puts the difference to Retained Earnings — credit for a profit, debit for a loss.

**This was worse than a presentation problem.** Partner profit allocation already *debits* 3100 to distribute profit to partners; nothing ever credited it, so that flow has always drawn on a permanently empty account. The year-end close is its missing half.

Design notes worth keeping:

- **The closing entry is excluded from the P&L** (`balances.P_AND_L_EXCLUDED_SOURCES`, applied via `period_activity_kurus(exclude_sources=…)`). Counting it would net every closed year to nil.
- **`_unclosed_net_income_kurus` deliberately does NOT exclude it.** That entry zeroes the revenue/expense balances, so once a year is closed the balance-sheet line naturally falls back to the current year's result alone — which is the whole point. Excluding it there would leave every past year permanently stacked.
- **It is non-cash** for the cash-flow statement.
- **Balances are read cumulatively to 31 December**, not as the year's own activity: a prior year that was never closed is still sitting in those accounts and belongs in equity too.
- **Requires December closed first** — a year can't be sealed over a month that might still change. The entry then posts through the sealed December with `period_unlock_reason="Year-end close {year}"`, so it appears in the audit trail as the system's own bookkeeping.
- **Voiding the closing entry reopens the year** for re-closing; `year_end_entry` ignores voided entries and reversals.
- Temporary accounts are gathered **regardless of `is_active`** — a mid-year deactivation would otherwise strand a balance in a P&L account forever.

Guarding tests: `backend/tests/test_year_end_close.py` (15), `frontend/src/lib/year-end.test.ts`.

### F5 — ✅ RESOLVED 2026-07-27 · Cash-flow classification is per-entry source, coarse for MANUAL/SYSTEM

Manual journals and SYSTEM entries touching cash are always "operating," even if financing/investing in nature. The `reconciled_to_categories` flag keeps totals honest; classification within categories can be wrong. Acceptable; note it in the report UI.

**Fix shipped 2026-07-27.** Migration 084 adds a nullable `journal_entries.cash_flow_category`; `cash_flow.entry_category(source, override)` prefers it and falls back to source inference. An **unrecognised value is ignored rather than trusted** — a bad string must not silently move money between categories.

The by-source rows now key on **(source, category)**, not source alone. With per-entry overrides one source can legitimately land in two categories, and a source-only key let the last entry seen relabel all the others — a bug the override would have introduced.

**Known gap, accepted 2026-07-27:** the override is accepted on `POST /manual-journals` but there is **no create-journal form in the frontend** (manual journals are list + void only), so today it's reachable by API only. Deliberately not built: a free-form double-entry screen is the easiest way to unbalance a subledger against its control account or post into a clearing account by hand, and every dedicated flow exists so that can't happen. Wire the picker if that form is ever added.

**The bigger practical gap is not this one.** A restaurant's real investing transaction is buying equipment, and the chart has **no fixed-asset accounts at all**, so such a purchase is recorded as an expense — wrong account, not merely wrong category. Owner has knowingly deferred fixed assets and depreciation; see DECISIONS.md 2026-07-27.

Guarding tests: `backend/tests/test_cash_flow_category_override.py` (7).

### F6 — ✅ MITIGATED 2026-07-27 · UTC dates near midnight

`utc_today()` is used for default entry/void dates; Turkey is UTC+3, so entries made 00:00–03:00 local default to the previous day. Deliberate per code comment; worth a UI hint on late-night closes.

**Narrower than the finding implies.** The frontend's `todayTrDate()` uses the *browser-local* date and every form sends an explicit date, so `utc_today()` only fires for direct API calls and backend-filled defaults. No behaviour was changed (owner's choice: show the date, don't guess).

**Mitigation shipped 2026-07-27:** `lateNightDateHint()` and a warning line inside `DateInput`. Between midnight and 04:00, a date field sitting on today's date says: *"It's after midnight — this will be dated 29.07.2026. For last night's trading, use 28.07.2026."* It self-suppresses once another date is picked, so it never nags. Computed after mount — the server can't know the user's local time and rendering it during SSR would mismatch.

**Newly relevant with month close:** an entry recorded at 01:00 on 1 July defaults to 30 June, and if June is sealed that write demands an unlock reason and flags the month as changed. Nothing breaks silently, but the hint is what makes it obvious.

Guarding tests: `frontend/src/lib/year-end.test.ts` (`lateNightDateHint` block).

---

## Recommended order

1. **F1** — fix parser + tests (small, closes a real money-corruption path).
2. **F3** — auto-lock on export/sign-off (small, protects report credibility immediately).
3. **F2** — output-VAT slice when in scope (large; already on the roadmap as deferred).
4. **F4/F5/F6** — document now, build later.

## Limits of this review

Static analysis + executed pure-logic checks only; the Postgres-backed suite (RLS, immutability triggers, E2E posting) was not re-run here. Findings F1 was verified by running the code; F2–F6 verified by reading the actual posting/report paths. A full re-run of `pytest` locally (and CI) remains the ground truth for regressions. One-time cutover notes lived in archived `docs/archive/ops/PRE_DEPLOY_CHECKLIST.md`.
