# ROADMAP — Restaurant Bookkeeping App

**Build progress tracker.** Mirrors Decisions §27. Update after every slice — mandatory before marking work complete (see `CURSOR_RULES.md` §2).

**Rule:** Nothing advances to the next slice until the current slice passes the completion gate (characterized → audited → tested → fixed → API verified → ROADMAP updated → commit/tag) and the owner signs off.

---

## Current status

**Crash / new session:** read this file + `PROGRESS.md`, then run the Recovery Protocol in `CURSOR_RULES.md` §5 before changing code. Git wins if docs disagree — then fix the docs.

| Field | Value |
|-------|-------|
| **Active phase** | Phase 8 — Roles & permissions, backups, security hardening, launch |
| **Active slice** | Launch readiness |
| **Last completed slice** | Backups (Phase 8 Slice 2) |
| **Last commit/tag** | `f0490f7` / `v0.46.0-phase8-backups` |
| **Next up** | Launch readiness (Phase 8 Slice 4) |

---

## Phase 0 — Setup

Project, rulebook, logs, multi-restaurant foundation, opening-balances plan.

| Slice | Status | Notes |
|-------|--------|-------|
| Project rules & docs (`CURSOR_RULES`, `ROADMAP`, logs) | done | Rules, ROADMAP, record-keeping stubs, git remote |
| App scaffold & repo setup | done | FastAPI backend, Next.js shell, Postgres docker, pytest, `.cursor/rules` |
| Multi-restaurant foundation | done | Entity model, RLS, entity_context, isolation tests |
| Opening-balances plan | done | Plan doc, default chart, validate API, wizard steps |

**Phase 0 complete when:** all slices above done, tested, committed, owner sign-off. **→ Phase 0 COMPLETE (pending owner sign-off on this slice).**

---

## Phase 1 — Ledger core + supplier invoices

Double-entry engine + chart of accounts, audit trail, soft-delete/void, basic manual journals, read e-Fatura invoices. **(Start here after Phase 0.)**

| Slice | Status | Notes |
|-------|--------|-------|
| Chart of accounts + entity scoping | done | Persisted `accounts` table, seed API, RLS |
| Double-entry posting service (single boundary) | done | `post_journal_entry`, journal tables, RLS, 6 tests |
| Audit trail on all changes | done | `ledger_audit_events`; actor_id on post/void; RLS |
| Void / reverse (no hard deletes) | done | `void_journal_entry`, immutability ORM + DB triggers, 7 tests |
| Ledger DB immutability (bootstrap + void gate) | done | `ledger_immutability.py`, bootstrap triggers, audit append-only, raw SQL tests |
| Basic manual journals | done | `JournalEntrySource`, `POST/GET .../manual-journals`, void; generic post removed |
| Read e-Fatura invoice (PDF) into draft | done | `invoice_drafts`, UBL-TR XML parser, PDF stub/heuristics, duplicate fingerprint, 11 tests |

**Phase 1 complete when:** all slices above done, tested, committed, owner sign-off. **→ Phase 1 COMPLETE (pending owner sign-off).**

---

## Phase 2 — Suppliers & payables

| Slice | Status | Notes |
|-------|--------|-------|
| Supplier master (per entity) | done | `suppliers` table, VKN unique per entity, CRUD API, RLS, 15 tests |
| Payables ledger & balance | done | `supplier_ledger_entries`, `record_supplier_movement()`, payables API, RLS + immutability, 12 tests |
| Draft → supplier linking | done | `supplier_id` FK on `invoice_drafts`, VKN auto-link on upload, link/unlink API, 8 tests |
| Draft review / confirm workflow | done | `confirmed` status, confirm/reject API, `?status=` filter, confirmed immutable, 6 tests |
| Payment reduces payable | done | Superseded by supplier payment GL slice — was payables-only subledger |
| Invoice → payable posting (draft-to-ledger) | done | `post_confirmed_draft()`, GL + payables in one transaction; `posted` status; Input VAT `1500`; 10 tests |
| Supplier payment GL posting | done | `post_supplier_payment()` atomic GL+subledger (Dr AP, Cr bank/cash); `journal_entry_id` on subledger; `payment_account_id` required; AP control-account tests; 5 GL tests + updated payables tests; 132 pytest |

**Phase 2 complete when:** all slices above done, tested, committed, owner sign-off. **→ Phase 2 COMPLETE ✓ (owner signed off).**

---

## Phase 3 — Banking hub + bank statements

Account tree, import & classify, transfer linking, opening balances. **Statement-first:** flows start from uploads, not invented transactions.

| Slice | Status | Notes |
|-------|--------|-------|
| Bank/cash account tree (per entity) | done | `money_accounts` + GL sub-accounts under `1100`/`1000`; tree API with balances |
| Statement import & classify | done | CSV import; supplier payment link-or-post; near-match → needs_review; transfer classify; `bank_fee` + `credit_card_payment` post GL (Phase 4); `unknown` classify-only |
| Transfer linking (own-account, not income/expense) | done | `post_account_transfer()` Dr destination / Cr source (`source=transfer`); `account_transfers` table; statement classify outflow post + inflow link-or-post; manual transfer API; Alembic `017`; 9 tests; 160 pytest |
| Opening balances | done | `post_opening_balances()` — aggregate + `money_account_id` + `supplier_id` lines; GL offset `3900`; supplier subledger with `journal_entry_id`; one-time guard; validate + post API; `go_live_date` setting; 22 tests; 172 pytest |
| Near-match payment/transfer detection | done | ±3 day window; exact date → auto-link; near date → `needs_review` + candidate FK (no second GL post); confirm via classify PATCH; Alembic `018` |

**Phase 3 complete when:** all slices above done, tested, committed, owner sign-off. **→ Phase 3 COMPLETE (pending owner sign-off).**

### Banking classification GL posting policy (ongoing)

Every statement-line classification that represents a **real GL event** must post (or link to an existing journal) in its delivery slice — **never left classify-only**.

| Classification | GL in slice | Status |
|----------------|-------------|--------|
| `supplier_payment` | Dr AP / Cr bank — link exact or near-match, else post | done |
| `transfer` | Dr destination / Cr source — link exact or near-match, else post | done |
| `bank_fee` | Dr bank charges `5300` / Cr bank | done (Phase 4 Slice 4) |
| `credit_card_payment` | Dr CC payable / Cr bank | done (Phase 4 Slice 4) |
| `pos_settlement` / card deposit | Dr bank / Cr card clearing `1400` | done (Phase 4 Slice 1) |
| `delivery_settlement` | Dr bank / Cr platform clearing | done (Phase 6 Slice 2) |
| `rent_utility` | Dr expense / Cr bank | done (Phase 6 Slice 6) |
| `tax_payment` | Dr tax liability / Cr bank | **Phase 5/7** (tax module) |
| `owner_draw` | Dr equity / Cr bank | **Phase 5** (owner movements) |
| `customer_payment` | Dr bank / Cr AR | **done** (Phase 5 Slice 5) |
| `partner_reimbursement` | Dr `2150` / Cr bank | **done** (Phase 5 Slice 4) |
| `unknown` | No GL — stays in Needs Review until reclassified | by design |

**Rule:** `unknown` is the only intentional classify-only path (Needs Review until reclassified). All other real-event classifications post GL in their delivery slice.

---

## Phase 4 — POS settlement + credit cards

| Slice | Status | Notes |
|-------|--------|-------|
| POS settlement intake | done | `post_pos_settlement()` Dr bank / Cr `1400`; `pos_settlements` table; `JournalEntrySource.POS_SETTLEMENT`; statement classify `pos_settlement` (inflow only); manual + list/detail API; Alembic `019`; 8 tests; 187 pytest |
| Credit card clearing accounts | done | `MoneyAccountKind.CREDIT_CARD` under `2100`; tree API `credit_cards` branch; OB via `money_account_id` uses GL normal balance (CREDIT for cards); reject aggregate `2100` when card sub-accounts exist; Alembic `020`; 10 tests; 197 pytest |
| Card sales → bank deposit reconciliation | done | `card_sales_batches` table; `post_card_sales_batch()` Dr `1400` / Cr `4000`; settlement commission (explicit or inferred from linked batch) Dr bank + Dr `5300` / Cr `1400` gross; `GET .../pos/clearing-reconciliation`; Alembic `021`; 8 tests; 205 pytest |
| Credit card payment + bank fee GL | done | `credit_card_payment` classify + `post_credit_card_payment()` Dr CC payable / Cr bank; `post_bank_fee()` Dr `5300` / Cr bank; `credit_card_payments` table; statement-line linking; Alembic `022`; 10 tests |

**Phase 4 complete when:** all slices above done, tested, committed, owner sign-off. **→ Phase 4 COMPLETE ✓ (owner signed off).**

---

## Phase 5 — Cash drawer, forex, staff, partner reimbursements, receivables

| Slice | Status | Notes |
|-------|--------|-------|
| Cash drawer | done | `post_cash_movement()` Dr/Cr cash GL + offset; EOD close posts over/short to `5400`; `cash_drawer_sessions` + `cash_movements`; day locked on close; Alembic `023`; 9 tests; 224 pytest |
| Forex (FX purchase / holding) | done | `MoneyAccountKind.FOREIGN_CURRENCY` + `currency`; GL sub-accounts under `1010`/`1020`/`1030` (TRY cost kuruş); `fx_ledger_entries` subledger (native quantity + try_cost_kurus); `post_fx_purchase()` Dr FX / Cr TRY cash; tree `foreign_currency` branch; Alembic `024`; 10 tests; 234 pytest |
| Staff (salary vs advance — no double-count) | done | `employees` + `staff_ledger_entries`; `2250` Salaries Payable; TRY accrual Dr `5100`/Cr `2250`; advance Dr `1300`/Cr cash; payment Dr `2250`/Cr `1300`+cash (atomic advance offset); FX accrual subledger-only; FX payment Dr `5100`/Cr FX GL + `fx_ledger` spend; Alembic `025`; 9 tests; 243 pytest |
| Partner reimbursements | done | `partners` + `partner_ledger_entries`; expense fronted Dr expense/Cr `2150`; reimbursement Dr `2150`/Cr cash (no expense); per-partner OB via `partner_id` lines; Alembic `026`; 10 tests; 252 pytest |
| Receivables | done | `customers` + `customer_ledger_entries`; credit sale Dr `1200`/Cr `4000`; payment Dr bank/Cr `1200` (no revenue); per-customer OB via `customer_id`; statement classify `customer_payment`; Alembic `027`; 8 tests; 260 pytest |
| FX spend / conversion | done | `post_fx_conversion()` Dr bank/cash / Cr FX GL at average cost + realized gain `4200` or loss `5600`; `post_fx_expense_spend()` Dr expense / Cr FX at average cost; `SPEND` subledger row; owner-entered TRY received; no holding revaluation; 6 tests; 266 pytest |

**Phase 5 complete when:** all slices above done, tested, committed, owner sign-off. **→ Phase 5 COMPLETE ✓ (owner signed off).**

---

## Phase 6 — Sales intake + tips + expenses

POS daily-summary photo + delivery platform reports; commission e-Faturas (e-Fatura intake, credits platform clearing — not payables); manual entry; handwritten reading as fallback.

| Slice | Status | Notes |
|-------|--------|-------|
| POS daily-summary photo intake | done | `pos_daily_summaries`; OCR v1 fixture + text heuristics; math check → `needs_review`; confirm posts card batch Dr `1400`/Cr `4000` + cash in Dr cash/Cr `4000` (never total line); duplicate fingerprint 409; duplicate-day guard (`029`); Alembic `028`/`029`; tag `v0.32.1`; 279 pytest |
| Delivery platform reports (gross / commission / net) | done | `delivery_reports` + `delivery_settlements`; `post_delivery_report()` Dr clearing / Cr `4000` gross; `post_delivery_settlement()` Dr bank / Cr clearing net; statement classify `delivery_settlement` (`delivery_platform_id`); reconciliation iterates entity platforms; Alembic `030` |
| User-managed delivery platforms | done | `delivery_platforms` table — owner add / rename / deactivate; auto clearing GL sub-account under parent `1450` (mirrors bank/card sub-accounts); reports/settlements/commission/reconciliation keyed by `delivery_platform_id`; removed fixed enum + comma-separated `delivery_platforms` setting; legacy `1410`–`1430` migrated; API `POST/GET/PATCH .../delivery/platforms`; Alembic `032`; 300 pytest |
| Commission e-Faturas | done | Reuse `invoice_drafts` with `invoice_kind=delivery_commission` + `delivery_report_id` FK; `post_delivery_commission_draft()` Dr `5500` + Dr `1500` / **Cr platform clearing GL** (via linked platform) — **not** `2000` AP; link/report mismatch → `needs_review`; `commission_journal_entry_id` on report; Alembic `031` |
| Tips (pass-through, not revenue/expense) | done | `tip_accruals` + `tip_payouts`; card Dr `1400`/Cr `2260`; cash held Dr cash/Cr `2260`; payout Dr `2260`/Cr cash (not expense); balance check on pot; chart `2260` Tips Payable; API `POST/GET .../tips/accruals`, `POST/GET .../tips/payouts`, `GET .../tips/balance`; Alembic `033`; tag `v0.35.0`; 307 pytest |
| Expenses + spelling tolerance | done | `expense_items` + `expense_item_aliases` + `expense_entries`; Turkish-aware normalization + fuzzy match → `needs_review`; confirm remembers alias; manual Dr expense / Cr bank or cash; `rent_utility` bank classify with `expense_account_id`; `has_source_document=false` on manual entry; API `POST/GET .../expense-items`, `POST .../merge`, `POST/GET .../expenses`, `POST .../confirm-item`; Alembic `034`; tag `v0.36.0`; 317 pytest |

**Phase 6 complete when:** all slices above done, tested, committed, owner sign-off. **→ Phase 6 COMPLETE (owner signed off).**

*Note: Phase 6 may need to land with or just before Phase 4 (settlements reconcile against sales). Resequence if dependencies require — the firm rule is tested + signed off, not strict phase numbering.*

---

## Phase 7 — Dashboard, reports, Excel export, financial statements

P&L, Balance Sheet, Cash flow, per-rate KDV report, period comparison, delivery sales by platform.

| Slice | Status | Notes |
|-------|--------|-------|
| Delivery sales report | done | `GET .../reports/delivery-sales?from=&to=` — gross per platform + total; posted `delivery_reports` only; all platforms (active + inactive); `delivery_enabled` guard |
| Dashboard | done | `GET .../dashboard?from=&to=` — period sales/expenses/net, payables preview, receivables, TRY position + FX wallets, delivery in-transit, needs-review counts; optional `supplier_id`, `money_account_id`, `expense_account_id` filters |
| P&L & Balance Sheet (per entity) | done | `GET .../reports/profit-and-loss?from=&to=` — all active revenue/expense accounts, natural sign period activity, totals; `GET .../reports/balance-sheet?as_of=` — asset/liability/equity sections, `unclosed_net_income_kurus` synthetic equity line, accounting equation check; posted only, void reversals excluded |
| Cash flow statement | done | `GET .../reports/cash-flow?from=&to=` — TRY liquid bank+cash only; opening/closing from `balance_as_of_kurus`; direct method by journal source (operating/financing); transfers + opening_balance excluded from categorization; reconciliation flags |
| Per-rate KDV report | done | `GET .../reports/kdv-input?from=&to=` — purchase/input VAT per rate from posted `invoice_drafts` (`supplier` + `delivery_commission`); aggregate `vat_breakdown`; distinct invoice counts per rate |
| Period comparison | done | `GET .../reports/period-comparison?from=&to=` — current vs prior period metrics (dashboard/P&L/KDV/cash flow/delivery gross); auto same-length prior window; optional `prior_from`/`prior_to` override; omits payables/receivables/TRY position (not true period-over-period without as-of history) |
| Excel export | done | `GET .../reports/{report}/export` — openpyxl xlsx for P&L, balance sheet, cash flow, KDV input, delivery sales, period comparison; integer kuruş; `Content-Disposition` attachment filenames |

**Phase 7 complete when:** all slices above done, tested, committed, owner sign-off. **→ Phase 7 COMPLETE ✓ (owner signed off).**

---

## Phase 8 — Roles & permissions, backups, security hardening, launch

| Slice | Status | Notes |
|-------|--------|-------|
| Roles & permissions | done | `users` + `entity_memberships`; `EntityRole` enum; extensible `Permission` layer; `X-User-Id` v1 transport; `AUTH_ENFORCEMENT` flag (default off); financial reports guarded (cashier blocked from P&L/BS/cash flow/period comparison); membership CRUD API; Alembic `035`; 389 pytest |
| Backups | done | pg_dump + uploads tar artifact with manifest/checksum; local + S3-compatible SSE storage; Celery+Redis daily schedule; retention 14d/8w; restore-verify integrity checks; `OPS_RESTORE.md`; 401 pytest (403 with pg_dump) |
| Security hardening | done | `operations_write_guard` + `reports_read_guard` + `member_read_guard`; mutation + entity-scoped read routes wired; `list_entities` scoped to caller memberships; `create_entity` requires auth when enforced; Alembic `036`; 398 pytest |
| Launch readiness | not started | Flip `AUTH_ENFORCEMENT` default to `true`; replace `X-User-Id` stub with real auth (JWT/login/OAuth) |

**Phase 8 complete when:** all slices above done, tested, committed, owner sign-off.

---

## Later (post-v1)

Not in current build order — track here when scoped:

- **Bank feed (read-only) adapter** — account-information / transaction pull only; never payment-initiation (the app never moves money). Additional input adapter producing the same normalized transaction rows as manual statement CSV import, feeding the existing classify → clearing → near-match → anti-double-count pipeline (downstream logic unchanged). Manual statement upload stays permanently as universal fallback (every bank; feed down). Both coexist — feed never replaces upload. When built: dedup on bank unique transaction ID (overlapping daily pulls), consent/token expiry + reconnect, reconcile feed balance to statement, confirm connection route (direct bank API vs aggregator) before committing. *Later enhancement — after core build.*
- Proper KDV/tax-return module
- Per-rate VAT separation (if needed beyond Phase 7)
- FX revaluation
- Owner combined-restaurant view

---

## Slice log (recent completions)

| Date | Slice | Commit/tag | Summary |
|------|-------|------------|---------|
| 2026-06-22 | Backups | `f0490f7` / `v0.46.0-phase8-backups` | pg_dump+uploads artifact, S3/local storage, Celery+Redis schedule, retention, restore-verify, OPS_RESTORE.md, 401 pytest |
| 2026-06-22 | Security hardening | — / `v0.45.0-phase8-security-hardening` | write/read/report guards on all entity routes; scoped entity list; membership user-lookup RLS; 398 pytest |
| 2026-06-22 | Roles & permissions | — / `v0.44.0-phase8-roles-permissions` | users + entity_memberships, permission layer, financial report guards, 389 pytest |
| 2026-06-22 | POS daily-summary photo intake | `4a529b3` / `v0.32.0-phase6-pos-daily-summary-intake` | `pos_daily_summaries`, OCR v1, confirm posts card batch + cash in, 275 pytest |
| 2026-06-21 | App scaffold & repo setup | `d91ccec` / `v0.1.0-phase0-scaffold` | FastAPI + Next.js monorepo, Mizan shell, money type, docker Postgres, pytest |
| 2026-06-21 | Multi-restaurant foundation | `29ce4a3` / `v0.2.0-phase0-entity-isolation` | Entity + RLS, entity_context, cross-entity isolation tests |
| 2026-06-21 | Opening-balances plan | `451c57f` / `v0.4.0-phase0-complete` | Default chart, OB validation, wizard plan, Phase 0 done |
| 2026-06-21 | Chart of accounts + entity scoping | `781b7f0` / `v0.5.0-phase1-chart-of-accounts` | Persisted accounts, seed/list API, RLS isolation |
| 2026-06-21 | Read e-Fatura invoice into draft | `a952821` / `v0.9.0-phase1-efatura-draft` | invoice_drafts, UBL-TR XML, PDF heuristics, 70 pytest |
| 2026-06-21 | Supplier master (per entity) | `63ed5cf` / `v0.10.0-phase2-supplier-master` | suppliers CRUD, VKN lookup, entity isolation, 85 pytest |
| 2026-06-21 | Payables ledger & balance | `48dbdd7` / `v0.11.0-phase2-payables-ledger` | supplier_ledger_entries, running balance, payables API, 97 pytest |
| 2026-06-21 | Invoice → payable posting (draft-to-ledger) | `3f367f5` / `v0.15.0-phase2-draft-to-ledger` | confirmed draft → GL + payables; Input VAT 1500; 127 pytest |
| 2026-06-21 | Supplier payment GL posting | `a08e703` / `v0.16.0-phase2-supplier-payment-gl` | `post_supplier_payment()` Dr AP Cr bank/cash + subledger; Phase 2 complete |
| 2026-06-21 | Bank/cash account tree | — / `v0.17.0-phase3-bank-cash-tree` | `money_accounts` + GL sub-accounts; tree API; 143 pytest |
| 2026-06-21 | Statement import & classify | `6133506` / `v0.18.0-phase3-statement-import-classify` | CSV import + classify; link-or-post supplier payments; 151 pytest |

---

*Keep this file current. If it disagrees with git or `PROGRESS.md`, git wins — then fix the docs.*
