# ROADMAP — Restaurant Bookkeeping App

**Build progress tracker.** Mirrors Decisions §27. Update after every slice — mandatory before marking work complete (see `CURSOR_RULES.md` §2).

**Rule:** Nothing advances to the next slice until the current slice passes the completion gate (characterized → audited → tested → fixed → API verified → ROADMAP updated → commit/tag) and the owner signs off.

---

## Current status

**Crash / new session:** read this file + `PROGRESS.md`, then run the Recovery Protocol in `CURSOR_RULES.md` §5 before changing code. Git wins if docs disagree — then fix the docs.

| Field | Value |
|-------|-------|
| **Active phase** | Phase 8.5 — Pre-frontend API hardening |
| **Active slice** | Phase 8.5 Slice 4 — Flexible dates + soft period locks |
| **Last completed slice** | Phase 8.5 Slice 3 — pagination + search + filters |
| **Last commit/tag** | `v0.47.5-phase8.5-pagination-filters` |
| **Next up** | Slice 4 (dates/locks) → Slice 5 (statement PDF) |

**The whole journey:** Phases 0–8 = backend (DONE, v1 complete). Phase 9 = frontend. Phase 10 = deployment & go-live. Phase 11 = post-launch enhancements. Build strictly in order, one slice at a time, never skipping the completion gate or the golden rules below.

---

## Golden rules — apply to EVERY slice, backend or frontend (non-negotiable)

These are the invariants that keep the books correct and the data safe. They apply to every slice
from here to the end. Most are now enforced by permanent guard-tests that fail the build if violated
(see `test_security_invariants.py`). Cursor must honor all of them on every slice without being asked.

1. **No double-recording.** Every ledger write goes through the single posting boundary
   (`core/ledger`). Nothing constructs a journal entry anywhere else. If unsure whether something
   should post → route it to **Needs Review**, never auto-record. *(Guard-test enforced.)*
2. **No penny leaks (entity isolation).** Every entity-scoped table has RLS; every entity route has
   an auth guard; cross-entity read or write is impossible. Each restaurant is a sealed box.
   *(Guard-tests enforced.)*
3. **Money is integer kuruş, never a float.** Turkish formatting (`1.234,56`, `DD.MM.YYYY`) only at
   the edges (display/input); convert to exact integer kuruş before anything touches the ledger.
4. **Money movements are not income or expense.** Payments, settlements, transfers, FX conversions
   reduce balances — they are never a second revenue or expense. (The recurring double-count trap.)
5. **The books always tie.** Debits = credits on every entry; subledgers tie to their control
   accounts; trial balance / accounting equation balance. Re-verified on every backup restore.
6. **Immutable + audited.** Posted records can't be edited or deleted — corrections are void/reverse,
   and every change records who and when.
7. **Drafts, not auto-posts.** Documents (invoices, receipts, statements, OCR reads) land in a review
   queue; a human confirms before anything posts.
8. **Frontend honors the same rules.** Forms must prevent double-submit (a double click must not
   create two ledger entries), convert Turkish numbers to exact kuruş, and never bypass the review
   queue. The UI is a window onto the engine — it cannot weaken any invariant above.
9. **The completion gate, every slice:** characterized → audited → tested → bugs root-caused & fixed
   → API/flow verified → ROADMAP/PROGRESS updated → commit + semantic tag → owner sign-off. Nothing
   advances until the current slice passes this and the owner signs off.
10. **Anti-monolith & recovery.** Keep files small (split > ~400 lines, no business logic in entry
    files); after any crash/new session, run the Recovery Protocol in `CURSOR_RULES.md` §5; git is the
    source of truth for what's actually done.

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
| Launch readiness | done | Clerk JWT via JWKS; `external_auth_id` on users; invite-only email provisioning; `auth_audit_events`; `AUTH_ENFORCEMENT` default `true`; production boot guard; Bearer token replaces `X-User-Id`; Alembic `037`; 412 pytest |
| Auth hardening + pre-sign-off | done | Production refuses `CLERK_TEST_MODE`; `CLERK_AUDIENCE` required; explicit `email_verified` only; permanent route/posting/RLS guard tests; dashboard + receivables guarded; RLS registry + GUC re-sync; 420 pytest |
| DB provisioning integrity | done | `alembic upgrade head` canonical path; `006` widens version table; `038` RLS+triggers tail; pytest provisions via Alembic; `alembic check` green; 423 pytest |

**Phase 8 complete when:** all slices above done, tested, committed, owner sign-off. **→ Phase 8 COMPLETE ✓ (owner signed off).**

---

## Phase 8.5 — Pre-frontend API hardening

Small, contained backend slice to do **before** any frontend, because the frontend's entry screens
depend on these and retrofitting later means redoing both API and UI. No new accounting logic — these
strengthen the existing write/read APIs.

| Slice | Status | Notes |
|-------|--------|-------|
| 1. Idempotency on writes | done | `IdempotencyMiddleware` on POST/PATCH/PUT/DELETE; client `Idempotency-Key` (UUID) per action; scope = verified user + method + path + key; repeated key returns cached JSON + status; different keys with same payload both succeed; `idempotency_enforcement` setting (default True; conftest False); Alembic `039`; `test_idempotency.py`; 432 pytest |
| 2. Correct / amend operation | done | `correct_journal_entry()` — atomic void + reversal + corrected post in one transaction; `amends_entry_id` / `amended_by_entry_id` links; `LedgerAuditAction.AMEND`; `POST /entities/{id}/ledger/entries/{id}/correct`; Alembic `040`; `test_ledger_correct.py`; 438 pytest |
| 3. Pagination + search + filters | done | Shared `app/core/listing/` (`ListParams`, Turkish-aware `q`, date/amount/status/FK filters, `PaginatedListOut`). All entity list endpoints return `{items, total, limit, offset}`; new `GET .../ledger/entries`. Consistent query params: `q`, `from`, `to`, `min_amount`, `max_amount`, `status`, `*_id`. `test_list_pagination.py`; 444 pytest |
| 4. Flexible dates + soft period locks | planned | Confirm timestamps are stored UTC and transaction dates stay user-entered calendar dates (NO hardcoded timezone, NO timezone setting). Entry date defaults to today but accepts ANY date (batch/backdated entry), floored at go-live. Closed day/month is **soft-locked** (prevents accidental backdating); **owner can unlock + edit** anytime; reopen + changes audited; flag a closed period that changed after close (re-file KDV / inform accountant). |
| 5. PDF export — financial statements | planned | Backend PDF rendering for **P&L, balance sheet, cash flow only** (the shareable statements; owner's choice — other reports stay Excel-only for now, add PDF later if needed). Pull from the SAME report service as the Excel export (one source of truth, no recomputation); integer kuruş → Turkish display format (`1.234,56 ₺`) at the render edge; header with entity name + period + generated date; `Content-Disposition` filename. Same `financial_reports_guard` as the Excel export (cashier blocked). Frontend buttons come in Phase 9 Slice 8. |

**Phase 8.5 complete when:** all slices done, tested, committed, owner sign-off.

---

## Phase 9 — Frontend (record data, then see it)

Backend is v1-complete; this phase puts a usable face on it. Follow `DESIGN_SYSTEM.md` (white bg,
blue `#2563EB`, Inter, Lucide, shadcn token file, the page archetypes, app shell) and the
"structure first, theme later" rule. Stack: Next.js + TypeScript + Tailwind + shadcn/ui. Each slice
is a thin vertical: auth → entity context → API → ledger → read-back, shippable on its own.

Every slice wires existing backend APIs — no new accounting logic. One shared component kit + one
token file (DESIGN_SYSTEM.md); every screen is one of the locked page archetypes. Build all
structure against default tokens; the final look is applied later (Slice 10) by editing only the
token file. Golden rule #8 applies to every form.

| Slice | Status | Notes |
|-------|--------|-------|
| 1. Shell + login + first entry | next | Clerk login (email + Google, Apple optional, verified-email linking); app shell (sidebar/topbar) + restaurant switcher sets entity context (Bearer token + entity id on every call); one end-to-end flow — record a manual **expense** and see it listed. Proves the whole pipe. Tag `v0.48.0`. |
| 2. Daily sales + expenses | planned | Manual sales (cash/card/totals, cash+card=total validation) + expense forms + read-back lists. Turkish number input → kuruş; DD.MM.YYYY; keyboard-first; no double-submit. |
| 3. Suppliers & payables | planned | Supplier master CRUD; invoice draft → confirm; record payment; supplier ledger + payables (running balances) views. |
| 4. Banking & cash | planned | Account tree + balances; statement upload → classify → Needs Review; transfers; cash drawer (open / movements / EOD close with over-short); FX wallets (purchase / convert / spend). |
| 5. POS & delivery sales | planned | POS daily-summary + card-sales intake; delivery platform reports + settlements + reconciliation; user-managed delivery platforms; commission e-Faturas. |
| 6. Staff, partners, receivables, tips | planned | Entry forms + ledger views for each subledger (salary vs advance, partner reimbursements, customer receivables, tip pot in/out). |
| 7. Needs-review queue + document upload | planned | Photo/scan/PDF upload → OCR read → side-by-side review (original + extracted fields + confidence) → confirm-to-post. The review-first heart; nothing posts unconfirmed. |
| 8. Dashboard + reports | planned | Dashboard tiles; Reports card-library landing; P&L / balance sheet / cash flow / KDV input / delivery sales / period comparison read views. **Export = ONE "Download" control per report (dropdown menu of formats), NOT separate buttons:** all reports offer Excel; the three financial statements (P&L / balance sheet / cash flow) additionally offer PDF (backend from Phase 8.5 Slice 5). Shared download component, consistent everywhere. Role-gated (cashier can't see financials). |
| 9. Settings & onboarding | planned | Opening-balances wizard; members/roles management; entity settings; delivery-platform management; backup status; create / switch restaurants. |
| 10. Theme refinement + UX polish | planned | Apply final theme via the one token file (zero page rework); empty states, loading skeletons, toasts, command palette, full keyboard + touch + accessibility pass. |

**Phase 9 complete when:** all slices done, tested, committed, owner sign-off → **frontend v1 complete.**

---

## Phase 10 — Deployment & go-live

Take the tested app to a real, secure production environment and put real data in it.

| Slice | Status | Notes |
|-------|--------|-------|
| 1. Hosting & infrastructure | planned | Provision managed Postgres + Redis + app host + object storage (uploads & backups); set all secrets/env vars; HTTPS/SSL + domain. |
| 2. Production provisioning | planned | Stand up the DB via the canonical `alembic upgrade head`; confirm RLS + immutability triggers present on the prod-equivalent DB; Clerk **production** keys + JWT template emitting `email`/`email_verified`; `AUTH_ENFORCEMENT=true`, `CLERK_TEST_MODE` off (boot guard verified). |
| 3. Backups live | planned | Scheduled backups running to off-site storage; run a real restore-verify in production and confirm the books tie; alert on backup failure. |
| 4. Observability | planned | Error tracking, structured logging, uptime/health checks, basic rate limiting. |
| 5. Pre-launch security pass | planned | Tighten `create_entity` (auth required); dependency scan (no high/critical CVEs); secrets audit; full suite green under production settings; final guard-test run. |
| 6. Owner onboarding & smoke test | planned | Create the real restaurant(s), seed chart, enter opening balances, invite users with roles; run the end-to-end smoke test in production; **go live.** |

**Phase 10 complete when:** app is live, backed up, monitored, and the owner has recorded real data successfully.

---

## Phase 11 — Post-launch enhancements (parking lot)

Not built until promoted into `Restaurant_Bookkeeping_App_Decisions.md` first. Sequence by need.

- **Bank feed (read-only) adapter** — account-information / transaction pull only; never payment-initiation (the app never moves money). Same normalized transaction rows as manual statement import, feeding the existing classify → clearing → near-match → anti-double-count pipeline (downstream unchanged). Manual upload stays permanently as universal fallback; both coexist. When built: dedup on bank unique transaction ID, consent/token expiry + reconnect, reconcile feed balance to statement, confirm route (direct bank API vs aggregator).
- **Proper KDV/tax-return module** — output − input, declaration, periods (input VAT already captured per rate).
- **FX revaluation** — period-end holding revaluation (today FX is cost-only; gain/loss accounts already exist).
- **Owner combined-restaurant view** — cross-entity, read-only overview (entity-stamped data already supports it).
- **Recipe costing / food-cost %** — ingredient → recipe → menu item; the COGS world deliberately out of v1.
- **Receipt AI learning store** — remember owner corrections to pre-fill future reads.
- **Restore UI + configurable backup schedules**; **scheduled/emailed reports**; **custom report builder**.

---

## Slice log (recent completions)

| Date | Slice | Commit/tag | Summary |
|------|-------|------------|---------|
| 2026-06-23 | Pagination + search + filters | `v0.47.5-phase8.5-pagination-filters` | Shared listing module; paginated list responses on all list endpoints; ledger entries list; 444 pytest |
| 2026-06-23 | Idempotency on writes | `v0.47.3-phase8.5-idempotency` | Server-side `Idempotency-Key` middleware; `idempotency_records` table; 432 pytest |
| 2026-06-22 | DB provisioning | `v0.47.2-phase8-db-provisioning` | Alembic chain fix, canonical `upgrade head`, RLS+triggers migration 038, 423 pytest |
| 2026-06-22 | Auth hardening | `v0.47.1-phase8-auth-hardening` | CLERK_TEST_MODE + audience production guards; permanent route/posting/RLS tests; RLS GUC re-sync; 420 pytest |
| 2026-06-22 | Launch readiness | `39d11ed` / `v0.47.0-phase8-launch-readiness` | Clerk JWT/JWKS auth, invite-only provisioning, AUTH_ENFORCEMENT default on, 412 pytest |
| 2026-06-22 | Backups | `eed9f92` / `v0.46.0-phase8-backups` | pg_dump+uploads artifact, S3/local storage, Celery+Redis schedule, retention, restore-verify, OPS_RESTORE.md, 401 pytest |
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
