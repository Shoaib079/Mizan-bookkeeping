# Opening Balances — Plan (Decisions §19)

**Status:** Locked plan for Phase 0. Implementation posts in **Phase 1** (ledger core) and **Phase 3** (bank account tree). Entity-scoped throughout.

---

## Purpose

When a restaurant goes live on Mizan, it is already running. Day one needs **opening figures** per entity — not zero — posted as proper double-entry journal entries against **Opening Balance Equity** (`3900`).

---

## What the owner enters (per restaurant)

| Category | Examples | Default account codes |
|----------|----------|------------------------|
| Supplier payables | amounts owed to suppliers | `2000` Accounts Payable |
| Customer receivables | amounts owed to you | `1200` Accounts Receivable |
| Bank balances | each TRY bank account | `1100` (+ per-account sub-accounts in Phase 3) |
| Card balances | credit card liabilities | `2100` Credit Card Payable |
| Cash in drawer | TRY and FX wallets | `1000`–`1030` Cash |
| FX holdings | USD/EUR/GBP quantities | `1010`–`1030` (quantity tracked per Decisions §15) |
| Staff balances | advances owed by staff | `1300` Employee Advances |
| Partner reimbursements | owed to partners | `2000` or dedicated partner ledger (Phase 5) |
| POS/card clearing | unsettled card sales | `1400` Card Sales Clearing |

Each line uses the account’s **natural balance side** (debit for assets, credit for liabilities). The system adds **Opening Balance Equity** so debits = credits.

---

## Onboarding wizard (order)

1. **Entity created** — registry row (`entities` table) ✓ Phase 0
2. **Seed chart** — copy default chart into entity-scoped `accounts` (Phase 1) ✓ `POST .../chart-of-accounts/seed`
3. **Delivery settings** — entity settings: enabled platforms (Getir, Yemeksepeti, Trendyol)
4. **Bank / card / cash accounts** — named sub-accounts under tree (Phase 3)
5. **Opening balances** — enter figures per account; validate via API
6. **Review trial balance** — must balance to zero (Phase 1 report)
7. **Post day-one journal** — single posting through `core/ledger` (Phase 1)

API today: `GET /onboarding/wizard-steps`, `GET /chart-of-accounts/default`, `POST /onboarding/entities/{id}/opening-balances/validate`.

---

## Journal rules (non-negotiable)

- **Integer kuruş** only
- **Entity-stamped** — every line carries `entity_id`; RLS enforced
- **Dated** go-live date (entity config)
- **Void/reverse only** — no hard delete (CURSOR_RULES §1)
- **Single posting boundary** — `core/ledger` in Phase 1
- **Offset account** — always `3900` Opening Balance Equity unless debits already equal credits (rare)

---

## Validation (implemented)

- Account must exist in default chart and `accepts_opening_balance = true`
- Side must match account normal balance
- No duplicate accounts in one submission
- Generated journal must balance (debits = credits)

Code: `backend/app/features/onboarding/opening_balances.py`

---

## Build phases

| Phase | Deliverable |
|-------|-------------|
| **0** (this slice) | Plan doc, default chart seed, validation + validate API |
| **1** | Persist chart per entity, post day-one journal, trial balance |
| **3** | Bank/cash/card account tree; opening balances link to named accounts |
| **7** | Balance sheet shows opening equity and account balances |

---

## Out of scope

- Inventory / stock opening values (Decisions §28)
- Automatic opening balance from bank feed (FUTURE_IDEAS)
- P&L account opening balances (revenue/expense accounts reject OB input)
