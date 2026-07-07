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

### F3 — MEDIUM · Voids rewrite historical reports

`balances.py` excludes **both** the voided original (status) and its reversal (`reverses_entry_id is not null`). So voiding a January entry in March makes January's P&L/balance sheet change retroactively — as if the entry never existed. The reversal entry exists only for audit; it never hits any report.

This is internally consistent and period locks gate it (void checks the original's entry date), but protection only exists **if the owner actually locks months**. A reviewed/exported month can silently change under the current flow. Options: auto-lock past months on report export/sign-off, or switch to the standard convention (include original + reversal in balances) so history is append-only by construction.

### F4 — MEDIUM · No year-end close

Revenue/expense accounts never close to Retained Earnings (`3100` is seeded but never posted to). The balance sheet stays balanced via a computed all-time `unclosed_net_income` line, which is correct math — but after year 2+, that line mixes all years' results and `3100` stays at zero. Fine for v1; add a closing-entry (or virtual year-partition) mechanism before multi-year use, and document the current behavior for the accountant.

### F5 — LOW · Cash-flow classification is per-entry source, coarse for MANUAL/SYSTEM

Manual journals and SYSTEM entries touching cash are always "operating," even if financing/investing in nature. The `reconciled_to_categories` flag keeps totals honest; classification within categories can be wrong. Acceptable; note it in the report UI.

### F6 — LOW · UTC dates near midnight

`utc_today()` is used for default entry/void dates; Turkey is UTC+3, so entries made 00:00–03:00 local default to the previous day. Deliberate per code comment; worth a UI hint on late-night closes.

---

## Recommended order

1. **F1** — fix parser + tests (small, closes a real money-corruption path).
2. **F3** — auto-lock on export/sign-off (small, protects report credibility immediately).
3. **F2** — output-VAT slice when in scope (large; already on the roadmap as deferred).
4. **F4/F5/F6** — document now, build later.

## Limits of this review

Static analysis + executed pure-logic checks only; the Postgres-backed suite (RLS, immutability triggers, E2E posting) was not re-run here. Findings F1 was verified by running the code; F2–F6 verified by reading the actual posting/report paths. A full re-run of `pytest` locally (and adding it to CI, per PRE_DEPLOY_CHECKLIST) remains the ground truth for regressions.
