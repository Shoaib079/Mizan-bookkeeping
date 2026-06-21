# Opening Balances — Plan (Decisions §19)

**Status:** Locked plan for Phase 0. Implementation posts in **Phase 1** (ledger core) and **Phase 3** (bank account tree). Entity-scoped throughout.

**Safety rule:** The validate API **refuses** opening-balance lines for categories that are not modeled yet. It returns a clear **"not supported yet"** error — **block, don't guess.** Never silently accept a wrong value (especially FX as plain kuruş).

---

## Purpose

When a restaurant goes live on Mizan, it is already running. Day one needs **opening figures** per entity — not zero — posted as proper double-entry journal entries against **Opening Balance Equity** (`3900`).

---

## What the owner enters (per restaurant) — Decisions §19

| Category | Plan status | Account(s) today | Validate API today |
|----------|-------------|------------------|-------------------|
| Supplier payables | Aggregate only | `2000` AP | **Allowed** (aggregate) |
| Customer receivables | Aggregate | `1200` AR | **Allowed** |
| Each bank balance | Sub-accounts Phase 3 | `1100` TRY bucket | **Allowed** (one combined TRY bank line only) |
| Each card balance | Sub-accounts Phase 3 | `2100` CC Payable | **Allowed** (one combined card line only) |
| Cash in drawer (TRY) | Yes | `1000` | **Allowed** |
| USD/EUR/GBP holdings | **Not modeled** | `1010`–`1030` in chart | **Refused** — FX quantity model required |
| Staff balances | Aggregate only | `1300` Employee Advances | **Allowed** (one combined line; per-employee Phase 5) |
| Partner reimbursement balances | **Not modeled** | `2150` Partner Reimbursements Payable | **Refused** until Phase 5 |
| POS/card clearing (running business) | Yes | `1400` | **Allowed** |
| Loans | Yes | `2200` | **Allowed** |

Each allowed line uses the account’s **natural balance side**. The system adds **Opening Balance Equity** so debits = credits.

---

## Gaps / Phase 1+ (explicit deferrals)

### FX wallets (USD / EUR / GBP) — Phase 1+ quantity model

**Decisions §15:** Track FX by **quantity in native currency**; no live rates; no dashboard TRY conversion.

**Opening balance model (when built):**

| Field | Meaning |
|-------|---------|
| `quantity_minor` | Amount in that currency’s minor units (e.g. USD cents) |
| `try_cost_kurus_at_opening` | Owner-entered TRY book value at go-live — **never** from a live FX rate |

Day-one journal posts the FX wallet at entered TRY cost (or a documented two-line pattern); quantity stored for wallet display in native units.

**Until then:** validate API **refuses** codes `1010`, `1020`, `1030` with an explicit not-supported error. Do **not** enter FX opening as plain `amount_kurus` on those accounts.

### Partner reimbursements payable — account `2150`, Phase 5

**Decisions §17:** Light **per-partner** reimbursement ledger — separate from suppliers.

- Dedicated account: **`2150` Partner Reimbursements Payable** (in default chart; `accepts_opening_balance = false` until modeled).
- **Never** mix partner opening balances into **`2000` Accounts Payable**.
- **Until Phase 5:** validate API refuses `2150`.

### Sub-account requirements (per Decisions §19 “each …”)

| Sub-account type | Example | Phase | Notes |
|------------------|---------|-------|-------|
| **Per bank** | Garanti TRY, İşbank TRY | **Phase 3** | Banking hub tree; OB line per named bank account |
| **Per card** | Visa •••1234, Amex | **Phase 3** | Under card payable tree |
| **Per supplier** | Metro, Coca-Cola | **Phase 2** | Supplier master + payables ledger; OB per supplier balance |
| **Per staff** | Ali, Ayşe (TRY or FX pay currency) | **Phase 5** | Employee ledger; FX-paid staff use quantity model above |

**Until sub-accounts exist:** validate API accepts **aggregate** codes only (`1100`, `2100`, `2000`, `1300`). Any other code (e.g. future `1101`, `2001`) returns **not supported yet**.

### Allowed aggregate codes (validate API whitelist)

`1000`, `1100`, `1200`, `1300`, `1400`, `2000`, `2100`, `2200`

Code: `backend/app/features/onboarding/opening_balances.py` → `ALLOWED_AGGREGATE_OB_CODES`

---

## Onboarding wizard (order)

1. **Entity created** — registry row (`entities` table) ✓ Phase 0
2. **Seed chart** — copy default chart into entity-scoped `accounts` (Phase 1) ✓ `POST .../chart-of-accounts/seed`
3. **Delivery settings** — entity settings: enabled platforms (Getir, Yemeksepeti, Trendyol)
4. **Bank / card / cash accounts** — named sub-accounts under tree (Phase 3)
5. **Opening balances** — enter figures per account; validate via API
6. **Review trial balance** — must balance to zero (Phase 1 report)
7. **Post day-one journal** — single posting through `core/ledger` (Phase 1)

API: `GET /onboarding/wizard-steps`, `GET /chart-of-accounts/default`, `POST /onboarding/entities/{id}/opening-balances/validate`.

---

## Journal rules (non-negotiable)

- **Integer kuruş** for TRY-denominated lines (FX uses quantity model when live)
- **Entity-stamped** — every line carries `entity_id`; RLS enforced
- **Dated** go-live date (entity config)
- **Void/reverse only** — no hard delete (CURSOR_RULES §1)
- **Single posting boundary** — `core/ledger` in Phase 1
- **Offset account** — `3900` Opening Balance Equity

---

## Validation (implemented)

- **Block** FX (`1010`–`1030`), partner (`2150`), and non-whitelist codes — **not supported yet**
- Allowed aggregate: side must match account normal balance; no duplicates; journal balances

Code: `backend/app/features/onboarding/opening_balances.py`

---

## Build phases

| Phase | Deliverable |
|-------|-------------|
| **0** | Plan doc, default chart, validate API with block rules |
| **1** | FX OB quantity model; persist chart per entity ✓; post day-one journal; trial balance |
| **2** | Per-supplier opening balances |
| **3** | Per-bank / per-card sub-accounts + OB lines |
| **5** | Partner `2150` sub-ledger + per-partner OB; per-employee staff OB |
| **7** | Balance sheet shows opening equity and account balances |

---

## Out of scope

- Inventory / stock opening values (Decisions §28)
- Automatic opening balance from bank feed (FUTURE_IDEAS)
- P&L account opening balances (revenue/expense accounts rejected)
- Live FX rates for opening or any transaction
