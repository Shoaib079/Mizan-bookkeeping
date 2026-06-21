# Ideas mined from the previous app (streamlit_accounting_erp)

**Purpose:** Harvest the *good ideas* from the earlier attempt — not the code. The old build is a Streamlit monolith (a 1.1 MB `app.py`) part-migrated to React; we are NOT reusing or fixing it. We start clean on our documented foundation and just borrow concepts.

---

## 1. It validates our plan (they built the same core independently)
Their data model and services match what we designed — good confirmation we're on the right track:
- **Chart of accounts + double-entry** (`ChartOfAccounts`, `JournalEntry`, `JournalEntryLine`) — exactly our foundation.
- **Multi-company / entity separation** (`Company`, `CompanyUser`, `CompanySetting`) — our multi-restaurant model.
- **Audit log, voids, fiscal periods** — our audit trail + soft-delete/void + period locking.
- **Receipt AI with a learning store** (`receipt_ai`, `ReceiptLearningMap`, `receipt_learning_prefill`) — our "the app learns my corrections".
- **POS settlement imports separate from bank imports** (`SettlementStatementImport/Row` vs `BankStatementImport/Row`) — our POS-vs-bank distinction.
- **Customer ledger (receivables), partners, workers/staff with movements, attachments, bilingual i18n + locales** — all in our plan.

## 2. Concrete ideas we're TAKING (folded into our docs)
- **Default restaurant Chart of Accounts** — borrow their clean list as our default seed: Cash (TRY/USD/EUR/GBP), Bank (per currency), Accounts Receivable, **Employee Advances**, Inventory, Accounts Payable, **Credit Card Payable**, Loans, Owner Capital, Retained Earnings, Owner Drawings, **Opening Balance Equity**, Sales Revenue, Other Income, **FX Gain / FX Loss**, Rent / Salary / Utility / Advertising / Fuel / Office expense, **Card Sales Clearing**, **Bank Charges**, **Cash Over/Short**.
- **"Card Sales Clearing" account** — model our POS card receivable as a proper **clearing account**: card sales debit it, settlements credit it, the leftover is commission. Clean, standard, and it's how their app did it.
- **"Opening Balance Equity" account** — the standard place opening balances post against (since it's a running business going live).
- **"Cash Over/Short" account + End-of-Day Close + Daily Cash Reconciliation** — a formal "close the day" step: count the drawer, compare to expected cash, post any difference to Cash Over/Short, lock the day. Strong restaurant fit (a real Z-report/EOD close).
- **Default categories with sub-categories** (two levels) — e.g. Utilities → {Electricity, Water, Gas}, Payroll → {Salary, Bonus}. Borrow as our default category seed.
- **Setup / onboarding wizard** — when adding a restaurant, seed its chart of accounts + categories + accounts + opening balances in one guided flow.
- **Trial balance report** — basic report that proves the double-entry ledger balances.
- **Single posting boundary (architecture)** — every ledger write goes through ONE posting service/"unit of work", so double-entry integrity lives in exactly one place. (Added to the build rules.)

## 3. Ideas for the POCKET (later, as we grow) — moved to FUTURE_IDEAS.md
- **External sales verification** — reconcile sales reported by delivery platforms / POS providers (Yemeksepeti, Getir, Trendyol, the POS) against recorded sales.
- **Recipe costing / menu pricing / food cost** (`Ingredient` → `Recipe` → `RecipeLine` → `MenuItem` + `MenuPriceHistory`) — the COGS/food-cost world we deferred; they built a real structure for it.
- **Partner profit allocation** — distribute profit among partners (beyond our reimbursement-only scope).
- **Year-end close** — closing entries to retained earnings; `FiscalPeriod` + `YearEndClose`.
- **FX revaluation** — they kept FX Gain/Loss accounts ready; we stay simple (cost only) until needed.
- **Recurring expense templates → generate drafts to confirm** (not auto-post) — matches our review-first philosophy.

## 4. Cautionary lessons (why the old one became a mess — and how we avoid it)
- **A 1.1 MB `app.py` monolith.** Everything in one giant file = impossible to change safely. → Our rule: small vertical slices, no dead code, one responsibility per file.
- **A framework switch mid-build** (Streamlit → React, half-done, lots of `*_contract` files). Migrating the stack midway is a huge mess multiplier. → We pick the stack once (Next.js + FastAPI + Postgres) and don't switch mid-stream.
- **A 295 KB roadmap + dozens of "contract"/cutover scripts** — churn from re-planning over and over. → One decisions doc as the single source of truth; update it first, never let docs and app drift.
- **Postgres "cutover" scripts after starting on SQLite** — they migrated databases mid-project. → We start on PostgreSQL from day one.

*Bottom line: the previous app proves the concept and hands us a ready-made chart of accounts and several restaurant-specific patterns. We take those ideas onto a clean foundation — and the recovery/slice rules in CURSOR_RULES exist precisely so we never end up back in that tangle.*
