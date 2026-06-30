# ROADMAP — Restaurant Bookkeeping App

**Build progress tracker.** Mirrors Decisions §27. Update after every slice — mandatory before marking work complete (see `CURSOR_RULES.md` §2).

**Rule:** Nothing advances to the next slice until the current slice passes the completion gate (characterized → audited → tested → fixed → API verified → self-audited → ROADMAP updated → commit/tag) and the owner signs off.

---

## Current status

**Crash / new session:** read this file + `PROGRESS.md` **Current** table only, then run the Recovery Protocol in `CURSOR_RULES.md` §5 before changing code. **Git + last tag win** if docs disagree — then fix the docs. **One agent, one active slice** — do not start the next slice until the current one is committed and tagged.


| Field                    | Value                                                                                                        |
| ------------------------ | ------------------------------------------------------------------------------------------------------------ |
| **Active phase**         | Phase 12.5 — Nav cleanup, bank import (Turkish) & statement learning (owner-driven, pre-launch)              |
| **Active slice**         | **IC-C** — Invoice review confidence UX (see `POST_LAUNCH_PLAN.md` § IC-C) |
| **Last completed slice** | Invoice classification fixtures (`v0.73.21-invoice-classification-fixtures`) |
| **Last commit/tag**      | `v0.73.21-invoice-classification-fixtures` — YS Hizmet Bedeli detection; supply layout; Spice Corner fixtures; intake confidence; platform link no longer forces commission |
| **Next up**              | **IC-C** (review UX); then **FP/FS**; then **P3/P5/P6**; **IC-D** learning after IC-C stable; **P8** groceries design |


### Next plan (pre-launch, owner-driven)

1. ~~**Clearance auto-pick (backend, small).**~~ **DONE (`v0.72.0-clearance-auto-pick`).** HIGH-confidence learned rules auto-**link** (never create) `pos_settlement` / `delivery_settlement` inflows when exactly one unused settlement record matches; zero or multiple matches → Needs Review. Delivery resolves platform by unique match across entity platforms.
2. **Invoice classification (IC-A–IC-D)** — **NEXT.** Unconfirm/redo on confirmed drafts; fix Yemeksepeti + Getir supply vs commission detection; Spice Corner PDF fixture corpus; review UX; per-entity learning (IC-D deferred). Full spec: **`POST_LAUNCH_PLAN.md` § IC**. Blocks FP/FS until IC-A–IC-C ship.
3. **Run pending migrations before go-live:** `alembic upgrade head` applies through **`059`** (`052`–`059`: import profiles, CSV options, classification rules, rule auto-apply, entity `legal_name`, expense item default account, entity **`vkn`**, delivery monthly sales). Ensure `xlrd` installed.
4. **Phase 12 owner sign-off** — record first real restaurant on production (provision Postgres, secrets, backup-restore drill, walk a day).
5. **Feature gaps FP/FS** — partner advance; salary advance auto-clear (after IC-A–IC-C).
6. **P3/P5/P6** — upload backup, delete company UI, production cutover (`POST_LAUNCH_PLAN.md`).
7. **P8** — groceries / no-invoice card spend (design only until promoted).
8. *Optional later:* generic global "starter phrasebook" of non-private TR type-patterns for day-one defaults (personal rules always override).

**2b — Unified statement review hub (frontend) — DONE (`v0.71.16`).** `/banking/review`: status tabs (needs review · auto-posted · posted · linked), inline confirm/classify/correct/create-supplier, suggestion display, token trim, `rule_auto` highlighting.

**The whole journey:** Phases 0–10 = backend + frontend v1 + §10 UX (`v0.67.x`). **Phase 11** = owner-visible product fixes surfaced by code audit (onboarding, corrections, UX) — **complete** (`v0.69.13-ui-gaps`). **Phase 12** = deployment & go-live. **Phase 13** = post-launch parking lot. Build strictly in order, one slice at a time, never skipping the completion gate or the golden rules below.

### Do not rebuild (already done — git is source of truth)


| Work                                                                             | Tag / commit                                      | Status         | Do **not** duplicate                                                                                                       |
| -------------------------------------------------------------------------------- | ------------------------------------------------- | -------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Tips = cash expense (`5700`), gross sales, no `2260`                             | `v0.48.0-tips-expense-slice-a`                    | done           | Re-add tips payable pot, POS carve-out, or `2260`                                                                          |
| Card commission total-clearance sweep                                            | `v0.50.0-pos-commission-total-clearance-slice-b2` | done           | Re-add `commission_recognition` setting or per-deposit commission UI                                                       |
| Tip photo OCR stub                                                               | `v0.51.0-expense-photo-tip-ocr-slice-c`           | done           | New tip-only pipeline — use unified `expense-receipts`                                                                     |
| Multi-line expense receipt + manual sales API                                    | `v0.52.0`–`v0.54.0`, `d2a624b`                    | done           | Re-build D1–D3 intake from scratch                                                                                         |
| **Original Slice B1** (`card_sale_basis`, `POS_CARD_TIP` at confirm)             | `v0.49.0`                                         | **superseded** | Re-implement `system`/`z_report`/`ask` tip posting at POS                                                                  |
| **Z match-or-review** (Z == system card; tips expense-only)                      | `v0.57.0-pos-z-match-or-review`, `a6dd4e6`        | done           | Re-derive `tip = Z − card` at POS or book `5700` on confirm                                                                |
| Phase 9 New menu + receipt review                                                | `v0.55.0-phase9-new-menu`                         | done           | Re-scaffold shell / New dropdown                                                                                           |
| Phase 9 read-back + Clerk                                                        | `v0.56.0-phase9-readback-clerk`                   | done           | Re-wire auth from scratch                                                                                                  |
| Nav consolidation (section tabs, reports cards, settings hub)                    | `v0.71.9`                                         | done           | Re-flatten to per-page sidebar rows or re-add duplicate report/settings entries                                            |
| Single-item sidebar groups → direct links                                        | `v0.71.10`                                        | done           | Re-wrap single-destination groups in accordions                                                                            |
| Excel statement import (.xlsx openpyxl, .xls xlrd) + lira amount column          | `v0.71.11`, `v0.71.12`                            | done           | Route `.xls` to openpyxl; revert amount column to kuruş                                                                    |
| Bank import column mapping + saved per-account profiles                          | `v0.71.13`                                        | done           | Re-add fixed-header-only import; mapping handles Borç/Alacak + start row                                                   |
| Turkish CSV reading (cp1254/latin-1, `;` sniff)                                  | `v0.71.13.1`                                      | done           | Re-add UTF-8/comma-only CSV reader                                                                                         |
| Statement classification learning (per-entity rules, suggest + learn on confirm) | `v0.71.14`                                        | done           | Build a **global/shared** rule store — rules are per-entity (RLS), never cross-user                                        |
| Statement rule auto-apply (high-confidence, correction-reset, reversible)        | `v0.71.15`                                        | done           | Auto-post outside BANK_FEE/SUPPLIER_PAYMENT, or without the void/relearn correction path                                   |
| Unified statement review hub (frontend)                                          | `v0.71.16`                                        | done           | Re-build per-statement-only review; `/banking/review` is the canonical hub                                                 |
| Learned-token trim on classify/correct (`match_token`)                           | `v0.71.17`                                        | done           | Re-wire token trim only on create-supplier; blank token must keep full-description learn behavior                          |
| Clearance auto-pick (POS/delivery settlement link-only)                          | `v0.72.0-clearance-auto-pick`                     | done           | Re-auto-create settlements on import; auto-link without HIGH rule + unique match; delivery without platform disambiguation |
| Turkish e-Fatura PDF heuristics (supplier + delivery commission layouts)         | `bad0de6` / `v0.73.7-company-profile-efatura-suppliers` | done       | Re-add SAYIN/VKN layout parsing; Malzeme/Hizmet net label; buyer-VKN exclusion — already shipped                                           |
| Entity company profile (VKN required on create, editable)                        | `v0.73.7-company-profile-efatura-suppliers`       | done           | Re-build VKN on entity; migration `058` already applied in code                                                                              |
| e-Fatura auto-create supplier on upload                                          | `v0.73.7-company-profile-efatura-suppliers`       | done           | Re-add `find_or_create_supplier_for_efatura`; bank lines stay manual-only                                                                    |
| **POS/delivery settlement clearing + commission split (net vs gross)**           | `v0.18.0` + `core/pos`/`core/delivery` posting    | done           | **Re-build deposit clearing or commission net/gross logic — it already exists**                                            |
| Delivery monthly gross sales + platform-linked commission                        | `v0.73.18-delivery-monthly-sales`                 | done           | Re-add per-report commission/net on sales rows, `link-delivery-report`, report-linked commission post                        |
| Supplier activity timeline + inline invoice preview                              | `v0.73.19-supplier-activity-invoice-preview`        | done           | Re-build separate ledger/invoice tabs; commission confirm requiring supplier; block duplicate discard                        |
| Invoice unconfirm / redo (IC-A)                                                | `v0.73.20-invoice-unconfirm-redo`                   | done           | Unconfirm confirmed→draft; reject/discard confirmed; set-kind reclassify; review UI |
| Invoice classification fixtures + post fixes (IC-B)                            | `v0.73.21-invoice-classification-fixtures`          | done           | YS Hizmet Bedeli; supply Depo/SKU; Spice Corner PDF fixtures; intake confidence; platform link preserves kind |
| Invoice review confidence UX (IC-C)                                            | *queued* — see `POST_LAUNCH_PLAN.md` § IC-C         | planned        | Badge + suggest type; needs_review path only when not HIGH confidence |


**Owner sign-off ✓ (2026-06-28)** on Phase 12.5 statement-learning arc through clearance auto-pick (`v0.72.0-clearance-auto-pick`) — rule auto-post (bank fee + supplier payment), review hub, match_token trim, POS/delivery link-only auto-clear.

**Owner sign-off ✓ (2026-06-21)** on money-critical rows below — tips A/B2/C, Phase 8.7 D1–D3, Phase 9 core (`v0.52.0`–`v0.56.0`), Z match-or-review (`v0.57.0`). Original Slice B1 (`v0.49.0`) was superseded before sign-off. Tag `v0.57.1-owner-sign-off`.

**Detailed plan:** `.cursor/plans/expense_ocr_+_add_menu_a4ddb775.plan.md` (owner confirmed: one expense per receipt line, cash-only payment).

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


| Slice                                                  | Status | Notes                                                                    |
| ------------------------------------------------------ | ------ | ------------------------------------------------------------------------ |
| Project rules & docs (`CURSOR_RULES`, `ROADMAP`, logs) | done   | Rules, ROADMAP, record-keeping stubs, git remote                         |
| App scaffold & repo setup                              | done   | FastAPI backend, Next.js shell, Postgres docker, pytest, `.cursor/rules` |
| Multi-restaurant foundation                            | done   | Entity model, RLS, entity_context, isolation tests                       |
| Opening-balances plan                                  | done   | Plan doc, default chart, validate API, wizard steps                      |


**Phase 0 complete when:** all slices above done, tested, committed, owner sign-off. **→ Phase 0 COMPLETE (pending owner sign-off on this slice).**

---

## Phase 1 — Ledger core + supplier invoices

Double-entry engine + chart of accounts, audit trail, soft-delete/void, basic manual journals, read e-Fatura invoices. **(Start here after Phase 0.)**


| Slice                                          | Status | Notes                                                                                     |
| ---------------------------------------------- | ------ | ----------------------------------------------------------------------------------------- |
| Chart of accounts + entity scoping             | done   | Persisted `accounts` table, seed API, RLS                                                 |
| Double-entry posting service (single boundary) | done   | `post_journal_entry`, journal tables, RLS, 6 tests                                        |
| Audit trail on all changes                     | done   | `ledger_audit_events`; actor_id on post/void; RLS                                         |
| Void / reverse (no hard deletes)               | done   | `void_journal_entry`, immutability ORM + DB triggers, 7 tests                             |
| Ledger DB immutability (bootstrap + void gate) | done   | `ledger_immutability.py`, bootstrap triggers, audit append-only, raw SQL tests            |
| Basic manual journals                          | done   | `JournalEntrySource`, `POST/GET .../manual-journals`, void; generic post removed          |
| Read e-Fatura invoice (PDF) into draft         | done   | `invoice_drafts`, UBL-TR XML parser, PDF stub/heuristics, duplicate fingerprint, 11 tests |


**Phase 1 complete when:** all slices above done, tested, committed, owner sign-off. **→ Phase 1 COMPLETE (pending owner sign-off).**

---

## Phase 2 — Suppliers & payables


| Slice                                       | Status | Notes                                                                                                                                                                                                          |
| ------------------------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Supplier master (per entity)                | done   | `suppliers` table, VKN unique per entity, CRUD API, RLS, 15 tests                                                                                                                                              |
| Payables ledger & balance                   | done   | `supplier_ledger_entries`, `record_supplier_movement()`, payables API, RLS + immutability, 12 tests                                                                                                            |
| Draft → supplier linking                    | done   | `supplier_id` FK on `invoice_drafts`, VKN auto-link **+ auto-create supplier on e-Fatura upload**, link/unlink API |
| Draft review / confirm workflow             | done   | `confirmed` status, confirm/reject API, `?status=` filter, confirmed immutable, 6 tests                                                                                                                        |
| Payment reduces payable                     | done   | Superseded by supplier payment GL slice — was payables-only subledger                                                                                                                                          |
| Invoice → payable posting (draft-to-ledger) | done   | `post_confirmed_draft()`, GL + payables in one transaction; `posted` status; Input VAT `1500`; 10 tests                                                                                                        |
| Supplier payment GL posting                 | done   | `post_supplier_payment()` atomic GL+subledger (Dr AP, Cr bank/cash); `journal_entry_id` on subledger; `payment_account_id` required; AP control-account tests; 5 GL tests + updated payables tests; 132 pytest |


**Phase 2 complete when:** all slices above done, tested, committed, owner sign-off. **→ Phase 2 COMPLETE ✓ (owner signed off).**

---

## Phase 3 — Banking hub + bank statements

Account tree, import & classify, transfer linking, opening balances. **Statement-first:** flows start from uploads, not invented transactions.


| Slice                                              | Status | Notes                                                                                                                                                                                                                             |
| -------------------------------------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Bank/cash account tree (per entity)                | done   | `money_accounts` + GL sub-accounts under `1100`/`1000`; tree API with balances                                                                                                                                                    |
| Statement import & classify                        | done   | CSV import; supplier payment link-or-post; near-match → needs_review; transfer classify; `bank_fee` + `credit_card_payment` post GL (Phase 4); `unknown` classify-only                                                            |
| Transfer linking (own-account, not income/expense) | done   | `post_account_transfer()` Dr destination / Cr source (`source=transfer`); `account_transfers` table; statement classify outflow post + inflow link-or-post; manual transfer API; Alembic `017`; 9 tests; 160 pytest               |
| Opening balances                                   | done   | `post_opening_balances()` — aggregate + `money_account_id` + `supplier_id` lines; GL offset `3900`; supplier subledger with `journal_entry_id`; one-time guard; validate + post API; `go_live_date` setting; 22 tests; 172 pytest |
| Near-match payment/transfer detection              | done   | ±3 day window; exact date → auto-link; near date → `needs_review` + candidate FK (no second GL post); confirm via classify PATCH; Alembic `018`                                                                                   |


**Phase 3 complete when:** all slices above done, tested, committed, owner sign-off. **→ Phase 3 COMPLETE (pending owner sign-off).**

### Banking classification GL posting policy (ongoing)

Every statement-line classification that represents a **real GL event** must post (or link to an existing journal) in its delivery slice — **never left classify-only**.


| Classification                  | GL in slice                                                      | Status                        |
| ------------------------------- | ---------------------------------------------------------------- | ----------------------------- |
| `supplier_payment`              | Dr AP / Cr bank — link exact or near-match, else post            | done                          |
| `transfer`                      | Dr destination / Cr source — link exact or near-match, else post | done                          |
| `bank_fee`                      | Dr bank charges `5300` / Cr bank                                 | done (Phase 4 Slice 4)        |
| `credit_card_payment`           | Dr CC payable / Cr bank                                          | done (Phase 4 Slice 4)        |
| `pos_settlement` / card deposit | Dr bank / Cr card clearing `1400`                                | done (Phase 4 Slice 1)        |
| `delivery_settlement`           | Dr bank / Cr platform clearing                                   | done (Phase 6 Slice 2)        |
| `rent_utility`                  | Dr expense / Cr bank                                             | done (Phase 6 Slice 6)        |
| `tax_payment`                   | Dr tax liability / Cr bank                                       | **Phase 5/7** (tax module)    |
| `owner_draw`                    | Dr equity / Cr bank                                              | **Phase 5** (owner movements) |
| `customer_payment`              | Dr bank / Cr AR                                                  | **done** (Phase 5 Slice 5)    |
| `partner_reimbursement`         | Dr `2150` / Cr bank                                              | **done** (Phase 5 Slice 4)    |
| `unknown`                       | No GL — stays in Needs Review until reclassified                 | by design                     |


**Rule:** `unknown` is the only intentional classify-only path (Needs Review until reclassified). All other real-event classifications post GL in their delivery slice.

---

## Phase 4 — POS settlement + credit cards


| Slice                                    | Status | Notes                                                                                                                                                                                                                                                        |
| ---------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| POS settlement intake                    | done   | `post_pos_settlement()` Dr bank / Cr `1400`; `pos_settlements` table; `JournalEntrySource.POS_SETTLEMENT`; statement classify `pos_settlement` (inflow only); manual + list/detail API; Alembic `019`; 8 tests; 187 pytest                                   |
| Credit card clearing accounts            | done   | `MoneyAccountKind.CREDIT_CARD` under `2100`; tree API `credit_cards` branch; OB via `money_account_id` uses GL normal balance (CREDIT for cards); reject aggregate `2100` when card sub-accounts exist; Alembic `020`; 10 tests; 197 pytest                  |
| Card sales → bank deposit reconciliation | done   | `card_sales_batches` table; `post_card_sales_batch()` Dr `1400` / Cr `4000`; settlement commission (explicit or inferred from linked batch) Dr bank + Dr `5300` / Cr `1400` gross; `GET .../pos/clearing-reconciliation`; Alembic `021`; 8 tests; 205 pytest |
| Credit card payment + bank fee GL        | done   | `credit_card_payment` classify + `post_credit_card_payment()` Dr CC payable / Cr bank; `post_bank_fee()` Dr `5300` / Cr bank; `credit_card_payments` table; statement-line linking; Alembic `022`; 10 tests                                                  |


**Phase 4 complete when:** all slices above done, tested, committed, owner sign-off. **→ Phase 4 COMPLETE ✓ (owner signed off).**

---

## Phase 5 — Cash drawer, forex, staff, partner reimbursements, receivables


| Slice                                       | Status | Notes                                                                                                                                                                                                                                                                                                 |
| ------------------------------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cash drawer                                 | done   | `post_cash_movement()` Dr/Cr cash GL + offset; EOD close posts over/short to `5400`; `cash_drawer_sessions` + `cash_movements`; day locked on close *(session-gating + hard lock revised → Slice 11.13: optional session, owner-reopen)*; Alembic `023`; 9 tests; 224 pytest                          |
| Forex (FX purchase / holding)               | done   | `MoneyAccountKind.FOREIGN_CURRENCY` + `currency`; GL sub-accounts under `1010`/`1020`/`1030` (TRY cost kuruş); `fx_ledger_entries` subledger (native quantity + try_cost_kurus); `post_fx_purchase()` Dr FX / Cr TRY cash; tree `foreign_currency` branch; Alembic `024`; 10 tests; 234 pytest        |
| Staff (salary vs advance — no double-count) | done   | `employees` + `staff_ledger_entries`; `2250` Salaries Payable; TRY accrual Dr `5100`/Cr `2250`; advance Dr `1300`/Cr cash; payment Dr `2250`/Cr `1300`+cash (atomic advance offset); FX accrual subledger-only; FX payment Dr `5100`/Cr FX GL + `fx_ledger` spend; Alembic `025`; 9 tests; 243 pytest |
| Partner reimbursements                      | done   | `partners` + `partner_ledger_entries`; expense fronted Dr expense/Cr `2150`; reimbursement Dr `2150`/Cr cash (no expense); per-partner OB via `partner_id` lines; Alembic `026`; 10 tests; 252 pytest                                                                                                 |
| Receivables                                 | done   | `customers` + `customer_ledger_entries`; credit sale Dr `1200`/Cr `4000`; payment Dr bank/Cr `1200` (no revenue); per-customer OB via `customer_id`; statement classify `customer_payment`; Alembic `027`; 8 tests; 260 pytest                                                                        |
| FX spend / conversion                       | done   | `post_fx_conversion()` Dr bank/cash / Cr FX GL at average cost + realized gain `4200` or loss `5600`; `post_fx_expense_spend()` Dr expense / Cr FX at average cost; `SPEND` subledger row; owner-entered TRY received; no holding revaluation; 6 tests; 266 pytest                                    |


**Phase 5 complete when:** all slices above done, tested, committed, owner sign-off. **→ Phase 5 COMPLETE ✓ (owner signed off).**

---

## Phase 6 — Sales intake + tips + expenses

POS daily-summary photo + delivery platform reports; commission e-Faturas (e-Fatura intake, credits platform clearing — not payables); manual entry; handwritten reading as fallback.


| Slice                                                | Status         | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ---------------------------------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| POS daily-summary photo intake                       | done           | `pos_daily_summaries`; OCR v1 fixture + text heuristics; math check → `needs_review`; confirm posts card batch Dr `1400`/Cr `4000` + cash in Dr cash/Cr `4000` (never total line); duplicate fingerprint 409; duplicate-day guard (`029`); Alembic `028`/`029`; tag `v0.32.1`; 279 pytest                                                                                                                                                   |
| Delivery platform reports (gross / commission / net) | **superseded** | Was gross+commission+net per upload — **replaced by monthly gross-only** (`v0.73.18`, migration `059`); settlements + commission e-Fatura unchanged |
| User-managed delivery platforms                      | done           | `delivery_platforms` table — owner add / rename / deactivate; auto clearing GL sub-account under parent `1450` (mirrors bank/card sub-accounts); reports/settlements/commission/reconciliation keyed by `delivery_platform_id`; removed fixed enum + comma-separated `delivery_platforms` setting; legacy `1410`–`1430` migrated; API `POST/GET/PATCH .../delivery/platforms`; Alembic `032`; 300 pytest                                    |
| Commission e-Faturas                                 | **superseded** | Was report-linked (`delivery_report_id`) — **now platform-linked** (`delivery_platform_id`), auto-detect Komisyon on upload; Alembic `031` + `059` |
| Tips (pass-through, not revenue/expense)             | **superseded** | Was `v0.35.0` — `tip_accruals`/`tip_payouts`/`2260`; **reversed by Slice A `v0.48.0`** — tips are cash expense (`5700`), gross sales; subsystem removed migration `045`; see **Do not rebuild**                                                                                                                                                                                                                                             |
| Expenses + spelling tolerance                        | done           | `expense_items` + `expense_item_aliases` + `expense_entries`; Turkish-aware normalization + fuzzy match → `needs_review`; confirm remembers alias; manual Dr expense / Cr bank or cash; `rent_utility` bank classify with `expense_account_id`; `has_source_document=false` on manual entry; API `POST/GET .../expense-items`, `POST .../merge`, `POST/GET .../expenses`, `POST .../confirm-item`; Alembic `034`; tag `v0.36.0`; 317 pytest |


**Phase 6 complete when:** all slices above done, tested, committed, owner sign-off. **→ Phase 6 COMPLETE (owner signed off).**

*Note: Phase 6 may need to land with or just before Phase 4 (settlements reconcile against sales). Resequence if dependencies require — the firm rule is tested + signed off, not strict phase numbering.*

---

## Phase 7 — Dashboard, reports, Excel export, financial statements

P&L, Balance Sheet, Cash flow, per-rate KDV report, period comparison, delivery sales by platform.


| Slice                            | Status | Notes                                                                                                                                                                                                                                                                                                                 |
| -------------------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Delivery sales report            | done   | `GET .../reports/delivery-sales?from=&to=` — gross per platform + total; posted `delivery_reports` only; all platforms (active + inactive); `delivery_enabled` guard                                                                                                                                                  |
| Dashboard                        | done   | `GET .../dashboard?from=&to=` — period sales/expenses/net, payables preview, receivables, TRY position + FX wallets, delivery in-transit, needs-review counts; optional `supplier_id`, `money_account_id`, `expense_account_id` filters                                                                               |
| P&L & Balance Sheet (per entity) | done   | `GET .../reports/profit-and-loss?from=&to=` — all active revenue/expense accounts, natural sign period activity, totals; `GET .../reports/balance-sheet?as_of=` — asset/liability/equity sections, `unclosed_net_income_kurus` synthetic equity line, accounting equation check; posted only, void reversals excluded |
| Cash flow statement              | done   | `GET .../reports/cash-flow?from=&to=` — TRY liquid bank+cash only; opening/closing from `balance_as_of_kurus`; direct method by journal source (operating/financing); transfers + opening_balance excluded from categorization; reconciliation flags                                                                  |
| Per-rate KDV report              | done   | `GET .../reports/kdv-input?from=&to=` — purchase/input VAT per rate from posted `invoice_drafts` (`supplier` + `delivery_commission`); aggregate `vat_breakdown`; distinct invoice counts per rate                                                                                                                    |
| Period comparison                | done   | `GET .../reports/period-comparison?from=&to=` — current vs prior period metrics (dashboard/P&L/KDV/cash flow/delivery gross); auto same-length prior window; optional `prior_from`/`prior_to` override; omits payables/receivables/TRY position (not true period-over-period without as-of history)                   |
| Excel export                     | done   | `GET .../reports/{report}/export` — openpyxl xlsx for P&L, balance sheet, cash flow, KDV input, delivery sales, period comparison; integer kuruş; `Content-Disposition` attachment filenames                                                                                                                          |


**Phase 7 complete when:** all slices above done, tested, committed, owner sign-off. **→ Phase 7 COMPLETE ✓ (owner signed off).**

---

## Phase 8 — Roles & permissions, backups, security hardening, launch


| Slice                         | Status | Notes                                                                                                                                                                                                                                                                                  |
| ----------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Roles & permissions           | done   | `users` + `entity_memberships`; `EntityRole` enum; extensible `Permission` layer; `X-User-Id` v1 transport; `AUTH_ENFORCEMENT` flag (default off); financial reports guarded (cashier blocked from P&L/BS/cash flow/period comparison); membership CRUD API; Alembic `035`; 389 pytest |
| Backups                       | done   | pg_dump + uploads tar artifact with manifest/checksum; local + S3-compatible SSE storage; Celery+Redis daily schedule; retention 14d/8w; restore-verify integrity checks; `OPS_RESTORE.md`; 401 pytest (403 with pg_dump)                                                              |
| Security hardening            | done   | `operations_write_guard` + `reports_read_guard` + `member_read_guard`; mutation + entity-scoped read routes wired; `list_entities` scoped to caller memberships; `create_entity` requires auth when enforced; Alembic `036`; 398 pytest                                                |
| Launch readiness              | done   | Clerk JWT via JWKS; `external_auth_id` on users; invite-only email provisioning; `auth_audit_events`; `AUTH_ENFORCEMENT` default `true`; production boot guard; Bearer token replaces `X-User-Id`; Alembic `037`; 412 pytest                                                           |
| Auth hardening + pre-sign-off | done   | Production refuses `CLERK_TEST_MODE`; `CLERK_AUDIENCE` required; explicit `email_verified` only; permanent route/posting/RLS guard tests; dashboard + receivables guarded; RLS registry + GUC re-sync; 420 pytest                                                                      |
| DB provisioning integrity     | done   | `alembic upgrade head` canonical path; `006` widens version table; `038` RLS+triggers tail; pytest provisions via Alembic; `alembic check` green; 423 pytest                                                                                                                           |


**Phase 8 complete when:** all slices above done, tested, committed, owner sign-off. **→ Phase 8 COMPLETE ✓ (owner signed off).**

---

## Phase 8.5 — Pre-frontend API hardening

Small, contained backend slice to do **before** any frontend, because the frontend's entry screens
depend on these and retrofitting later means redoing both API and UI. No new accounting logic — these
strengthen the existing write/read APIs.


| Slice                                 | Status | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ------------------------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Idempotency on writes              | done   | `IdempotencyMiddleware` on POST/PATCH/PUT/DELETE; client `Idempotency-Key` (UUID) per action; scope = verified user + method + path + key; repeated key returns cached JSON + status; different keys with same payload both succeed; `idempotency_enforcement` setting (default True; conftest False); Alembic `039`; `test_idempotency.py`; 432 pytest                                                                                                                                                                                 |
| 2. Correct / amend operation          | done   | `correct_journal_entry()` — atomic void + reversal + corrected post in one transaction; `amends_entry_id` / `amended_by_entry_id` links; `LedgerAuditAction.AMEND`; `POST /entities/{id}/ledger/entries/{id}/correct` (**whitelist:** `MANUAL` + `BANK_FEE` only — all other sources 409 with dedicated-flow or void-and-re-enter hint); subledger-safe follow-up: `correction.py` registry + type-specific flows; dedicated correct endpoints for supplier payment, customer payment, FX purchase; completeness guard test; 454 pytest |
| 3. Pagination + search + filters      | done   | Shared `app/core/listing/` (`ListParams`, Turkish-aware `q`, date/amount/status/FK filters, `PaginatedListOut`). All entity list endpoints return `{items, total, limit, offset}`; new `GET .../ledger/entries`. Consistent query params: `q`, `from`, `to`, `min_amount`, `max_amount`, `status`, `*_id`. `test_list_pagination.py`; 444 pytest                                                                                                                                                                                        |
| 4. Flexible dates + soft period locks | done   | Go-live floor; soft day/month locks; owner unlock + audit; dirty flag; `IMMUTABLE_AUDIT_TABLES` + append-only audit triggers; `period_locks` no-delete trigger; migration `042`; guard-tests; split correction lock tests; 483 pytest                                                                                                                                                                                                                                                                                                   |
| 5. PDF export — financial statements  | done   | Lazy `reportlab` imports; bundled DejaVu Sans TTF (`app/core/pdf/fonts.py`); ₺ + Turkish glyphs fail loudly; bold totals via DejaVuSans-Bold; `GET .../export/pdf`; `financial_reports_guard`; `test_pdf_export.py` (6 tests); fresh-install guard script + CI; `REVIEWER_BRIEF.md`; 473 pytest                                                                                                                                                                                                                                         |


**Phase 8.5 complete when:** all slices done, tested, committed, owner sign-off.

---

## Phase 8.6 — Pre-frontend full backend audit (do before Phase 9)

**Status: complete ✓ (owner signed off 2026-06-23)** — items 0–6 implemented; **501 pytest green** from clean venv; money-critical fixes (items 1–4) signed off.

Retro-audit all of Phases 0–8 while the backend is stable and no frontend depends on it yet — fixes are
cheapest now. Two tracks; every gap found becomes a permanent test (meta-rule), so the backend is
self-policing before any UI is built.

**Role separation (non-negotiable — this is the point of the audit):** the **independent reviewer**
(fresh Opus session, read-only, committed git, adversarial) does the auditing. **Cursor does NOT audit
its own phases** — it only *implements* the fixes the reviewer flags, after which the reviewer re-checks.
Builder finds nothing wrong with its own work by definition; that's why a different agent audits.

- **Track 1 — automatic invariant sweep (cheap, permanent).** Run the dynamic guard-tests across the
whole codebase: RLS coverage (`RLS_TABLES`), immutability coverage (`IMMUTABLE_AUDIT_TABLES`, new),
correction-source completeness, posting-boundary, route-auth. These audit every phase at once and stay
enforced. Prereq: PDF + period-lock fixes landed (they add the dynamic immutability test + clean-venv
boot guard).
- **Track 2 — independent reviewer deep-read of money-critical phases** (separate Opus session, committed
git, adversarial brief). Priority order: (1) Phase 1 ledger core / posting boundary / immutability;
(2) Phase 7 financial statements & reports; (3) Phase 5 FX / staff / partners / receivables;
(4) Phases 2–4 payables / banking / POS / cards; (5) Phase 6 sales / tips / expenses. Skip deep-read on
pure CRUD/list slices (guard-tests cover them). Hunt for: self-masking tests, missing
immutability/control-ties, money-movement-as-income double-counts, idempotency gaps, eager optional
imports. Money-critical fixes require owner sign-off.

**Phase 8.6 complete when:** all money-critical phases reviewed, every found gap fixed + covered by a
permanent test, full suite green from a clean venv, owner sign-off. **Done ✓** — tags `v0.47.13` … `v0.47.19`; owner signed off on money-critical items 1–4 (2026-06-23).


| Item | Tag                                               | Summary                                                                                                            |
| ---- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| 0    | `v0.47.13-phase8.6-control-account-ties`          | Control-account tie registry + completeness guards                                                                 |
| 1    | `v0.47.14-phase8.6-staff-advance-fix`             | `ADVANCE_APPLIED` subledger; full payable clearance                                                                |
| 2    | `v0.47.15-phase8.6-payables-gl-tie`               | AP adjustments through GL posting boundary                                                                         |
| 3    | `v0.47.16-phase8.6-settlement-idempotency`        | POS/delivery settlement dedup + batch unique                                                                       |
| 4    | `v0.47.17-phase8.6-pos-tips-carveout`             | POS tips carved from revenue at confirm — **superseded** by Slice A (`v0.48.0`) then Z match-or-review (`v0.57.0`) |
| 5    | `v0.47.18-phase8.6-cash-flow-investing`           | `FX_PURCHASE` → investing; source registry guard                                                                   |
| 6    | `v0.47.19-phase8.6-subledger-immutability-guards` | `IMMUTABLE_SUBLEDGER_TABLES` + raw SQL tests                                                                       |


---

## Phase 8.7 — Expense receipt OCR + manual sales (backend, pre-frontend)

**Status: COMPLETE ✓ (owner signed off 2026-06-21)** — D0–D3 built, committed `d2a624b`, tagged `v0.52.0`–`v0.54.0`. **Follow-up:** Z simplification landed after 8.7 as `v0.57.0` (not part of D1–D3 — do not re-build 8.7). Remaining gaps → **Phase 8.8**.

**Why before Phase 9:** Slice C reads **only a tip** from a receipt photo. The owner needs **all handwritten lines** (peynir, süt, …) as separate cash expenses under their names, plus typed sales/expenses from the Add button. Backend APIs must exist before the frontend wires them.

**Owner decisions (confirmed 2026-06-24):**

- One receipt photo → **one cash expense per line** (item name + amount); tip line → `5700`, other lines default → `5200 Genel Giderler` (editable on review).
- Receipt OCR payment is **cash-only** (cash drawer chosen at upload).
- **Review-first** — nothing auto-posts; owner confirms (and may edit) before GL.

**Build order (each slice = completion gate + tag + owner sign-off on money-critical slices):**


| Slice                           | Status | Purpose                                                                | Tag                              |
| ------------------------------- | ------ | ---------------------------------------------------------------------- | -------------------------------- |
| **D0 — Promote Decisions**      | done   | Multi-line receipt OCR + cash-only + vision OCR in Decisions docs      | docs only                        |
| **D1 — Expense receipt intake** | done   | migration `048`, upload/confirm/reject API, `tip-photos` wrapper       | `v0.52.0-expense-receipt-intake` |
| **D2 — Complete OCR adapter**   | done   | `expense_receipt.py` fixture/heuristics/vision; multi-line + tip tests | `v0.53.0-expense-receipt-ocr`    |
| **D3 — Manual daily sales API** | done   | `POST .../pos/manual-daily-sales`; reuse POS confirm posting           | `v0.54.0-manual-daily-sales`     |


**APIs (implemented ✓ — do not re-build):**


| Method | Path                                           | Role                                                 |
| ------ | ---------------------------------------------- | ---------------------------------------------------- |
| `POST` | `/entities/{id}/expense-receipts`              | Multipart upload → intake + line drafts              |
| `GET`  | `/entities/{id}/expense-receipts/{id}`         | Intake + lines for review screen                     |
| `POST` | `/entities/{id}/expense-receipts/{id}/confirm` | Edit lines → post all atomically                     |
| `POST` | `/entities/{id}/expense-receipts/{id}/reject`  | Reject without posting                               |
| `POST` | `/entities/{id}/pos/manual-daily-sales`        | Typed cash + card sales (manual entry)               |
| `POST` | `/entities/{id}/expenses`                      | Manual expense (already exists)                      |
| `POST` | `/entities/{id}/expenses/tip-photos`           | **Legacy wrapper** → unified intake (Slice C compat) |


**Needs Review guards (deterministic, not AI):** no lines extracted; zero/negative line amounts; fuzzy item spelling; optional receipt-total vs sum(lines) mismatch; duplicate photo per entity (409).

**Out of scope for Phase 8.7:** bank-paid expense receipts; supplier e-Fatura fields on market receipts; Receipt AI learning store (`FUTURE_IDEAS.md`); manual↔receipt duplicate linking (later slice).

**Phase 8.7 complete when:** D0–D3 done, full pytest + fresh-install verify green, ROADMAP updated, owner sign-off on money-critical slices → **then** Phase 9 frontend. **→ Phase 8.7 COMPLETE ✓ (owner signed off 2026-06-21).** Phase 8.8 gaps remain.

---

## Phase 8.8 — Adversarial review follow-ups (backend hardening)

**Status: COMPLETE ✓** — H1–H5 done (`v0.58.0`–`v0.58.4`). Surfaced by independent adversarial review after `v0.57.0`. These were **gaps in guards/tests/ops safety/docs**, not a re-do of Slice A/B/C or Phase 8.7. Do **not** re-open `card_sale_basis` or POS tip posting (see **Do not rebuild** above).

**Purpose:** Close remaining money/ops risks before owner sign-off and production. Each slice = completion gate + tag. Can run in parallel with Phase 9 frontend where noted.


| Slice                                  | Status | Implements                                                                                                 | Acceptance (minimum)                                                                                                                                                                                                                                                                                                  |
| -------------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **H1 — Commission sweep timing guard** | done   | Adversarial finding: `clear-commission` sweeps all of `1400` even when card sales are still in transit     | `POST .../clear-commission` rejects when `GET .../clearing-reconciliation` shows `in_transit_kurus > 0` and no settlements (`pos_settlement_count == 0`) → 422 + clear message; 2 permanent tests; `DECISIONS.md` § commission sweep updated. Tag `v0.58.0-phase8.8-h1-commission-sweep-guard`. **536 pytest green.** |
| **H2 — Tips expense cash-only at API** | done   | Adversarial finding: generic `post_expense_entry` allows `5700` from bank                                  | `post_expense_entry` rejects `5700` unless `money_account` is cash (`InvalidExpensePostingError` → 422); receipt intake unchanged (already cash-only); 2 tests; `DECISIONS.md` § tips updated. Tag `v0.58.1-phase8.8-h2-tips-cash-only`.                                                                              |
| **H3 — Expense receipt test gaps**     | done   | Adversarial finding: missing negative/isolation coverage                                                   | Guard already in `confirm_expense_receipt` (line sum vs `receipt_total_kurus`); 4 permanent tests — mismatch blocked, override fix posts, API + service cross-entity read/confirm 404, RLS hides intakes/lines. Tag `v0.58.2-phase8.8-h3-expense-receipt-guards`. **542 pytest green.**                               |
| **H4 — Card-tip day ops guidance**     | done   | Adversarial finding: when Z > system card, review message does not explain cash↔card reallocation workflow | Needs Review copy explains reallocate cash→card (same total) + expense-paper tip + re-confirm; Decisions §9 operator note; integration test mismatch → expense tip → corrected confirm → deposit + sweep clears `1400`. Tag `v0.58.3-phase8.8-h4-z-ops-guidance`.                                                     |
| **H5 — Docs dedup**                    | done   | Stale `DECISIONS.md` Slice B1 (`system`/`z_report` GL) contradicts `v0.57.0` entry                         | B1 marked superseded; canonical Z match-or-review in v0.57.0 entry; Phase 6 tips pass-through row updated; no code change. Tag `v0.58.4-phase8.8-complete`.                                                                                                                                                           |


**Phase 8.8 complete when:** H1–H5 done (or explicitly deferred by owner in Decisions), full pytest green, ROADMAP updated, owner sign-off on money-critical items H1–H2. **→ Phase 8.8 COMPLETE ✓ (owner signed off H1–H2, 2026-06-21).** Tag `v0.58.5-owner-sign-off`.

**Out of scope for Phase 8.8:** Re-building Z tip derivation at POS; re-adding `card_sale_basis`; frontend forms (→ Phase 9 Slice 2d).

---

## Phase 9 — Frontend (record data, then see it)

Backend core is complete; Phase 8.7 adds the remaining intake APIs this UI needs. Follow `DESIGN_SYSTEM.md` (white bg,
blue `#2563EB`, Inter, Lucide, shadcn token file, the page archetypes, app shell) and the
"structure first, theme later" rule. Stack: Next.js + TypeScript + Tailwind + shadcn/ui. Each slice
is a thin vertical: auth → entity context → API → ledger → read-back, shippable on its own.

Phase 8.7 backend APIs must be signed off **before** slices that depend on them (receipt upload, manual daily sales). Other slices wire existing backend APIs — no new accounting logic in the frontend. One shared component kit + one token file (DESIGN_SYSTEM.md); every screen is one of the locked page archetypes. Build all structure against default tokens; the final look is applied later (Slice 10) by editing only the token file. Golden rule #8 applies to every form.


| Slice                                               | Status | Notes                                                                                                                                                                                                                                                                                                                                                                                                                       |
| --------------------------------------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Shell + login + **New** menu                     | done   | App shell + sidebar **New** dropdown; Clerk login when `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` set; entity switcher                                                                                                                                                                                                                                                                                                             |
| 2. Manual sales + expenses                          | done   | Forms wired to `POST /expenses` and `POST /pos/manual-daily-sales`                                                                                                                                                                                                                                                                                                                                                          |
| 2b. Expense receipt upload                          | done   | Upload → `POST /expense-receipts` → review route                                                                                                                                                                                                                                                                                                                                                                            |
| 2c. Read-back lists + Clerk                         | done   | `/expenses` + `/sales` lists; Clerk login + entity switcher + `GET /users/me`                                                                                                                                                                                                                                                                                                                                               |
| **2d. Money-entry UX gaps (adversarial follow-up)** | done   | Z field when `card_tips_z_report_enabled`; `needs_review` on manual sales stays open with `review_reason`; manual expense picks 5200/5700; double-submit on both forms. Maps to Phase 8.8 H4.                                                                                                                                                                                                                               |
| 3. Suppliers & payables                             | done   | Supplier master CRUD; e-Fatura upload → link supplier → confirm → post; record payment; supplier ledger + `/payables` summary. Wired to existing Phase 2 APIs — no new backend logic.                                                                                                                                                                                                                                       |
| 4. Banking & cash                                   | done   | Account tree + balances; statement upload → classify → Needs Review; transfers; cash drawer (open / movements / EOD close with over-short); FX wallets (purchase / convert / spend). Wired to existing Phase 3–5 APIs — no new backend logic.                                                                                                                                                                               |
| 5. POS & delivery sales                             | done   | POS daily-summary photo upload → review/confirm (`/sales/[id]`); card-sales batches + POS settlements + clearing reconciliation + commission clearance (`/cards`); delivery platforms CRUD, reports, settlements, per-platform reconciliation (`/delivery/*`); commission e-Fatura via extended invoice review (link posted report → post to clearing). Wired to existing Phase 6 POS/delivery APIs — no new backend logic. |
| 6. Staff, partners, receivables, tips               | done   | `/staff`, `/partners`, `/customers`, `/receivables`; subledger actions (accrual/advance/payment, expense fronted/reimbursement, credit sale/payment); cash tips via New → Cash tip + Expenses button (`5700` only — no tip pot). Wired to Phase 5 APIs — no new backend logic.                                                                                                                                              |
| 7. Needs-review queue + document review             | done   | Expense receipt review screen (`/review/receipts/[id]`) — photo left, editable lines, confirm                                                                                                                                                                                                                                                                                                                               |
| 8. Dashboard + reports                              | done   | Dashboard `/` wired to `GET .../dashboard` (date range, live KPIs); Reports landing `/reports` card library; read views P&L, balance sheet, cash flow, KDV input, delivery sales, period comparison with query params; shared `ReportDownloadMenu` (Excel all, PDF on financial statements) via authenticated blob download; 403 friendly message for cashier role.                                                         |
| 9. Settings & onboarding                            | done   | `/settings` hub; `/settings/opening-balances` wizard (validate → preview → post); `/settings/members` (CRUD roles, 403 message); `/settings/entity` (create restaurant, seed chart, feature toggles); link to `/delivery/platforms`; informational backup panel (no status API). Wired to existing Phase 0/8 onboarding + auth APIs — no new backend logic.                                                                 |
| 10. Theme refinement + UX polish                    | done   | Refined token file (`globals.css`); custom toast system on form saves; `TableSkeleton`/`EmptyState` on `useEntityList` pages; Cmd/Ctrl-K command palette; Dialog Esc/focus trap; token focus rings; sticky table headers. No new backend logic.                                                                                                                                                                             |


**Phase 9 complete** — all slices done, tested, committed (`v0.65.0`). **Owner sign-off pending** → frontend v1 complete.

**Known gap (remaining before go-live):** Phase **11** slices **11.2–11.12** — corrections after post, entity setup UX — see **Phase 11** audit table. Phase 10 slices **10.1–10.8** are **done** (`v0.67.0`); Slice 10.8 owner sign-off **APPROVED (2026-06-25)**.

---

## Phase 10 — Pre-launch UX (`DESIGN_SYSTEM.md` §10) & FX wiring (owner 2026-06-24)

**Status: DONE** — all slices **10.1 → 10.8** complete. Slice 10.8 owner sign-off **APPROVED (2026-06-25)**. Proceed to **Phase 11**.

### Code audit (do not trust ROADMAP/tests alone — verified in repo)


| Area                           | ROADMAP / tests say         | **Actual code (audit)**                                                                                                                                                    | Phase 10 action                                       |
| ------------------------------ | --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| **Date typing**                | —                           | `parseTrDate` / `formatTrDate` in `frontend/src/lib/money.ts` ✓                                                                                                            | **Keep** — `DateInput` wraps these                    |
| Date picker component          | DESIGN_SYSTEM §5 + §10      | `**DateInput`** + `lib/dates.ts` in `v0.66.0`                                                                                                                              | **Done** in 10.1                                      |
| **Date fields**                | “~20 forms”                 | **22 files** migrated to `DateInput`                                                                                                                                       | **Done** in 10.1                                      |
| **Report date range**          | Dashboard + reports wired   | `ReportDateRange` / `ReportAsOfDate` use `DateInput`                                                                                                                       | **Done** in 10.1                                      |
| **Balance sheet as-of**        | —                           | `report-as-of-date.tsx` uses `DateInput`                                                                                                                                   | **Done** in 10.1                                      |
| **Review screens**             | Listed 4 review UIs         | Only `**pos-summary-review.tsx`** has an **editable** date field; `receipt-review`, `invoice-draft-review`, `delivery-report-review` show dates as **read-only text** only | **Do not** add date pickers there unless product asks |
| **Phase 9 Slice 10**           | “UX polish” done            | Toasts, command palette, dialog Esc/focus, skeletons, tokens ✓ — **date picker not included**                                                                              | 10.1 completes §10 date slice of Slice 10             |
| **Delivery nav**               | Slice 5 built `/delivery/*` | Nested under **Delivery** in sidebar (`nestedUnder` + children)                                                                                                            | **Done** in 10.2                                      |
| **FX form UI**                 | Banking slice wired         | `fx-purchase-form.tsx` **cash drawer only** ✓                                                                                                                              | **Done** in 10.8                                      |
| **FX backend**                 | Phase 5 FX purchase done    | `post_fx_purchase()` CASH only ✓; `CashMovement` OUT on purchase ✓                                                                                                         | **Done** in 10.8                                      |
| **FX cash subledger**          | —                           | `cash_movements` OUT on FX buy; drawer page lists FX buys ✓                                                                                                                | **Done** in 10.8                                      |
| **FX conversion**              | —                           | `fx-conversion-form.tsx` loads cash+bank for TRY **received** (FX→TRY) — separate flow                                                                                     | **Out of scope** 10.8; conversion/spend unchanged     |
| **Bank activity**              | Statement import            | Bank movements enter via **statement upload + classify** only — not manual bank pay for FX buy                                                                             | **Owner locked** — reinforces 10.8 cash-only          |
| **Cmd/Ctrl-K palette**         | §10                         | `command-palette.tsx` in `app-shell.tsx` ✓                                                                                                                                 | **Verify** in 10.3; fix gaps only                     |
| **Dialog Esc + focus trap**    | Phase 9 Slice 10            | `dialog.tsx`: Esc closes, Tab trap, auto-focus first input on open ✓                                                                                                       | **Verify** in 10.3                                    |
| **Skeletons / empty states**   | Phase 9 Slice 10            | `PageSkeleton`, `TableSkeleton`, `EmptyState` on list pages ✓                                                                                                              | **Verify** in 10.3                                    |
| **Toasts on save**             | §10                         | `useToast` on **all** POST save/upload/confirm flows (forms + review + classify)                                                                                           | **Done** in 10.3                                      |
| **Enter submits form**         | §10                         | All **31** `components/forms/*` use `<form onSubmit>` + `type="submit"` ✓                                                                                                  | **Done** in 10.4                                      |
| **First-field autofocus**      | §10                         | `Dialog` + full-page surfaces (OB wizard, entity create, review panels) ✓; Clerk `/sign-in` is third-party                                                                 | **Done** in 10.4                                      |
| **Combobox / type-to-filter**  | §10                         | `combobox.tsx`; **34** long pickers migrated across 22 files                                                                                                               | **Done** in 10.5                                      |
| **Inline validation**          | §10                         | `ValidationHint` + live hints on priority money forms                                                                                                                      | **Done** in 10.6                                      |
| **Autosave / discard confirm** | §10                         | `**useFormDraft` + Dialog `dirty`** — entity-scoped localStorage drafts; discard confirm on Esc/backdrop/X                                                                 | **Done** in 10.7                                      |


**Already implemented — do NOT redo in Phase 10:**

- Phases 0–9 backend + frontend v1 (`v0.65.0`); Phase 8.7/8.8; Z match-or-review (`v0.57.0`); tips expense-only; expense receipt OCR; manual daily sales; POS/delivery/banking UIs.
- `ReportDateRange` / dashboard / reports **API wiring** (only upgrade inputs to `DateInput`).
- `fx-purchase-form` — **remove bank** from dropdown in 10.8 (backend already cash-only); add cash movement posting.
- `/delivery` hub + child **pages** — only **sidebar IA** changes in 10.2.
- `Dialog` Esc/focus-trap/first-field focus — **verify** in 10.3, don’t rewrite unless broken.
- `CommandPalette`, skeletons, empty states — **verify** in 10.3.
- All forms already use `onSubmit` — **audit** in 10.4, don’t rebuild form structure.

### Owner decisions (locked)


| Topic              | Decision                                                                                                                                                                   |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Dates**          | Typable `DD.MM.YYYY` + **small calendar** from icon in field — **no toggle/mode** (`DESIGN_SYSTEM.md` §10).                                                                |
| **FX buy USD/EUR** | **Cash drawer only** (`CASH`). **Not** bank — bank activity is **statement import + classify** only; owner buys FX with physical TRY from the drawer. **Not** credit card. |
| **Delivery nav**   | **Confirmed:** nest platforms / reports / settlements under **Delivery**.                                                                                                  |


**References:** `DESIGN_SYSTEM.md` §5 (date picker component), §10 (interaction); `Restaurant_Bookkeeping_App_Decisions.md` §14–§15 (update §15 on **10.8** commit); `frontend/src/lib/app-routes.ts`, `app-shell.tsx`.

### Build order (mandatory)

```
10.1 DateInput
  → 10.2 Delivery nav
  → 10.3 Shell feedback (verify palette/Esc/skeletons; toasts on all saves)
  → 10.4 Focus + Enter audit
  → 10.5 Combobox pickers
  → 10.6 Inline validation
  → 10.7 Autosave + discard confirm
  → 10.8 FX purchase (cash drawer only + cash movement)   ← money-critical; last before go-live
```

10.1 and 10.2 may share one commit if both gates pass. **10.8 = separate commit/tag** (money-critical). Slices 10.3–10.7 may batch where gates pass, but **order is fixed** — don’t start 10.5 before 10.4 audit documents Enter/focus baseline.

---

### Slice 10.1 — Shared `DateInput` (`DESIGN_SYSTEM.md` §10)


|                |                                                                                                        |
| -------------- | ------------------------------------------------------------------------------------------------------ |
| **Status**     | done                                                                                                   |
| **Implements** | §10: type `DD.MM.YYYY` **or** pick from calendar; sensible default; Enter confirms; Esc closes popover |
| **Owner**      | **Small calendar is enough** — compact single-month popover                                            |
| **Tag**        | `v0.66.0-date-picker`                                                                                  |


**What §10 requires (checklist when done):**

- [x] One shared `frontend/src/components/ui/date-input.tsx` (+ minimal popover; token-styled).
- [x] Field always **typable**; **click field** or trailing **calendar icon** opens **small** month grid — **not** on focus (dialog auto-focus must not pop the calendar; `v0.70.0.1` amends 11.17 focus-open).
- [x] Pick day → updates display string; invalid typed date → existing submit-time errors unchanged.
- [x] Default today on new forms; pre-fill document date on `pos-summary-review` when summary loads.
- [x] Arrow keys change day **while popover open**.
- [x] `parseTrDate` / `formatTrDate` remain the API boundary — no backend date format changes.

**Replace raw date inputs (grep-verified file list):**


| File                                                | Notes                 |
| --------------------------------------------------- | --------------------- |
| `components/forms/manual-expense-form.tsx`          |                       |
| `components/forms/manual-daily-sales-form.tsx`      |                       |
| `components/forms/cash-movement-form.tsx`           |                       |
| `components/forms/transfer-form.tsx`                |                       |
| `components/forms/card-sales-form.tsx`              |                       |
| `components/forms/pos-settlement-form.tsx`          |                       |
| `components/forms/supplier-payment-form.tsx`        |                       |
| `components/forms/customer-payment-form.tsx`        |                       |
| `components/forms/customer-credit-sale-form.tsx`    |                       |
| `components/forms/partner-reimbursement-form.tsx`   |                       |
| `components/forms/partner-expense-fronted-form.tsx` |                       |
| `components/forms/staff-accrual-form.tsx`           |                       |
| `components/forms/staff-cash-movement-form.tsx`     |                       |
| `components/forms/delivery-report-form.tsx`         |                       |
| `components/forms/delivery-settlement-form.tsx`     |                       |
| `components/forms/fx-purchase-form.tsx`             |                       |
| `components/forms/fx-conversion-form.tsx`           |                       |
| `components/forms/fx-expense-spend-form.tsx`        |                       |
| `components/pos-summary-review.tsx`                 | editable confirm date |
| `components/reports/report-date-range.tsx`          | two fields            |
| `components/reports/report-as-of-date.tsx`          |                       |
| `app/settings/opening-balances/page.tsx`            | go-live date          |


**Manual verify (required — not only `npm run build`):** open manual expense, dashboard range, opening balances, POS review confirm — type date, pick from calendar, submit.

**Out of scope:** time-of-day; `receipt-review` / invoice / delivery review read-only dates.

---

### Slice 10.2 — Delivery nav nested under Delivery (**owner confirmed**)


|                |                                   |
| -------------- | --------------------------------- |
| **Status**     | done                              |
| **Implements** | `DESIGN_SYSTEM.md` §6 grouped nav |
| **Tag**        | `v0.66.1-delivery-nav`            |


**Acceptance:** One Delivery group in sidebar: hub + Platforms + Reports + Settlements; flat duplicates removed; parent active on `/delivery/*`; command palette unchanged.

**Out of scope:** hide when `delivery_enabled` off; nest Banking transfers/cash (same pattern, not requested).

---

### Slice 10.3 — Shell feedback completion (`DESIGN_SYSTEM.md` §10 — partial items)


|                |                                                                                  |
| -------------- | -------------------------------------------------------------------------------- |
| **Status**     | done                                                                             |
| **Implements** | §10 instant feedback: toasts, loading/skeletons; verify keyboard shell behaviors |
| **Tag**        | `v0.66.2-shell-feedback`                                                         |


**Already shipped (verified, don’t rebuild):**


| Item                       | Location                               | Gate |
| -------------------------- | -------------------------------------- | ---- |
| Cmd/Ctrl-K command palette | `command-palette.tsx`, `app-shell.tsx` | ✓    |
| Esc closes dialog          | `components/ui/dialog.tsx`             | ✓    |
| Skeletons on list pages    | `PageSkeleton` / `TableSkeleton`       | ✓    |
| Empty states               | `EmptyState`                           | ✓    |


**Build / extend (done):**

- [x] `**useToast` on every successful POST** — all `components/forms/*`, review confirms (`pos-summary-review`, `receipt-review`, `invoice-draft-review`, `delivery-report-review`), `statement-line-classify`.
- [x] **Consistent error display** — failed POST still uses inline `setError` (no toast on validation errors).

**Manual verify:** save manual expense → toast; open list → skeleton then rows; Cmd+K → navigate; Esc closes New → form dialog.

**Do not redo:** toast provider, command palette implementation, skeleton components.

---

### Slice 10.4 — Focus + Enter-submit audit (`DESIGN_SYSTEM.md` §10)


|                |                                                                            |
| -------------- | -------------------------------------------------------------------------- |
| **Status**     | done                                                                       |
| **Implements** | §10 keyboard-first: Enter submits; first field focused; sensible Tab order |
| **Tag**        | `v0.66.3-focus-enter`                                                      |


**Audit baseline (code):** all 31 `components/forms/*` already use `<form onSubmit>` + `type="submit"` — **Enter works** in dialogs. `Dialog` auto-focuses first `input|select|textarea` on open.

**Audit checklist (2026-06-25):**


| Surface                       | Enter-submit                          | First-field focus                                | Notes                                                                                  |
| ----------------------------- | ------------------------------------- | ------------------------------------------------ | -------------------------------------------------------------------------------------- |
| 31 `components/forms/*`       | ✓ `<form onSubmit>` + `type="submit"` | ✓ via `dialog.tsx`                               | No outliers; no `onKeyDown` Enter hacks                                                |
| `dialog.tsx`                  | n/a                                   | ✓ `setTimeout` focus first input/select/textarea | Esc close + Tab trap unchanged                                                         |
| `opening-balances/page.tsx`   | ✓ validate form                       | ✓ go-live on load; amount on Add line            | Full-page wizard                                                                       |
| `settings/entity/page.tsx`    | ✓ create form                         | ✓ restaurant name on load                        |                                                                                        |
| `receipt-review.tsx`          | ✓                                     | ✓ first line item input                          |                                                                                        |
| `pos-summary-review.tsx`      | ✓                                     | ✓ date field when confirmable                    |                                                                                        |
| `delivery-report-review.tsx`  | ✓                                     | ✓ gross amount when postable                     |                                                                                        |
| `invoice-draft-review.tsx`    | ✓ (link forms)                        | — read-mostly; supplier select is first action   |                                                                                        |
| `statement-line-classify.tsx` | ✓                                     | ✓ classification select                          |                                                                                        |
| Tab order                     | ✓ visual order                        | —                                                | Only intentional `tabIndex={-1}` on DateInput calendar button + uploads disabled state |
| Clerk SignIn/SignUp           | out of scope                          | out of scope                                     | third-party widget                                                                     |


**Acceptance:**

- [x] Documented audit checklist: every dialog form + full-page forms (`opening-balances`, settings entity) — Enter submits without clicking Save.
- [x] **First field focused** when app-owned surface opens: all `Dialog` forms (rely on existing `dialog.tsx` focus); **opening-balances wizard** first field on load + new line; review panels focus first editable on load.
- [x] Tab order follows visual order (no blocking `tabIndex` hacks found).
- [x] **Out of scope:** Clerk `SignIn` / `SignUp` focus (third-party widget).

**Manual verify:** open manual expense dialog → type immediately; Enter saves; Tab through fields in order.

---

### Slice 10.5 — Shared `Combobox` (type-to-filter pickers)


|                |                                                                   |
| -------------- | ----------------------------------------------------------------- |
| **Status**     | done                                                              |
| **Implements** | §10 “type-to-filter in every picker (combobox): type Met → Metro” |
| **Tag**        | `v0.66.4-combobox`                                                |


**Problem today:** long `<Select>` dropdowns (~20 forms) — supplier, customer, partner, employee, money account, GL/expense account, delivery platform, card terminal, etc. No filter-as-you-type.

**Acceptance:**

- [x] Shared `frontend/src/components/ui/combobox.tsx` (or `account-combobox`, `entity-combobox` wrappers) — token-styled; keyboard: type filter, ↑↓, Enter select, Esc close.
- [x] Migrate **every** picker with **>8 options** or dynamic lists (grep `<Select` in `components/forms/` + review screens with account pickers).
- [x] Short static enums (e.g. Dr/Cr, movement direction) may stay `<Select>`.

**Manual verify:** supplier payment → type vendor name fragment → list filters → Enter selects.

**Do not redo:** underlying option fetch APIs; only replace UI control.

---

### Slice 10.6 — Inline validation (`DESIGN_SYSTEM.md` §10)


|                   |                                                                                        |
| ----------------- | -------------------------------------------------------------------------------------- |
| **Status**        | done                                                                                   |
| **Implements**    | §10 “inline validation as you go … plain language — not a wall of errors after submit” |
| **Suggested tag** | `v0.66.5-inline-validation`                                                            |


**Priority surfaces (money-critical UX):**


| Form / screen                         | Rule (examples)                                                         |
| ------------------------------------- | ----------------------------------------------------------------------- |
| `manual-daily-sales-form`             | Live total; warn if cash + card = 0 before submit                       |
| `pos-summary-review`                  | Same cash/card totals; Z vs card when Z enabled (display mismatch hint) |
| `delivery-report-form`                | Commission vs net consistency hint (already shows amounts)              |
| `opening-balances/page.tsx`           | Line balance / required account before validate step                    |
| `transfer-form`, `cash-movement-form` | Amount > 0; from ≠ to                                                   |
| Payment forms                         | Amount ≤ outstanding where API exposes balance (optional nice-to-have)  |


**Acceptance:**

- [x] Shared pattern: field-level or summary `text-destructive` / `text-muted-foreground` hints **while editing**, not only `setError` on submit.
- [x] Plain Turkish/English copy per `DESIGN_SYSTEM.md` tone.
- [x] Submit still blocked when invalid (existing server validation unchanged).

**Manual verify:** manual daily sales — clear cash+card hint without clicking Save.

---

### Slice 10.7 — Autosave + discard confirm (`DESIGN_SYSTEM.md` §10)


|                   |                                                                                      |
| ----------------- | ------------------------------------------------------------------------------------ |
| **Status**        | **done** (`v0.66.6-draft-safety`)                                                    |
| **Implements**    | §10 “don’t lose my work: drafts autosave; confirm before discarding unsaved changes” |
| **Suggested tag** | `v0.66.6-draft-safety`                                                               |


**Problem today:** closing dialog (Esc, backdrop, Cancel) drops in-progress form state with no warning.

**Acceptance:**

- [x] `**useFormDraft` + `Dialog` `dirty` prop** — when form state differs from initial, Esc / backdrop / X prompts “Discard unsaved changes?” (confirm/cancel).
- [x] **Autosave drafts** (localStorage, entity-scoped keys `mizan:draft:{entityId}:{formKey}`) for:
  - `manual-expense-form` (multi-field dialog),
  - `opening-balances` wizard lines,
  - `receipt-review` line edits (in-progress only).
- [x] Restore draft on reopen (`ResumeDraftBanner` one-time prompt).
- [x] Successful POST clears draft key.

**Out of scope:** server-side draft API; sync across devices.

**Manual verify:** start expense, add line, Esc → confirm dialog; reopen → draft restored.

---

### Slice 10.8 — FX purchase: **cash drawer only** (subledger wiring)


|                                 |                                                                                                                                                                                                     |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Status**                      | done                                                                                                                                                                                                |
| **Money-critical**              | Yes — **owner sign-off APPROVED (2026-06-25)**                                                                                                                                                      |
| **Owner (2026-06-24, revised)** | Buy FX **from cash drawer only**. Bank accounts are **automated via statements** — everything that hits the bank is picked up from statement import/classify, not manual bank payment in this form. |
| **Aligns with**                 | `Restaurant_Bookkeeping_App_Decisions.md` §15 — “TRY leaves the drawer”                                                                                                                             |
| **Tag**                         | `v0.67.0-fx-purchase-cash-drawer`                                                                                                                                                                   |


**Problem today (fix, do not re-litigate):**


| Layer                        | Now                                      | Target                                                                                     |
| ---------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------ |
| UI `fx-purchase-form.tsx`    | Fetches **bank + cash**, merged dropdown | **Cash accounts only**; label “Pay from cash drawer”; remove bank API fetch                |
| Backend `post_fx_purchase()` | **CASH only** ✓; rejects bank ✓          | **Unchanged** — keep `_validate_try_cash_money_account`; **do not** accept `BANK`          |
| GL                           | `Dr` FX / `Cr` cash GL ✓                 | Unchanged                                                                                  |
| Cash subledger               | **No** `cash_movements` row on FX buy    | `CashMovement` **OUT** on same `journal_entry_id` (mirror POS cash-out / transfer pattern) |
| Cash drawer UI               | FX buy invisible on `/banking/cash`      | Drawer OUT line when FX purchased                                                          |
| Corrections                  | FX subledger only                        | Void/amend linked `cash_movements` when correcting cash-sourced purchase                   |


**Out of scope for 10.8:**

- **Bank** (`BANK`) as FX payment source — owner confirmed **not** wanted.
- **Credit card** (`CREDIT_CARD`) — still rejected.
- `post_fx_conversion` / `post_fx_expense_spend` (FX→TRY may still credit bank/cash when owner converts — different flow).

**Tests (mandatory):**

- Keep `**test_rejects_bank_as_try_payment_account`** — bank must still be rejected.
- Extend `**test_fx_purchase_posts_dr_fx_cr_try_cash**` — assert `cash_movements` OUT row + drawer session visibility.
- Correction from cash: movement void/amend with corrected entry.

**Docs (on commit):**

- **Decisions §15:** Buying FX — TRY leaves **cash drawer only**; bank not a manual FX source (statements handle bank).
- `DECISIONS.md` + `CHANGELOG.md`.

**Verify (owner-visible):**

- Buy USD from **drawer** → FX up, drawer movement TRY out, EOD ties.
- Bank accounts **not** in FX buy dropdown; attempting bank via API still 422.

**Do not rebuild:** FX quantity model, average-cost conversion, bank statement pipeline.

---

### Phase 10 complete when


| Slice | Gate                                                                                                           |
| ----- | -------------------------------------------------------------------------------------------------------------- |
| 10.1  | All checklist files use `DateInput`; manual date verify on 4 screens; build green                              |
| 10.2  | Nested Delivery nav; duplicates removed                                                                        |
| 10.3  | Toasts on all POST saves; palette/Esc/skeletons verified                                                       |
| 10.4  | Enter-submit + focus audit passed; OB wizard + dialogs checked                                                 |
| 10.5  | Combobox on long pickers; manual type-to-filter verify                                                         |
| 10.6  | Inline hints on priority money forms                                                                           |
| 10.7  | Discard confirm on dirty dialogs; autosave on listed forms                                                     |
| 10.8  | Cash-only UI + API; cash movement on purchase; bank still rejected; full `pytest`; owner sign-off **APPROVED** |


Then proceed to **Phase 11 — Pre-go-live product fixes**.

---

## Phase 11 — Pre-go-live product fixes (owner 2026-06-25, audit-driven)

**Status: COMPLETE** (`v0.69.13-ui-gaps`) — all slices 11.1–11.22 done. **Next:** Phase 12 (deployment).

**Purpose:** Close gaps found by adversarial code audit vs `DECISIONS.md` / owner daily workflow — onboarding traps (empty cash picker), post-post corrections, entity setup, and UX bugs — **without** re-litigating Phase 10 or core posting rules.

### Code audit (verified in repo, 2026-06-25)


| #   | Finding                                                         | **Today**                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Phase 11 slice                                             |
| --- | --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| 1   | **Empty cash account picker**                                   | **Partial (11.1)** — new seeds get `"Main Drawer"`; **legacy** entities (chart seeded before `v0.68.0`) still empty; seed API undercounts; forms don't use `defaultMainDrawerId`                                                                                                                                                                                                                                                                                     | **11.1** ✓ + **11.1a**                                     |
| 2   | Feature toggles wrong timing / locked forever                   | ~~Create selects entity immediately; toggles create-only (no PATCH)~~ **Done 11.2** — post-create wizard step + PATCH                                                                                                                                                                                                                                                                                                                                                | **11.2 ✓**                                                 |
| 3   | Money fields accept letters                                     | `MoneyInput` + strict `parseTryToKurus`; rejects garbage                                                                                                                                                                                                                                                                                                                                                                                                             | **Done** in 11.3                                           |
| 4   | Dialog steals focus while typing                                | `focusedOnOpenRef` — focus once on open only                                                                                                                                                                                                                                                                                                                                                                                                                         | **Done** in 11.4                                           |
| 5   | New restaurant invisible with auth on                           | `POST /entities` adds creator as `owner` membership                                                                                                                                                                                                                                                                                                                                                                                                                  | **Done** in 11.5                                           |
| 6   | Partner share %                                                 | `ownership_share_pct` on partners; list warns if ≠ 100%                                                                                                                                                                                                                                                                                                                                                                                                              | **Done** in 11.6                                           |
| 7   | Partner expense separate flow                                   | Manual expense = cash only; `expenses-fronted` **API done** (partner detail only)                                                                                                                                                                                                                                                                                                                                                                                    | **11.7** (UI)                                              |
| 8   | Dashboard FX shows TRY cost                                     | API has `native_quantity`; UI uses `try_cost_kurus`                                                                                                                                                                                                                                                                                                                                                                                                                  | **11.8**                                                   |
| 9   | **Cannot fix posted daily sales**                               | ~~`PosDailySummary` posted = immutable~~ → `correct_pos_daily_summary()` + HTTP                                                                                                                                                                                                                                                                                                                                                                                      | **11.9** ✓                                                 |
| 10  | **Cannot fix posted expenses**                                  | ~~`correct_expense_entry()` core only~~ → HTTP + UI                                                                                                                                                                                                                                                                                                                                                                                                                  | **11.10** ✓                                                |
| 11  | Corrections **UI** missing                                      | ~~Supplier/customer payment, FX purchase, manual journal void, ledger correct — zero frontend~~                                                                                                                                                                                                                                                                                                                                                                      | **11.11** ✓                                                |
| 12  | Other posted types stuck                                        | Invoice, credit sale, staff, partner, FX conversion/spend — **core helpers only**; no HTTP routes or tests                                                                                                                                                                                                                                                                                                                                                           | **11.12**                                                  |
| 13  | **Cash-drawer session trap**                                    | Daily sales + cash movements auto-open a drawer session and **hard-block** when the day is CLOSED (`daily_summary_posting.py:91`, `cash/posting.py:196`) — **no reopen**; inconsistent with period-lock owner-unlock. Expenses bypass sessions.                                                                                                                                                                                                                      | **11.13**                                                  |
| 14  | Daily drivers buried / New menu flat + sticky / toggles unclear | "Daily sales (manual)" (cash+card, **already built**) + "Manual expense" live only inside the **flat 9-item** New dropdown; the dropdown **does not close on outside click** (`new-menu.tsx` has no mousedown handler — unlike `combobox.tsx`/`date-input.tsx` which do); same gap in `command-palette.tsx` + entity switcher; toggles editable + **labelled** (`settings-types.ts:35-47`, confirmed by 11.18 audit) — 11.14 only verifies each gates the right form | **11.14**                                                  |
| 15  | No single end-of-day entry                                      | One day = many separate modals (sales, then each expense)                                                                                                                                                                                                                                                                                                                                                                                                            | **11.15** ✓                                                |
| 16  | **No "all entries" ledger view**                                | ~~`GET .../ledger/entries` exists; no frontend page~~ → `/reports/ledger` full GL report                                                                                                                                                                                                                                                                                                                                                                             | **11.16** ✓                                                |
| 17  | Date field opens calendar **only via icon**                     | ~~`date-input.tsx` input has no click/focus-to-open~~ → click field or icon opens popover; not on focus (`v0.70.0.1` amends 11.17)                                                                                                                                                                                                                                                                                                                                   | **11.17** ✓                                                |
| 18  | Frontend never had an adversarial audit                         | Backend got Phase 8.6; the UI is surfacing hand-found bugs (items 13–17). Reviewer/owner-led frontend audit.                                                                                                                                                                                                                                                                                                                                                         | **11.18**                                                  |
| 19  | **Idempotency key not stable**                                  | `useSubmitIdempotency()` + explicit keys on 39 surfaces; no auto-mint in `api.ts`                                                                                                                                                                                                                                                                                                                                                                                    | **Done** in 11.19 (owner sign-off **APPROVED 2026-06-27**) |
| 20  | Entity-switch state bleed                                       | `opening-balances/page.tsx` keeps `lines`/`goLiveDate` across entity change; 7 detail pages (`suppliers/[id]`, `partners/[id]`, `staff/[id]`, `customers/[id]`, `banking/accounts                                                                                                                                                                                                                                                                                    | fx                                                         |
| 21  | UI not role/setting-aware                                       | ~~Cashier dashboard shows **Net result~~** → role/setting-aware UI (`members/me`, `entity-access.ts`, gated chrome)                                                                                                                                                                                                                                                                                                                                                  | **11.21** ✓                                                |
| 22  | Small UI gaps                                                   | Expense-receipt review has no **reject** path (API exists); reports landing **swallows API errors** (blank cards); header **"This month"** button is dead.                                                                                                                                                                                                                                                                                                           | **11.22**                                                  |


### Correction API inventory (verified in repo, 2026-06-25)

**HTTP done ✓ (Phase 8.5 — record as done; Phase 11 work is UI unless noted):**


| Method | Path                                                   | Core helper                                 | HTTP tests |
| ------ | ------------------------------------------------------ | ------------------------------------------- | ---------- |
| `POST` | `.../ledger/entries/{id}/void`                         | generic void                                | yes        |
| `POST` | `.../ledger/entries/{id}/correct`                      | generic correct (`MANUAL`, `BANK_FEE` only) | yes        |
| `POST` | `.../payables/suppliers/{id}/payments/{je_id}/correct` | `correct_supplier_payment`                  | core only  |
| `POST` | `.../customers/{id}/payments/{je_id}/correct`          | `correct_customer_payment`                  | core only  |
| `POST` | `.../fx/purchases/{je_id}/correct`                     | `correct_fx_purchase`                       | core only  |
| `POST` | `.../pos/daily-summaries/{id}/correct`                 | `correct_pos_daily_summary`                 | yes        |
| `POST` | `.../expenses/{id}/correct`                            | `correct_expense_entry`                     | yes        |
| `POST` | `.../manual-journals/{id}/void`                        | void manual                                 | yes        |


**HTTP done ✓ (Phase 11.12 — shipped, with HTTP tests in `test_correction_apis_phase11.py`):**


| Method | Path                                              | Core helper                      | HTTP tests             |
| ------ | ------------------------------------------------- | -------------------------------- | ---------------------- |
| `POST` | `.../suppliers/{id}/invoices/{je_id}/correct`     | `correct_supplier_invoice`       | yes (+ wrong-type 404) |
| `POST` | `.../customers/{id}/credit-sales/{je_id}/correct` | `correct_credit_sale`            | yes (+ period lock)    |
| `POST` | `.../staff/employees/{id}/ledger/{je_id}/correct` | `correct_staff_journal_entry`    | yes                    |
| `POST` | `.../partners/{id}/ledger/{je_id}/correct`        | `correct_partner_journal_entry`  | yes                    |
| `POST` | `.../fx/ledger/{je_id}/correct`                   | `correct_fx_conversion_or_spend` | yes                    |


**Dedicated POS daily summary correction (11.9 ✓):** `correct_pos_daily_summary()` voids linked `CARD_SALES` + `CASH_MOVEMENT` JEs (with cash movement reversal) and reposts atomically. Standalone card/cash JEs not linked to a posted summary remain **void-and-reenter** only.

**Correction coverage: COMPLETE** — every posted money type now has a dedicated, tie-preserving, period-lock-aware correction HTTP route + tests (Phase 8.5 + 11.10 + 11.12). Void-and-reenter types (`TRANSFER`, `OPENING_BALANCE`, `POS_SETTLEMENT`, etc.) intentionally have no correct route (documented playbook only).

**Other Phase 11 APIs (not correction):**


| Item                                      | API today                                                                                     | Slice                  |
| ----------------------------------------- | --------------------------------------------------------------------------------------------- | ---------------------- |
| Default cash money account                | **partial** — on chart seed only (`v0.68.0`); legacy entities + API response gaps → **11.1a** | **11.1** ✓ / **11.1a** |
| `PATCH .../entities/{id}/settings/{key}`  | **not built** — `POST` create-only                                                            | **11.2**               |
| `POST /entities` → owner membership       | **not built**                                                                                 | **11.5**               |
| `partners.ownership_share_pct`            | **done** (`v0.68.5`)                                                                          | —                      |
| `POST .../partners/{id}/expenses-fronted` | **done ✓** (Phase 5) — slice **11.7** is **UI** unification only                              | **11.7**               |


**Explicitly out of Phase 11** (promote later if owner requires before go-live): unified **document archive** UI (Decisions §7 — files stored per intake, no searchable archive); full **manual journal** composer UI; **period locks** admin UI; **credit card statement** import; bank feeds.

### Build order

```
11.1 Default money accounts (Main drawer) + setup hint          ← done (v0.68.0); gaps → 11.1a
  → 11.2 Feature toggles (post-create step + PATCH)           ← ACTIVE — do not interrupt
  → 11.1a 11.1 follow-ups (legacy backfill, API, form defaults)  ← after 11.2
  → 11.3 MoneyInput
  → 11.4 Dialog focus (once on open)
  → 11.5 Create entity → owner membership
  → 11.6 Partner share %
  → 11.7 Unified expense (partner-fronted)
  → 11.8 Dashboard FX native display
  → 11.9 Correct posted daily sales          ← done (v0.69.0); owner sign-off **APPROVED (2026-06-27)**
  → 11.10 Expense correction API + UI      ← done (v0.69.1); owner sign-off **APPROVED (2026-06-27)**
  → 11.11 Correction UI (existing APIs) + period_unlock_reason on mutations  ← done (v0.69.2)
  → 11.12 Remaining correction APIs (invoice, staff, partner, credit sale, FX conversion/spend)
  → 11.13 Cash-drawer session optional + owner-reopen   ← money-critical (lock model)
  → 11.14 New menu UX: quick actions + grouping + outside-click close + toggle labels
  → 11.15 Day close-out screen (sales + expenses in one)   ← optional / larger
  → 11.16 General ledger / all-entries report (wire existing API)
  → 11.17 DateInput click-to-open (app-wide; amends 10.1; click only — not focus)
  → 11.18 Frontend adversarial audit (reviewer/owner-led)   ← captures more UI bugs
  → 11.19 Stable idempotency key   ← BLOCKER, money-critical (DO RIGHT AFTER 11.3)
  → 11.20 Entity-switch state reset (opening balances + detail pages)
  → 11.21 Role/setting-aware UI (cashier KPIs, view-only chrome, delivery toggle)
  → 11.22 Small UI gaps (receipt reject, reports error surfacing, dead button)
```

**Priority override:** **11.19 (idempotency) is a money-critical BLOCKER** — it can duplicate ledger entries on any money form. Do it **immediately after 11.3** (they pair: 11.3 makes money input safe, 11.19 makes submit safe), before the rest of 11.4–11.18.

11.1–11.4 are sequential (**one slice at a time** unless the owner explicitly assigns parallel work). **11.9, 11.10, 11.12** = separate commits; **11.9–11.12** need owner sign-off when money-critical.

---

### Slice 11.1 — Default money accounts + onboarding bootstrap


|            |                                  |
| ---------- | -------------------------------- |
| **Status** | **done**                         |
| **Tag**    | `v0.68.0-default-money-accounts` |


**Problem:** Every cash picker (`manual expense`, daily sales, cash drawer, FX buy, receipt upload) lists `GET .../banking/accounts?account_kind=cash` — **empty** until owner manually creates an account.

**Acceptance:**

- [x] After **seed chart**, auto-create **one** TRY cash money account per entity (`"Main Drawer"`) unless one already exists.
- [x] Banking page hint when cash branch empty.
- [ ] New menu / cash-picker forms: empty-state hint when no cash account (deferred → **11.1a**).
- [x] Opening balances wizard: default bank/cash line to main drawer (`defaultMainDrawerId`).
- [x] **Do not** auto-create bank accounts (statement-driven); cash only for v1.
- [x] Tests: new entity + seed → cash account exists; pickers non-empty.

**Done (`v0.68.0`):** `banking_service.ensure_default_cash_drawer()` called from `seed_chart_for_entity()` after `seed_default_chart()`; idempotent skip when any CASH account exists. Frontend: Banking empty-cash hint; opening balances uses `defaultMainDrawerId()`. Tests: `test_default_cash_drawer_onboarding.py` (4 tests); `test_chart_of_accounts` list count +1 for GL sub-account `1001`.

**Known gaps (adversarial review 2026-06-25 — fix in 11.1a, not 11.2):**


| #   | Gap                                                                                | Impact                                                        |
| --- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| A   | **No backfill** for entities that seeded chart **before** `v0.68.0`                | Cash pickers still empty until manual New account             |
| B   | **Seed API** `accounts_created` / `accounts[]` omit drawer GL sub-account (`1001`) | Misleading response; list `total` is +1 vs `accounts_created` |
| C   | Cash forms use `items[0]` not `defaultMainDrawerId()`                              | Wrong default when multiple cash accounts (name-sorted list)  |
| D   | New menu forms lack empty-cash hint                                                | Only Banking has setup copy                                   |


---

### Slice 11.1a — 11.1 follow-ups (post-review)


|            |                                                                                             |
| ---------- | ------------------------------------------------------------------------------------------- |
| **Status** | **CLOSED — functional gap (C) done; A/B/D deferred to Phase 13 (cosmetic/moot for launch)** |
| **Tag**    | C shipped within 11.14/11.15 (`defaultMainDrawerId` in forms)                               |


**Purpose:** Close gaps left by 11.1 without re-doing `ensure_default_cash_drawer()` on seed.

**Resolution (2026-06-27 owner decision):** The one functional gap is done; the rest don't earn their keep before go-live, so they move to Phase 13. Phase 11 closes clean.

- [x] **C — Form defaults: DONE.** `defaultMainDrawerId()` used in manual expense, manual daily sales, day close-out, and opening balances (shipped via 11.14/11.15). Forms auto-select "Main Drawer".
- [ ] **A — Legacy backfill → DEFERRED (Phase 13).** Only `ensure_default_cash_drawer` on chart seed today; no list/setup backfill. **Moot for go-live** — fresh production entities seed post-`v0.68.0` and auto-get the drawer; only pre-`v0.68.0` dev/test entities lack it.
- [ ] **B — Seed API count → DEFERRED (Phase 13).** `accounts_created` omits the drawer GL (`1001`). Cosmetic; no functional impact.
- [ ] **D — Empty-cash hint → DEFERRED (Phase 13).** Minor UX; the empty case is now rare because forms auto-default to Main Drawer.

**Do not redo:** 11.1 seed hook, `DEFAULT_CASH_DRAWER_NAME`, or 11.2 entity-settings work.

---

### Slice 11.2 — Feature toggles: after create + editable


|            |                                    |
| ---------- | ---------------------------------- |
| **Status** | **done**                           |
| **Tag**    | `v0.68.1-entity-settings-editable` |


**Problem:** Toggles beside create form; once set, **disabled forever** (frontend + POST-only API).

**Acceptance:**

- [x] Create flow: `POST /entities` → **setup step** (name only on create) → toggles on step 2 with **Save & continue**.
- [x] `PATCH /entities/{id}/settings/{key}` or upsert POST (update existing value).
- [x] Settings page: toggles **editable** anytime; copy: “You can change these when your needs change.”
- [x] **Do not redo:** setting keys, `delivery_enabled` / `card_tips_z_report_enabled` readers.

**Done:** `PATCH /entities/{entity_id}/settings/{key}` + `update_entity_setting()`; duplicate POST → 409. Frontend: post-create wizard step 2 (toggles + Save & continue); settings page toggles always enabled (PATCH when exists, POST when not). Tests: `test_entity_settings.py` (6 tests). **557 pytest green**; frontend build green.

---

### Slice 11.3 — Numeric-only money inputs


|            |                       |
| ---------- | --------------------- |
| **Status** | **done**              |
| **Tag**    | `v0.68.2-money-input` |


**Acceptance:**

- [x] Shared `MoneyInput` (TRY) — `inputMode="decimal"`, strip non-numeric except `,` `.`; live preview optional.
- [x] Migrate priority forms: manual expense, manual daily sales, POS review, payments, transfers, cash movement, opening balances, FX, delivery amounts.
- [x] Paste with letters → strip or visible reject.

**Done:** `MoneyInput` + strict `parseTryToKurus`/`sanitizeTryInput` (integer kuruş, rejects garbage like `"12,3a"`). Migrated all TRY amount fields across money forms and review screens. Vitest: `money.test.ts` (7 tests). **557 pytest green**; frontend build green.

---

### Slice 11.4 — Dialog focus: stay on active field


|                   |                            |
| ----------------- | -------------------------- |
| **Status**        | **done**                   |
| **Suggested tag** | `v0.68.3-dialog-focus-fix` |


**Root cause:** `dialog.tsx` auto-focus effect depended on `requestClose` → refocused **first** field when `dirty` became true.

**Acceptance:**

- [x] Auto-focus **only on dialog open** (`focusedOnOpenRef`); never on `dirty` / `requestClose` change.
- [x] Manual verify: manual expense → focus Item → type/delete → cursor stays in Item.

**Done:** Split keyboard trap effect from one-shot open focus; `focusedOnOpenRef` resets when dialog closes.

---

### Slice 11.5 — Create entity → owner membership


|            |                                    |
| ---------- | ---------------------------------- |
| **Status** | **done**                           |
| **Tag**    | `v0.68.4-entity-create-membership` |


**Problem:** With `AUTH_ENFORCEMENT=true`, new restaurant not in `GET /entities` for creator (membership missing).

**Acceptance:**

- [x] `POST /entities` (authenticated) adds creator as `**owner`** `entity_memberships` row atomically.
- [x] Tests: create → list entities for user includes new id.
- [x] Dev mode (`AUTH_ENFORCEMENT=false`) unchanged.

**Done:** `create_entity(..., creator_user_id=)` adds owner membership in same transaction (flush inside `entity_context`). API passes authenticated user id when enforcement on. Tests: `test_create_entity_adds_creator_as_owner_and_lists_entity`, `test_create_entity_dev_mode_does_not_add_membership`.

---

### Slice 11.6 — Partner ownership share %


|               |                                                      |
| ------------- | ---------------------------------------------------- |
| **Status**    | **done**                                             |
| **Decisions** | Extend §17 — **informational only** (not capital GL) |
| **Tag**       | `v0.68.5-partner-share-pct`                          |


**Acceptance:**

- [x] `partners.ownership_share_pct` — nullable `Numeric(5,2)`, 0–100; sum **warn only** if ≠ 100%.
- [x] Partner form + detail show Share %.

**Done:** Migration `049`; `ownership_share_summary()` on list API; partner form + list/detail UI; tests in `test_partners.py`.

---

### Slice 11.7 — Unified expense entry (partner-fronted)


|                    |                                                                             |
| ------------------ | --------------------------------------------------------------------------- |
| **Status**         | **done ✓** (`v0.68.6-expense-partner-mode`)                                 |
| **Money-critical** | Yes — uses `post_expense_fronted`; owner sign-off **APPROVED (2026-06-27)** |
| **Suggested tag**  | `v0.68.6-expense-partner-mode`                                              |


**Acceptance:**

- [x] Manual expense form: **Payment** — Cash drawer | **Partner paid (owe partner)**.
- [x] Partner mode → existing `POST .../partners/{id}/expenses-fronted` (no new backend route).
- [x] Minimum scope: expense fronted only (reimbursement inverse → clarify with owner if needed).

**Done:** `manual-expense-form.tsx` — payment mode selector; partner Combobox + `expenses-fronted` submit; cash tips (5700) cash-only; draft autosave includes `paymentMode` + `partnerId`. Backend unchanged; existing `test_partners.py` covers API.

---

### Slice 11.8 — Dashboard FX: native currency display


|            |                               |
| ---------- | ----------------------------- |
| **Status** | done                          |
| **Tag**    | `v0.68.7-dashboard-fx-native` |


**Acceptance:**

- [x] `frontend/src/app/page.tsx` — `formatFxNative(native_quantity, currency)` primary; optional muted TRY book cost subtitle.
- [x] **Do not redo:** dashboard API shape.

**Done:** FX wallets section shows native balance as primary (`formatFxNative`); muted `Book cost: …` TRY subtitle per row. No backend changes.

---

### Slice 11.9 — Correct posted daily sales


|                    |                                                |
| ------------------ | ---------------------------------------------- |
| **Status**         | done                                           |
| **Money-critical** | Yes — owner sign-off **APPROVED (2026-06-27)** |
| **Tag**            | `v0.69.0-correct-daily-sales`                  |


**Problem:** Posted manual/photo daily sales hit GL (`CARD_SALES` + `CASH_MOVEMENT`); mistakes need manual journals today.

**Acceptance:**

- [x] `POST .../pos/daily-summaries/{id}/correct` — void linked JEs + card batch + cash movements; repost with new date/cash/card/Z; same shape as confirm.
- [x] UI: posted row on `/sales` → **Correct** → pre-filled form.
- [x] Register in `correction.py`; tests mirror `test_fx_purchase_correct_*`.
- [x] Period lock + duplicate-date guards unchanged.

**Done:** `correct_pos_daily_summary()` in `correction.py`; intake + `CorrectPosDailySummaryRequest`; `correct-daily-sales-form.tsx` + `/sales` Correct button; 5 tests in `test_pos_daily_summary_correct.py`. **568 pytest green**; frontend build green.

---

### Slice 11.10 — Posted expense correction


|                    |                                                |
| ------------------ | ---------------------------------------------- |
| **Status**         | done                                           |
| **Money-critical** | Yes — owner sign-off **APPROVED (2026-06-27)** |
| **Tag**            | `v0.69.1-correct-expense`                      |


**Problem:** Core helper exists; no HTTP route; raw ledger void desyncs `expense_entries`.

**Acceptance:**

- [x] `POST .../expenses/{id}/correct` wrapping existing `correct_expense_entry()`.
- [x] UI on `/expenses` posted rows → Correct dialog.
- [x] Tests: amount/account/date change; subledger + GL tie; period locks (HTTP integration).

**Done:** `correct_expense_by_id()` + `ExpenseCorrect`/`ExpenseCorrectOut`; `correct-expense-form.tsx` + `/expenses` Correct button; 4 tests in `test_expense_correct.py`. **572 pytest green**; frontend build green.

---

### Slice 11.11 — Correction UI + period unlock on mutations


|            |                         |
| ---------- | ----------------------- |
| **Status** | done                    |
| **Tag**    | `v0.69.2-correction-ui` |


**Problem:** Backend correct/void routes are live (Phase 8.5); frontend never calls them. No `period_unlock_reason` in any form (API already accepts it on payment/FX correct payloads).

**Acceptance:**

- [x] UI flows wired to **existing** routes: supplier payment correct, customer payment correct, FX purchase correct, manual journal void (`.../manual-journals/{id}/void`), manual/BANK_FEE correct via `.../ledger/entries/{id}/correct`.
- [x] Shared pattern: when API returns 422 period lock, prompt owner for **unlock reason** and retry with `period_unlock_reason`.
- [x] **Do not** use raw ledger void for subledger-backed types without dedicated flow.
- [x] **Do not redo:** Phase 8.5 correction HTTP layer.

**Done:** Shared `period-unlock.ts` + `usePeriodUnlockSubmit()` hook; correction forms for supplier/customer payment, FX purchase, ledger entry; void manual journal dialog; `/accounting/manual-journals`, `/reports/ledger`; Correct buttons on supplier/customer/FX ledgers; 11.9/11.10 forms updated for period unlock. Vitest: `period-unlock.test.ts` (6 tests). **572 pytest green**; frontend build green; **16 vitest**. **Next:** Phase 11.12 remaining dedicated correction APIs.

---

### Slice 11.12 — Remaining dedicated correction APIs


|                    |                                                |
| ------------------ | ---------------------------------------------- |
| **Status**         | done                                           |
| **Money-critical** | Yes — owner sign-off **APPROVED (2026-06-27)** |
| **Tag**            | `v0.69.3-correction-apis`                      |


**Problem:** Core helpers exist in `correction.py`; no feature HTTP routes yet (unlike payment/FX correct from Phase 8.5).

**Acceptance:**

- [x] HTTP routes + **HTTP** tests for: `correct_supplier_invoice`, `correct_credit_sale`, `correct_staff_journal_entry`, `correct_partner_journal_entry`, `correct_fx_conversion_or_spend`.
- [x] Minimal UI entry points on respective detail pages (Correct dialogs + `usePeriodUnlockSubmit`).
- [x] Void-and-reenter types (`TRANSFER`, `OPENING_BALANCE`, `POS_SETTLEMENT`, etc.) remain **out of scope**.

**Done:** Five POST correct routes (payables invoice, customer credit sale, staff/partner ledger, unified FX conversion/spend). Service layer rebuilds GL lines from create-shaped payloads. Tests: `test_correction_apis_phase11.py` (7 tests — happy path ×5, wrong-type 404, period lock). Frontend: Correct on supplier invoice, customer credit sale, staff accrual/advance/payment, partner expense/reimbursement, FX spend/conversion rows. **579 pytest green** (+7); frontend build green. **Known gap:** staff salary payment with `advance_applied` sibling row returns 422 — dedicated flow deferred. **Next:** Phase 11.13 cash drawer optional session.

---

### Slice 11.13 — Cash drawer: session optional for entry + owner-reopen


|                    |                                                                                                                           |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| **Status**         | done — owner sign-off **APPROVED (2026-06-27)** (money-critical)                                                          |
| **Money-critical** | Yes — touches posting + lock model; owner sign-off                                                                        |
| **Decisions**      | Amend §9 cash drawer (sessions are an **optional EOD reconciliation**, not an entry gate; closed day is owner-reopenable) |
| **Tag**            | `v0.69.4-cash-drawer-optional-session`                                                                                    |


**Problem:** Posting **daily sales** or a **cash movement** auto-opens that day's drawer session and **hard-rejects** when the day is CLOSED — *"drawer day is closed — no further movements allowed"* (`daily_summary_posting.py:91`, `cash/posting.py:196`) — with **no reopen path**. Manual *expenses* (`/expenses`) bypass sessions entirely, so the model is inconsistent, and an EOD close becomes a one-way trap that locks the owner out of fixing/adding to that day.

**Acceptance:**

- [x] Daily sales + cash movements **post without requiring or force-opening** a drawer session; the session becomes an **optional** EOD count/reconcile tool, never a precondition for entry.
- [x] A **closed** drawer day is **owner-reopenable**, reusing the **exact period-lock owner-unlock + audit pattern** (cashier blocked; reopen records who/when/reason). Remove the dead-end "no further movements allowed" block — route to the unlock path.
- [x] One lock behaviour across the app — do **not** leave cash-drawer close and period locks as two different models.
- [x] Tests: post sales + cash movement with **no open session** succeeds; close a day → cashier post rejected, **owner reopen → post succeeds + audited**; over/short still books to `5400` on an explicit close.

**Done:** Migration `050` — nullable `cash_movements.session_id`; drawer reopen fields + `cash_drawer_audit_events`. Core `guards.py` (`DrawerDayClosedError`, `DrawerUnlockRequiredError`, `period_unlock_reason` unlock). API: `POST .../close-day`, `POST .../{id}/reopen`. Frontend: period unlock on cash movement form; Reopen + Close drawer day on `/banking/cash`. **582 pytest green** (+3); frontend build green. **Next:** Phase 11.15 day close-out (optional).

---

### Slice 11.14 — New menu UX: quick actions, grouping, dismiss + toggle labels


|                   |                       |
| ----------------- | --------------------- |
| **Status**        | done                  |
| **Suggested tag** | `v0.69.5-new-menu-ux` |


**Problem:** The cash+card "Daily sales (manual)" and "Manual expense" dialogs exist but live only inside a **flat 9-item** **New** dropdown (New → scan → click). The dropdown also **does not close on outside click** (`new-menu.tsx` has no document-mousedown handler — `combobox.tsx`/`date-input.tsx` already do) — same gap in `command-palette.tsx` and the entity switcher. Toggles were made editable (11.2) but have no labels/help and aren't verified to gate the right forms.

**Acceptance:**

- [x] **Quick actions** (top bar and/or dashboard): "Daily sales" and "Add expense" open the existing dialogs in one click (keep them in New too). Reuse `defaultMainDrawerId()` (11.1a).
- [x] **Group** the New dropdown by area — **Sales** (Daily sales, POS summary photo, Card sales batch, Delivery report) · **Expenses** (Manual expense, Cash tip, Expense receipt photo) · **Suppliers** (Supplier, Supplier invoice). Headers/dividers; same items, just organised.
- [x] **Dismiss on outside click + Escape:** New menu, command palette, and entity switcher close when clicking elsewhere or pressing Esc — reuse the document-mousedown pattern already in `combobox.tsx`/`date-input.tsx` (one shared hook ideally).
- [x] `settings/entity` toggles get a clear label + one-line help each; **verify** `delivery_enabled` hides delivery entry and `card_tips_z_report_enabled` shows/hides the Z field.
- [x] **Do not** rebuild the forms — wire to what exists.

**Done:** `QuickActionsProvider` + grouped `NewMenu`; top bar + dashboard quick actions; shared `useDismissOnOutsideClick` (New menu, command palette panel, Combobox refactor); `filterRoutesByEntitySettings` hides delivery nav/palette when off; manual daily sales uses `defaultMainDrawerId()`. **582 pytest green**; frontend build green. Tag `v0.69.5-new-menu-ux`. **Next:** ~~Phase 11.15~~ → done (`v0.69.6-day-closeout`).

### Slice 11.15 — Day close-out screen (optional, larger)


|                    |                                                                  |
| ------------------ | ---------------------------------------------------------------- |
| **Status**         | done — owner sign-off **APPROVED (2026-06-27)** (money-critical) |
| **Money-critical** | Yes (posts sales + expenses) — owner sign-off                    |
| **Suggested tag**  | `v0.69.6-day-closeout`                                           |


**Problem:** Logging one day takes many separate modals (sales, then each expense).

**Acceptance:**

- [x] Single screen: pick **date once** → cash + card sales → add **N quick expense rows** (item, amount, account) → **post all atomically** (idempotent), via `POST .../operations/day-closeout`.
- [x] Honors 11.13 (no forced session), Turkish money inputs (11.3), and period locks + `period_unlock_reason`.
- [x] Tests: combined post creates the daily-sales entry + each expense; partial-failure rolls back; idempotent re-submit.

**Done:** Backend `DayCloseoutRequest` + `post_day_closeout()` — one transaction (manual sales confirm + N `post_expense_entry`, single commit); nested `entity_context` GUC fix. Frontend `/close-day` page (`DayCloseoutForm`); nav + New menu Operations + dashboard link; `useSubmitIdempotency` + `usePeriodUnlockSubmit`. **588 pytest green** (+6); frontend build green; **16 vitest**. **Next:** Phase 11.17 DateInput click-to-open.

---

### Slice 11.16 — General ledger / all-entries report


|                   |                                                                                             |
| ----------------- | ------------------------------------------------------------------------------------------- |
| **Status**        | **done** (`v0.69.7-ledger-report`) — frontend-only; wired existing `GET .../ledger/entries` |
| **Decisions**     | DESIGN_SYSTEM §7 reports list — "General ledger (all entries)" card                         |
| **Suggested tag** | `v0.69.7-ledger-report`                                                                     |


**Problem:** Owner wants to see **every entry made** in one place. The list API exists; there is no UI and it's not in reports/nav.

**Acceptance:**

- [x] Reports page (`/reports/ledger`) listing journal entries via the existing `GET .../ledger/entries` — date range, search (`q`), source/status filters, pagination; row → entry detail (lines, source, links to void/correct/amend chain).
- [x] Linked from the Reports landing + sidebar; role-gated like other financial reports (`ForbiddenMessage` / 403).
- [x] **Distinct** from the deferred *audit-events* log (FUTURE_IDEAS) — this is the general ledger of posted/voided journal entries, not the raw audit trail.
- [x] **Do not** add a new backend endpoint — wire the existing one.

**Done:** Expanded `/reports/ledger` from narrow correct-only list into full GL report: `ReportDateRange` + description search + source/status filters + pagination (50/page); expandable row detail with chart account labels, amend/void chain navigation, Correct for posted manual/bank_fee; link to Manual journals for void. Reports card + sidebar relabelled "General ledger (all entries)" (`financial: true`). **588 pytest green**; frontend build green; **16 vitest**. **Next:** Phase 11.17 DateInput click-to-open (done in 11.17).

---

### Slice 11.17 — DateInput click-to-open (app-wide)


|            |                                                                                |
| ---------- | ------------------------------------------------------------------------------ |
| **Status** | done (**amends 10.1** — `v0.66.0` icon-only; **click-only** amend `v0.70.0.1`) |
| **Tag**    | `v0.69.8-dateinput-click-open` (+ amend `v0.70.0.1-dateinput-click-only`)      |


**Problem:** `date-input.tsx` opens the calendar only via the trailing icon; clicking the field does nothing. Owner wants modern click-the-field-to-open behaviour, everywhere.

**Acceptance:**

- [x] Clicking the date field opens the calendar (keep the icon too); **not** on focus — dialog auto-focus (11.4) must not pop the calendar.
- [x] Typing still works; Esc + outside-click close (already present). One shared component → applies to **all** date fields app-wide automatically.
- [x] Don't trap the cursor / don't reopen after pick; verify on manual expense, daily sales, payments, opening balances.
- [x] Updates the 10.1 note in this roadmap + `DESIGN_SYSTEM.md` §5/§10.

**Done:** `date-input.tsx` — `onClick` opens calendar; trailing icon toggles; no `onFocus` open. Tag `v0.69.8-dateinput-click-open`. Amend `v0.70.0.1`: removed focus-open (conflicted with dialog auto-focus on Daily sales, manual expense, day close-out, etc.).

---

### Slice 11.18 — Frontend adversarial audit (reviewer/owner-led)


|                   |                                                                                                                                     |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| **Status**        | **done** — owner audit complete (2026-06-27); docs-only closure (findings tracked in slices 11.17–11.22; no separate audit-fix tag) |
| **Suggested tag** | `v0.69.9-frontend-audit` (only if audit produced standalone fix commits — not used)                                                 |


**Purpose:** The backend got the Phase 8.6 adversarial audit; the frontend never did, and the owner is finding UI bugs by hand (items 13–17). Run the same kind of independent, read-only, "assume it's broken" pass over the frontend, then fix + permanent test per gap (§2a meta-rule).

**Scope:** every page + shared component — entry forms (correct money/date/account, no double-submit, idempotency key sent), popover/menu dismiss consistency, read-back correctness, role-gating in the UI, entity-switch resets state, Turkish number/date formatting at the edges, empty/loading/error states, money never shown as float.

**Acceptance:**

- [x] Findings logged here (no duplicates — items 13–17 are already captured; the audit adds *new* ones).
- [x] Each confirmed bug → fix + a permanent test (component/e2e) — tracked in slices 11.17–11.22.
- [x] Money-critical UI flows (anything that posts) → owner sign-off (11.19 approved).

---

### Slice 11.19 — Stable idempotency key (BLOCKER, money-critical)


|                    |                                                                      |
| ------------------ | -------------------------------------------------------------------- |
| **Status**         | **done** — owner sign-off **APPROVED (2026-06-27)** (money-critical) |
| **Money-critical** | Yes — can duplicate ledger entries                                   |
| **Tag**            | `v0.69.10-stable-idempotency-key`                                    |


**Problem:** `frontend/src/lib/api.ts:40` returned a **fresh** `crypto.randomUUID()` Idempotency-Key on every mutation call. Double-click / network retry sent two different keys → two ledger entries.

**Done:**

- `useSubmitIdempotency()` hook — `beginSubmit()` / `completeSubmit()` / `resetSubmit()`; stable key per submit intent, cleared after success or dialog open.
- `apiFetch` no longer auto-mints keys; callers pass `idempotencyKey` explicitly.
- Wired **39** mutation surfaces: all money forms, review confirms (receipt, invoice, POS summary, delivery report), statement classify, opening balances post/validate, plus non-money mutations (CRUD, uploads, settings).
- Vitest: `use-submit-idempotency.test.ts` (3 tests). Backend: `test_client_retry_contract_reuses_one_key_not_two` documents the client contract.

**Acceptance:**

- [x] One **stable** Idempotency-Key per user submit *intent*; reuse on retry; regenerate after success / new entry.
- [x] **Removed** per-call `randomUUID()` auto-gen in `api.ts`.
- [x] Tests: retry same key → one record; new key → new record.
- [x] Owner sign-off (money-critical) — **APPROVED (2026-06-27)**

---

### Slice 11.20 — Entity-switch state reset


|                   |                                |
| ----------------- | ------------------------------ |
| **Status**        | **done**                       |
| **Suggested tag** | `v0.69.11-entity-switch-reset` |


**Problem:** Switching the active restaurant leaves stale state: `opening-balances/page.tsx` keeps `lines`/`goLiveDate`; detail pages (`suppliers/[id]`, `partners/[id]`, `staff/[id]`, `customers/[id]`, `banking/accounts|fx|statements/[id]`) show the prior entity's data until the refetch lands. (Backend RLS + account-entity validation prevent an actual cross-entity post/leak — this is state hygiene, not an isolation breach.)

**Done:**

- `useEntitySwitchReset()` + `useEntityResetKey()` / `createEntitySwitchTracker()` in `use-entity-reset.ts` — synchronous reset via `useLayoutEffect` before paint.
- `useEntityList` clears items immediately on entity change (before fetch completes).
- Wired ROADMAP-listed pages + `cards/page.tsx`, `banking/cash/page.tsx`.
- Vitest: `use-entity-reset.test.ts` (4 tests). `useFormDraft` already keys by entityId — no bleed.

**Acceptance:**

- [x] On `entityId` change, every entity-scoped page/form **resets its state immediately** (clear data → skeleton → fresh fetch); forms clear or reload the entity-scoped draft.
- [x] Tests: switch entity → no prior-entity rows visible; opening-balance lines reset.
- [x] Prefer a shared hook/pattern so new pages get it for free.

---

### Slice 11.21 — Role/setting-aware UI


|            |                          |
| ---------- | ------------------------ |
| **Status** | done                     |
| **Tag**    | `v0.69.12-role-aware-ui` |


**Problem:** The UI ignores role and feature settings: the cashier dashboard shows **Net result** (contradicts the "cashier can't see P&L" decision); `partner_view_only` sees the full New menu + write forms (backend 403s the writes, so this is cleanliness not a breach); `delivery_enabled=off` isn't reflected in nav/New menu/command palette.

**Acceptance:**

- [x] Load the caller's role per entity; **hide/disable** the New menu + mutation forms for `partner_view_only`.
- [x] Cashier: hide net-result/financial KPIs on the dashboard (or gate behind `FINANCIAL_REPORTS_READ`), matching the report-page rule.
- [x] Gate delivery nav / New-menu item / command-palette entries on `delivery_enabled`.
- [x] Tests: each role/setting renders the right chrome.

**Done:**

- `GET /entities/{id}/members/me` → `{ role, permissions[] }`; dev mode accepts `X-User-Id` or defaults owner.
- `entity-access.ts` mirrors backend `ROLE_PERMISSIONS`; `useEntityAccess()` hook resets on entity switch.
- Dashboard KPI filter; reports card + net summary filter; New menu / header / dashboard write chrome hidden for `partner_view_only`; quick-action dialogs guarded.
- Vitest: `entity-access.test.ts` (12 tests). Backend: 3 tests on `/members/me`. **591 pytest green**; **32 vitest**.

---

### Slice 11.22 — Small UI gaps


|                   |                               |
| ----------------- | ----------------------------- |
| **Status**        | **done** (`v0.69.13-ui-gaps`) |
| **Suggested tag** | `v0.69.13-ui-gaps`            |


**Acceptance:**

- [x] Expense-receipt review: add a **reject** action (API `POST .../expense-receipts/{id}/reject` exists), mirroring invoice/POS review.
- [x] Reports landing: **surface API errors** (`ApiError`) instead of silently blank cards.
- [x] Header **"This month"** button: wire to a real date range or remove it.

**Done:**

- `receipt-review.tsx`: reject reason + Reject button with `useSubmitIdempotency`; `StatusBadge`; terminal guard (`posted`/`rejected`).
- Reports landing: `apiErrorMessage()` helper; destructive error on summary fetch failure; cards still render.
- Removed dead header **This month** button (date range lives on dashboard/reports pages).
- Vitest: `api-error-message.test.ts` (3), `review-status.test.ts` (2). **591 pytest green**; **37 vitest**.

---

### Phase 11 complete when


| Slice | Gate                                                                                                                    |
| ----- | ----------------------------------------------------------------------------------------------------------------------- |
| 11.1  | Main cash account on **new** chart seed; Banking hint; OB default                                                       |
| 11.1a | Legacy backfill; seed API count; `defaultMainDrawerId` on forms; New-menu hint                                          |
| 11.2  | Post-create toggle step; PATCH works; toggles editable later                                                            |
| 11.3  | Money fields reject letters on priority forms                                                                           |
| 11.4  | Dialog focus stable while editing                                                                                       |
| 11.5  | Creator is owner member; entity appears in list                                                                         |
| 11.6  | Partner share % on CRUD                                                                                                 |
| 11.7  | Partner-fronted expense from New → Expense                                                                              |
| 11.8  | Dashboard FX shows native currency                                                                                      |
| 11.9  | Correct posted daily sales E2E; owner sign-off                                                                          |
| 11.10 | Correct posted expense E2E; owner sign-off                                                                              |
| 11.11 | Correction **UI** for existing Phase 8.5 APIs; period unlock works                                                      |
| 11.12 | Remaining correction **HTTP** routes + integration tests green; owner sign-off                                          |
| 11.13 | Sales/cash post with no forced session; closed day owner-reopenable + audited; owner sign-off                           |
| 11.14 | Daily sales + Add expense one-click; New menu grouped + closes on outside-click/Esc; toggles labelled + verified gating |
| 11.15 | Day close-out posts sales + expenses atomically; owner sign-off                                                         |
| 11.16 | General-ledger "all entries" report page over existing API; linked + role-gated                                         |
| 11.17 | Date field click-to-open app-wide (not focus-to-open; icon still works)                                                 |
| 11.18 | Frontend adversarial audit done; each finding fixed + tested; money-critical UI signed off                              |
| 11.19 | Stable idempotency key per submit; double-submit/retry → one record (tested); owner sign-off                            |
| 11.20 | Entity switch resets all entity-scoped state; no prior-entity data visible (tested)                                     |
| 11.21 | UI honors role + feature settings (cashier KPIs, view-only chrome, delivery toggle)                                     |
| 11.22 | Receipt reject UI; reports errors surfaced; dead "This month" button resolved                                           |


**Phase 11 complete** — proceed to **Phase 12 — Deployment & go-live**.

---

## Phase 12 — Deployment & go-live

Take the tested app to a real, secure production environment and put real data in it.


| Slice                                                                   | Status                                              | Notes                                                                                                                                                                                                                                                                             |
| ----------------------------------------------------------------------- | --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0. Pre-launch UX (sidebar regroup + onboarding nudge)                   | **done** (`v0.70.0-prelaunch-ux`)                   | Sidebar regrouped into Sales / Expenses & suppliers / People / Customers / Cash & bank / Reports / Settings; dashboard onboarding checklist                                                                                                                                       |
| 0a. UX refinements (top bar, New-menu trim, tips de-special-case)       | **done** (`v0.70.1-ux-refinements`)                 | Remove Daily sales (+ Add expense) from top bar; remove Cash tip + Card sales batch from New menu; tips = any expense (drop forced 5700, full category picker). Migration `051`.                                                                                                  |
| 0b. Modern account menu + switch safeguards                             | **done** (`v0.70.2-restaurant-switcher-safeguards`) | Top-right account menu (avatar, name+email, account/settings, **Clerk sign out**); restaurant switch moved here with always-visible per-restaurant colour badge, confirm-on-switch, unsaved-work warning, "Recording for: X" on entry forms. Reduces wrong-restaurant entry risk. |
| 0c. Member management: add existing user to another restaurant by email | **done** (`v0.70.3-member-add-by-email`)            | `POST /entities/{id}/members` accepts email (+ optional display_name) — reuses existing user or creates one, then membership; friendly 409 when already a member. `member-form.tsx` single POST.                                                                                  |
| 1. Hosting & infrastructure                                             | **done** (`v0.71.0-hosting-infrastructure`)         | Deployment scaffolding: `netlify.toml`, `backend/Dockerfile`, `render.yaml`, `CORS_ORIGINS`, `.env.production.example`, `DEPLOY.md`. Owner provisions Postgres, Redis, backend, Netlify, S3.                                                                                      |
| 2. Production provisioning                                              | **done** (`v0.71.1-prod-provisioning`)              | Migrate/verify scripts, `/health/ready`, smoke script, Render preDeploy, launch guards                                                                                                                                                                                            |
| 3. Backups live                                                         | **done** (`v0.71.2-backup-restore-drill`)           | Restore drill scripts, CI pg tools, Celery failure logging, owner runbook                                                                                                                                                                                                         |
| 4. Observability                                                        | **done** (`v0.71.3-observability`)                  | Sentry (optional DSN), JSON logs, request logging, rate limit, health/uptime docs                                                                                                                                                                                                 |
| 5. Pre-launch security pass                                             | planned                                             | Dependency scan; secrets audit; full suite under production settings; final guard-test run.                                                                                                                                                                                       |
| 6. Owner onboarding & smoke test                                        | planned                                             | Real restaurant(s), chart, opening balances, users/roles; end-to-end smoke in production; **go live.**                                                                                                                                                                            |


### Slice 12.0 — Pre-launch UX: sidebar regroup + onboarding nudge


|                   |                                   |
| ----------------- | --------------------------------- |
| **Status**        | **done** (`v0.70.0-prelaunch-ux`) |
| **Suggested tag** | `v0.70.0-prelaunch-ux`            |


**Problem:** The `Books` nav group is a flat ~17-item wall (`app-routes.ts`) — overwhelming for a non-coder owner, with related items scattered. And first-run gives no guidance toward setup.

**Acceptance:**

- [x] **Regroup the sidebar** (edit `group` labels in `app-routes.ts` + group rendering in `app-shell.tsx`; keep every route + the command palette intact — only the grouping changes):
  - **Sales** — Sales, Close day, Cards, Delivery (+ Platforms / Reports / Settlements children)
  - **Expenses & suppliers** — Expenses, Uploads, Suppliers, Payables
  - **People** — Staff, Partners
  - **Customers** — Customers, Receivables
  - **Cash & bank** — Banking, Bank transfers, Cash drawer
  - **Reports** — Reports, General ledger, Manual journals
  - **Settings** — Restaurant settings, Opening balances, Members & roles
- [x] **Onboarding nudge:** on first run / when the active entity has **no seeded chart** or **no posted opening balances**, show a non-blocking guided checklist (seed chart → opening balances → invite staff → record first day). Dismissable; reflects real state (not a static banner).
- [x] Honor 11.21 role-aware chrome (don't show setup/admin steps to non-owners).
- [x] Tests: nav renders the new groups; every route still reachable; onboarding checklist appears when chart unseeded / OB not posted and hides once done.

---

### Slice 12.0a — UX refinements (owner feedback 2026-06-27)


|                   |                                     |
| ----------------- | ----------------------------------- |
| **Status**        | **done** (`v0.70.1-ux-refinements`) |
| **Suggested tag** | `v0.70.1-ux-refinements`            |


**Acceptance:**

- [x] **Clear the top bar:** remove **all** quick-action buttons from the top bar (Add expense, Add transaction / Daily sales — whatever is there). Those flows live on the dashboard + the New menu only.
- [x] **Trim the New menu:** remove **"Cash tip"** (just an expense — redundant) and **"Card sales batch"** (Daily sales already posts the card portion into clearing `1400` via an under-the-hood card batch — standalone is redundant + a double-count risk; confusing). Keep backend `post_card_sales_batch` (used internally by Daily sales); only the menu shortcut goes.
- [x] **Tips = any other expense; remove `5700` entirely:** delete the `5700 Tips Expense` account from the default chart seed and from the expense category picker; the manual-expense picker offers the **full expense chart** (no `5200`/`5700` hardcode). A tip is recorded under a general expense category (e.g. `5200`), owner's choice — no dedicated tips account, no shortcut. Ledger unchanged (`Dr <chosen expense> / Cr cash`). Update/remove any `5700`-referencing tests. (Pre-launch — no real data posted to `5700`, so safe to drop.)
- [x] Tests: top bar has no quick-action buttons; New menu omits Cash tip + Card sales batch; expense form lists the full expense-category set and `5700` is gone; recording a cash tip as a normal expense posts `Dr <chosen expense> / Cr cash`.

---

### Slice 12.0b — Restaurant switcher → profile menu + switch safeguards (owner feedback 2026-06-27)


|                   |                                          |
| ----------------- | ---------------------------------------- |
| **Status**        | done (frontend)                          |
| **Suggested tag** | `v0.70.2-restaurant-switcher-safeguards` |


**Why:** the active restaurant decides which books every entry posts to. RLS prevents any cross-entity *leak*, and entries are correctable — but an accidental switch could mis-file a day's data into the wrong restaurant. Make switching deliberate and the active restaurant unmistakable. Also: a proper **modern account menu** (the standard top-right pattern — identity, switch, account, sign out).

**Acceptance — modern top-right account menu (think Stripe/Linear/Notion):**

- [x] **Trigger:** a top-right button showing an **avatar (user initials)** + the active-restaurant badge. Opens a clean dropdown; closes on outside-click + Esc (reuse the shared dismiss pattern from 11.14/combobox).
- [x] **Header — who's signed in:** avatar, **display name**, **email** at the top of the menu.
- [x] **Active restaurant + switch:** current restaurant shown with its **per-restaurant colour/initial**; "Switch restaurant" lists only the user's accessible restaurants, with a **confirm** ("Switch to [B]? You're in [A]") — deliberate, not a one-click flip.
- [x] **Always-visible active-restaurant badge** in the top bar (name + colour) so the current restaurant is obvious at a glance even with the menu closed.
- [x] **Account / settings links:** Restaurant settings, Members & roles, Opening balances (role-gated per 11.21 — non-owners don't see admin items).
- [x] **Sign out:** a clear sign-out action wired to **Clerk `signOut()`** → clears session → redirect to sign-in. (Standard, expected, bottom of the menu.)
- [x] *(Optional, if cheap)* appearance/theme toggle hook — only if the token system already supports it; otherwise skip.
- [x] **Unsaved-work guard:** if a form/entry has unsaved input, warn before switching restaurants or signing out (don't lose/misfile work); pairs with 11.20 entity-switch reset.
- [x] **"Recording for: [Restaurant]"** shown on the New-menu entry dialogs, so the active restaurant is visible at the moment of posting.
- [x] Optional: toast "Now working in [B]" after a switch.
- [x] Honor role-aware chrome (11.21). Tests: menu shows the signed-in user; switcher lists only accessible restaurants + requires confirm; sign out clears session and redirects; active-restaurant badge reflects state; unsaved-work warning fires; entry dialogs show the active restaurant.

---

### Slice 12.0c — Member management: add existing user to another restaurant by email (owner feedback 2026-06-27)


|                   |                                          |
| ----------------- | ---------------------------------------- |
| **Status**        | **done** (`v0.70.3-member-add-by-email`) |
| **Suggested tag** | `v0.70.3-member-add-by-email`            |


**Why:** the per-person login + per-restaurant membership model is correct and built — but the **add-member UX** breaks for the multi-branch case. `member-form.tsx` POSTs `create_user` first; if the email already exists (a partner/staffer already in another branch) it errors "User already exists or is already a member — look up the user ID and add via API." Owners can't reasonably do that. This is exactly the "same partner in two branches / grant an existing person another branch" scenario.

**Acceptance:**

- [x] Add a member by **email**: if a user with that email exists, **reuse** them and create the membership; if not, create the user then the membership. No user-ID lookup, no API workaround.
- [x] Clear messages: "Added [email] as [role]" / "Already a member of this restaurant."
- [x] Owner-only (`require_admin_members`); per-entity; invite-only linking unchanged (Clerk verified-email).
- [x] Tests: add a brand-new email → user + membership created; add an **existing** user's email to a second restaurant → membership created, no duplicate user, no error; adding to a restaurant they're already in → friendly 409.

---

### Slice 12.1 — Hosting & infrastructure


|                   |                                             |
| ----------------- | ------------------------------------------- |
| **Status**        | **done** (`v0.71.0-hosting-infrastructure`) |
| **Suggested tag** | `v0.71.0-hosting-infrastructure`            |


**Purpose:** Deployment scaffolding + config + docs so the owner can provision managed Postgres, Redis, API host, Netlify frontend, and S3 backups — without running production migrate or live Clerk keys (Slice 12.2).

**Acceptance:**

- [x] `netlify.toml` — monorepo `base=frontend`, Next.js build, security headers, optional API proxy pattern documented
- [x] `backend/Dockerfile` — production uvicorn image (multi-stage; `postgresql-client` for backups)
- [x] `render.yaml` — web service (API), Celery worker, Celery beat; env placeholders; health check `/health`; persistent disk for uploads/backups
- [x] `CORS_ORIGINS` env in `config.py` + `main.py` — comma-separated origins; default localhost dev; dev still works
- [x] `.env.production.example` — full env catalog (DB, Redis, Clerk, S3 backup, CORS, `APP_ENV=production`, `IDEMPOTENCY_ENFORCEMENT=true`)
- [x] `DEPLOY.md` — plain-English owner guide; staging-first note; volume requirement for uploads
- [x] Tests: `test_cors_config.py` (parse + preflight); full pytest green; frontend `npm run build` green

**Out of scope (12.2):** prod `alembic upgrade head`, Clerk production keys flip, live smoke test.

---

### Slice 12.2 — Production provisioning


|                   |                                        |
| ----------------- | -------------------------------------- |
| **Status**        | **done** (`v0.71.1-prod-provisioning`) |
| **Suggested tag** | `v0.71.1-prod-provisioning`            |


**Purpose:** Production migrate tooling, DB readiness checks, staging runbook, and smoke scripts so the owner can provision staging/prod safely — `alembic upgrade head` without schema drop, RLS/trigger verify, Clerk live-key guard, `/health/ready`.

**Acceptance:**

- [x] `run_production_migrations()` in `provisioning.py` — `alembic upgrade head` via `database_migration_url`; grants via `alembic/env.py`; no schema drop
- [x] `backend/scripts/migrate_production.sh` + `verify_production_db.sh` — load env, migrate/verify; non-zero exit on failure
- [x] `verify_production_database()` — RLS on all `RLS_TABLES` + ledger/audit/period-lock immutability triggers
- [x] `GET /health/ready` — DB ping; 503 when unreachable; `/health` liveness unchanged
- [x] `scripts/smoke_staging.sh` — curl `/health`, `/health/ready`; manual Clerk checklist
- [x] `render.yaml` — `preDeployCommand` migrate + verify on API deploy
- [x] `validate_launch_settings()` — rejects `sk_test_` / `pk_test_` Clerk keys and localhost CORS when `APP_ENV=production`
- [x] `DEPLOY.md` — full Slice 12.2 staging-first runbook
- [x] Tests: `test_db_provisioning.py`, `test_health.py`, `test_launch_settings.py`; full pytest green

**Out of scope (12.3+):** backup restore drill (12.3 done), observability (12.4 done), owner walkthrough (12.6).

---

### Slice 12.3 — Backup restore drill


|                   |                                           |
| ----------------- | ----------------------------------------- |
| **Status**        | **done** (`v0.71.2-backup-restore-drill`) |
| **Suggested tag** | `v0.71.2-backup-restore-drill`            |


**Purpose:** Make backup→restore a real drill, not a checkbox — owner runbook + scripts for managed Postgres staging/prod, CI path so restore-verify runs when pg tools are available, and backups-live checklist (scheduled off-site, verify after backup, alert on failure).

**Acceptance:**

- [x] `backend/scripts/verify_backup_restore.sh` — loads `backend/.env` or env vars; checks `pg_tools_available()`; runs `python -m app.features.backups.cli verify`; non-zero exit + plain PASS/FAIL echo
- [x] `backend/scripts/run_backup_drill.sh` — backup then verify one-liner for staging drill
- [x] CI installs `postgresql-client` before pytest so `@requires_pg_tools` backup restore tests run in pipeline
- [x] Celery `run_daily_backup` logs clearly on failure (`logger.exception`) and success summary
- [x] `DEPLOY.md` §11 + §7 — staging-first drill, S3 checklist, Render alert guidance
- [x] `OPS_RESTORE.md` — drill scripts + scheduled pipeline (backup → verify → prune)
- [x] Tests: `test_backups.py` restore tests run when pg tools in PATH (CI); full pytest green

**Out of scope (12.5+):** pre-launch security pass (12.5), owner walkthrough (12.6).

---

### Slice 12.4 — Observability


|                   |                                    |
| ----------------- | ---------------------------------- |
| **Status**        | **done** (`v0.71.3-observability`) |
| **Suggested tag** | `v0.71.3-observability`            |


**Purpose:** Error monitoring live before go-live (Sentry-or-equiv), structured JSON logging, uptime/health check documentation, basic rate limiting.

**Acceptance:**

- [x] Optional `SENTRY_DSN` in `config.py` + `.env.production.example`; `sentry-sdk[fastapi]` init when DSN set; app boots without DSN
- [x] Production JSON logs on stderr (`APP_ENV=production`); dev/test human-readable; request logging middleware (method, path, status, duration — no bodies/secrets)
- [x] Render health check on `/health/ready` verified in `render.yaml`; `DEPLOY.md` §12 — Sentry, uptime monitor, Render alerts
- [x] In-memory rate limit — 60 req/min per IP in production; skip `/health`, `/health/ready`, `/docs`; 429 with clear message; multi-instance limitation documented
- [x] Tests: `test_observability.py` (Sentry init, JSON formatter, rate limit 429, health skip); full pytest green

**Out of scope (12.5+):** pre-launch security pass (12.5), owner walkthrough (12.6).

---

### Slice 12.5 — Pre-launch security pass


|                   |                                         |
| ----------------- | --------------------------------------- |
| **Status**        | **done** (`v0.71.4-prelaunch-security`) |
| **Suggested tag** | `v0.71.4-prelaunch-security`            |


**Purpose:** Dependency CVE scan, secrets audit, production-settings guard pytest, and documented KVKK/data-protection conscious decision before storing real people's data.

**Acceptance:**

- [x] `backend/scripts/security_dependency_scan.sh` — `pip-audit` on production deps; fails on known CVEs
- [x] `pip-audit` in `pyproject.toml` dev deps; CI step before full pytest
- [x] `backend/scripts/security_secrets_audit.sh` — tracked-source scan (Clerk/AWS/PEM patterns); excludes `.env`, `node_modules`, `.venv`; non-zero on hits
- [x] `backend/scripts/security_production_pytest.sh` — `test_launch_settings.py` + `test_security_invariants.py` with production-like auth/CORS; `APP_ENV=test` for DB
- [x] CI: dependency scan + secrets audit + production guard pytest wired in `.github/workflows/ci.yml`
- [x] `DEPLOY.md` §14 — security scripts, owner secrets checklist, KVKK conscious decision, pre-go-live gate
- [x] `test_security_invariants.py` run sequentially as slice verification; recorded in `TESTS.md` as pre-go-live gate
- [x] Full pytest green

**Out of scope (12.6+):** owner onboarding walkthrough (12.6).

---

### Slice 12.5a — Auto-seed chart on restaurant create


|                   |                                      |
| ----------------- | ------------------------------------ |
| **Status**        | **done** (`v0.71.6-auto-seed-chart`) |
| **Suggested tag** | `v0.71.6-auto-seed-chart`            |


**Purpose:** New restaurants get default chart + Main Drawer automatically — no manual seed step in onboarding.

**Acceptance:**

- [x] `create_entity` calls `provision_entity_baseline` in the same transaction (chart + cash drawer; rollback on failure)
- [x] Idempotent — re-seed API returns 409; provision skips if chart already exists
- [x] Default chart extended with common expense categories (5210–5270); 5200 = Genel Giderler; no 5700
- [x] Manual seed UI removed from entity settings + opening balances; onboarding checklist drops chart step
- [x] `POST …/chart-of-accounts/seed` kept (idempotent) with no user-facing trigger
- [x] Tests: auto-provision on create, OB validate immediately, atomic rollback, expense categories; 615 pytest

**Out of scope (12.6+):** owner onboarding walkthrough (12.6 — done).

---

### Slice 12.6 — Owner onboarding & smoke test


|                   |                                             |
| ----------------- | ------------------------------------------- |
| **Status**        | **done** (`v0.71.8-owner-onboarding-smoke`) |
| **Suggested tag** | `v0.71.8-owner-onboarding-smoke`            |


**Purpose:** Owner cold-start path works end-to-end with zero dead-ends; automated smoke + owner runbook.

**Acceptance:**

- [x] `scripts/smoke_onboarding.sh` + `backend/scripts/smoke_onboarding.py` — entity → chart+drawer → OB validate/post → member by email → expense → P&L 200
- [x] `app/smoke/onboarding.py` shared logic; `test_onboarding_smoke.py` (dev + auth-enforced paths)
- [x] `DEPLOY.md` §15 owner first-restaurant walkthrough; §9 links automated smoke
- [x] Dashboard CTA when no restaurant; post-create wizard redirects to checklist
- [x] Full pytest green

---

**Senior-dev pre-deploy must-dos (fold into the slices above — flagged 2026-06-27):**

- **Staging dry-run first.** Deploy to a prod-like **staging** env and run the full smoke test there before touching production. Don't let prod be the first real deploy.
- **Real backup→restore drill on managed Postgres.** The 2 skipped backup tests are skipped because `pg_dump`/`pg_restore` aren't in the local PATH — so restore-verify has **never actually run end-to-end**. Before trusting backups, do one real backup → restore into a scratch DB → assert the books tie, on the actual managed Postgres. (**Slice 12.3 done** — owner runs `run_backup_drill.sh` on staging per `DEPLOY.md` §11.)
- **Error monitoring live BEFORE go-live** (Sentry-or-equiv), so the first real bug is visible. (**Slice 12.4 done** — owner sets `SENTRY_DSN` on Render per `DEPLOY.md` §12.)
- **Data protection (KVKK) note.** The app stores financial + personal data (staff names, supplier/customer VKN). At minimum: encryption at rest, restricted backup-store access (separate account/region), and a known data-deletion path. Conscious decision required before storing real people's data. (**Slice 12.5 done** — owner sign-off checklist in `DEPLOY.md` §14.)
- **Cold-start onboarding walkthrough as the owner.** Sign up → create restaurant → opening balances → invite staff → record a day → run a report. (**Slice 12.6 done** — `DEPLOY.md` §15 + `scripts/smoke_onboarding.sh`.)
- **Indexes: OK** — entity_id is indexed across tables and journal entries have date/source indexes; no action needed now. Revisit composite report indexes only if a report slows with real volume.

**Phase 12 complete when:** app is live, backed up, monitored, and the owner has recorded real data successfully.

---

## Phase 13 — Post-launch enhancements (parking lot)

**Note:** Phase **10** = §10 UX + FX (done). Phase **11** = product fixes before deploy. This section is **after** go-live. Promote to Decisions before building.

- **Expense account picker shows GL codes (5000/5200/5210) — show names instead** ~~_(found in real-use testing 2026-06-29; quick fix, not yet built)._~~ **DONE (post-launch P1).** `formatExpenseAccountLabel` — Turkish name first, code in parentheses; manual expense, correct expense, partner-fronted, FX spend, receipt review, day closeout.
- **Auto-categorize manual expenses from free text (AI + learning)** **DONE (post-launch P2).** `GET /expenses/suggest-account` — learned aliases first, AI fallback via `expense_receipt_vision_*`; migration `057` `default_expense_account_id`; manual expense form debounced suggest-and-confirm; learns on post.
- **Auto-propagate new default accounts to existing restaurants** — when the default chart grows in a future release, an idempotent "ensure chart complete" sync adds any missing default accounts to every existing entity automatically (owner never manages the chart). Not needed at launch (chart is fixed then; new restaurants auto-seed via `provision_entity_baseline`). Build the first time a default account is added post-launch. Must be idempotent and never touch owner-added custom accounts.
- **§10 interaction UX (dates, combobox, validation, drafts, toasts, focus)** — **→ Phase 10** (pre-launch; slices 10.1–10.7).
- **Delivery sidebar nesting** — **→ Phase 10.2** (owner confirmed).
- **FX purchase cash drawer + movement** — **→ Phase 10.8** (pre-launch; **cash only**, not bank).
- **11.1a leftovers (deferred from Phase 11 — cosmetic/moot for launch):** (A) legacy cash-drawer backfill for entities seeded before `v0.68.0` (moot for fresh prod — they auto-get a drawer on seed); (B) seed-API `accounts_created` count to include the drawer GL `1001` (cosmetic); (D) empty-cash hint on New-menu pickers (rare now that forms auto-default to Main Drawer). Functional gap (C, form defaults) already shipped in 11.14/11.15.
- **Document searchable archive** (Decisions §7) — unified list/filter by type, supplier, date; files already stored per intake.
- **Manual journal composer UI** — backend API exists; accountant adjustments from app.
- **Period locks admin UI** — close/reopen/unlock from settings.
- **Proper KDV/tax-return module** — output − input, declaration, periods (input VAT already captured per rate).
- **FX revaluation** — period-end holding revaluation (today FX is cost-only; gain/loss accounts already exist).
- **Owner combined-restaurant view** — cross-entity, read-only overview (entity-stamped data already supports it).
- **Recipe costing / food-cost %** — ingredient → recipe → menu item; the COGS world deliberately out of v1.
- **Receipt AI learning store** — remember owner corrections to pre-fill future reads.
- **Restore UI + configurable backup schedules**; **scheduled/emailed reports**; **custom report builder**.
- **Tip treatment — Slice A DONE (`v0.48.0`) ✓ signed off.** See **Do not rebuild**.
- **Tip treatment — original Slice B1 (`v0.49.0`) SUPERSEDED by `v0.57.0`.** Do not re-implement `card_sale_basis` / `POS_CARD_TIP` at confirm. Current model: Z match-or-review; tips expense-only.
- **Tip treatment — Slice B2 DONE (`v0.50.0`) ✓ signed off.** Commission sweep done; **H1** in-transit guard done (`v0.58.0`).
- **Tip treatment — Slice C DONE (`v0.51.0`) ✓ signed off;** folded into Phase 8.7.
- **Phase 8.7 + Phase 9 core DONE (`v0.52.0`–`v0.56.0`) ✓ signed off.** Frontend gaps → Phase 9 Slice 2d + 8.
- **Z match-or-review DONE (`v0.57.0`) ✓ signed off.** Ops copy + integration test → Phase 8.8 H4 **done** (`v0.58.3`).
- **Bank deposit exceeds card sale (no Z entered):** still rejected at settlement (`test_inferred_commission_rejects_net_exceeding_batch_gross`). With Z tracking off, owner records deposits manually; with Z on, mismatch routes to Needs Review — not auto-resolved.

---

## Slice log (recent completions)


| Date       | Slice                                           | Commit/tag                                             | Summary                                                                                                                                                                                                                                                       |
| ---------- | ----------------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-06-25 | Invoice classification fixtures (IC-B)        | `v0.73.21-invoice-classification-fixtures`           | YS Hizmet Bedeli + supply Depo/SKU detection; `classify_efatura_intake` confidence; platform link no longer forces commission; Spice Corner 5-PDF pytest corpus |
| 2026-06-30 | Invoice unconfirm / redo (IC-A)               | `v0.73.20-invoice-unconfirm-redo`                      | `POST …/unconfirm` + `POST …/set-kind`; reject discards confirmed; draft review UI: Send back to review, Discard, reclassify; review panel keeps expand open on unconfirm |
| 2026-06-30 | Supplier activity + inline invoice preview      | `v0.73.19-supplier-activity-invoice-preview`           | Chronological supplier timeline API + single-sheet Excel export; inline PDF preview on review hub, supplier activity, draft review; commission confirm without supplier when platform linked; duplicate discard; document download endpoint |
| 2026-06-25 | Delivery monthly gross sales + platform commission | `v0.73.18-delivery-monthly-sales`                      | One posted gross per platform/month (KDV dahil); commission e-Fatura linked by platform + auto-detect; `balance_left_kurus` reconciliation; migration `059`; dashboard `delivery_balance_left`; 731+ pytest (7 pre-existing unrelated failures) |
| *planned*  | Invoice classification IC-A–IC-D                | `POST_LAUNCH_PLAN.md` § IC                             | Unconfirm/redo; Yemeksepeti Hizmet Bedeli + Getir supply vs commission; Spice Corner PDF fixtures; review confidence UX; per-entity learning (IC-D deferred) |
| 2026-06-30 | Metro PDF supplier intake + payables visibility | `v0.73.16-metro-supplier-payables`                     | Metro bare-VKN + SAYIN-first portal PDF heuristics; supplier name; link-supplier auto-create; payables include inactive; suppliers list include_inactive + forbidden state; `metr-inverted.pdf` fixture; review_reason when VKN missing |
| 2026-06-30 | Company profile + e-Fatura supplier intake      | `v0.73.7-company-profile-efatura-suppliers`            | Entity `vkn` (migration `058`, required on create, `PATCH` + Set up UI); PDF parse uses buyer VKN; auto-create/link supplier on e-Fatura upload; `test_entity_profile.py`, `test_efatura_pdf_heuristics.py`, supplier auto-create tests; vitest `vkn.test.ts` |
| 2026-06-30 | Turkish e-Fatura PDF heuristics                 | `bad0de6`                                              | Metro/utility/delivery commission PDF labels; supplier VKN before SAYIN / inverted layouts; `test_efatura_pdf_heuristics.py`                                                                                                                                  |
| 2026-06-29 | P2 — expense AI + learning auto-categorize        | —                                                      | `GET /expenses/suggest-account`; migration `057` `default_expense_account_id`; learned aliases + AI fallback; manual expense debounced suggest; learns on post; 5 pytest + 4 vitest                                                                           |
| 2026-06-29 | P1 — expense account picker labels              | —                                                      | `formatExpenseAccountLabel` — Turkish name first, GL code in parentheses; manual expense, correct expense, partner-fronted, FX spend, receipt review, day closeout; 8 vitest                                                                                                                                                  |
| 2026-06-29 | Fix D + Feature E — first-run onboarding        | —                                                      | Dismissible dashboard checklist (per-entity localStorage, auto-hide when complete); first-run modal (full name, business name, optional legal name); migration `056_entity_legal_name`; `PATCH /users/me` display_name; 685 pytest (+3 new); 164 vitest (+10) |
| 2026-06-28 | Post-launch entity fixes                        | —                                                      | Entity list load retry + error state (no false empty); block duplicate company names per user (409); redirect to dashboard on company switch                                                                                                                  |
| 2026-06-27 | Clearance auto-pick                             | `v0.72.0-clearance-auto-pick`                          | HIGH-confidence rules auto-**link** POS/delivery settlement inflows when exactly one unused settlement matches; link-only (never creates settlements); delivery platform resolved by unique cross-platform match; `rule_auto` flag                            |
| 2026-06-27 | Unified statement review hub (2b)               | `v0.71.16`                                             | `/banking/review` — status tabs, inline confirm/classify/correct/create-supplier, suggestions, token trim (create-supplier), `rule_auto` badge; dashboard link                                                                                                |
| 2026-06-27 | Statement rule auto-apply                       | `v0.71.15`                                             | High-confidence auto-post (bank fee + supplier payment only) flagged `RULE_AUTO`; confidence resets on mapping change; correction = void + relearn; books tie after post **and** reversal; entity-isolated                                                    |
| 2026-06-27 | Statement classification learning               | `v0.71.14`                                             | Per-entity learned rules (RLS, registered); suggestions on needs-review; learn-on-confirm; create-supplier-from-line; conflict → no suggestion                                                                                                                |
| 2026-06-25 | Delivery monthly gross sales + platform commission | `v0.73.18-delivery-monthly-sales`                      | One posted gross per platform/month (KDV dahil); commission e-Fatura linked by platform + auto-detect; `balance_left_kurus` reconciliation; migration `059`; dashboard `delivery_balance_left`; 731+ pytest (7 pre-existing unrelated failures) |
| 2026-06-27 | Bank import column mapping + profiles           | `v0.71.13`                                             | Per-account `BankImportProfile` (RLS); preview grid; Borç/Alacak or signed amount; TR date/decimal; reuses dedup/overlap/classification                                                                                                                       |
| 2026-06-27 | Legacy .xls + robust Excel dates                | `v0.71.12`                                             | `xlrd` for `.xls`; real date-typed cells handled; lazy-import hardening                                                                                                                                                                                       |
| 2026-06-27 | Excel import + lira amount column               | `v0.71.11`                                             | `.xlsx` via openpyxl; amount entered in lira → exact kuruş (Decimal); template column change                                                                                                                                                                  |
| 2026-06-27 | Sidebar single-item groups → direct links       | `v0.71.10`                                             | Groups with one visible item render as one-click links; Sales flattens when delivery off                                                                                                                                                                      |
| 2026-06-27 | Nav consolidation (tabs + cards + hub)          | `v0.71.9`                                              | Sub-pages → section tabs (Sales/Banking/Suppliers/Customers/Settings); reports card-only; reachability guard test                                                                                                                                             |
| 2026-06-27 | Owner onboarding & smoke test                   | `v0.71.8-owner-onboarding-smoke`                       | Onboarding API smoke script, DEPLOY §15 walkthrough, dashboard CTA, wizard → checklist                                                                                                                                                                        |
| 2026-06-21 | Sidebar accordion fix                           | `v0.71.7.1-sidebar-accordion`                          | True single-open accordion; route replace not merge                                                                                                                                                                                                           |
| 2026-06-21 | Collapsible sidebar sections                    | `v0.71.7-collapsible-sidebar`                          | Collapsible nav groups + localStorage; Dashboard pinned; delivery sub-pages → tabs on /delivery                                                                                                                                                               |
| 2026-06-21 | Auto-seed chart on restaurant create            | `v0.71.6-auto-seed-chart`                              | Atomic chart+drawer on create; expense categories 5210–5270; seed UI removed; onboarding → OB → staff → first day; 615 pytest                                                                                                                                 |
| 2026-06-27 | Phase 12 Slice 12.5 — pre-launch security pass  | `v0.71.4-prelaunch-security`                           | pip-audit deps, secrets audit, production guard pytest, DEPLOY §14 KVKK; CI wired; 611 pytest                                                                                                                                                                 |
| 2026-06-27 | Phase 12 Slice 12.4 — observability             | `v0.71.3-observability`                                | Sentry optional DSN, JSON logs, request logging, rate limit middleware, DEPLOY §12; 611 pytest                                                                                                                                                                |
| 2026-06-27 | Phase 12 Slice 12.3 — backup restore drill      | `v0.71.2-backup-restore-drill`                         | verify/drill scripts, CI postgresql-client, Celery failure logs, DEPLOY/OPS runbook; 605 pytest                                                                                                                                                               |
| 2026-06-27 | Phase 12 Slice 12.2 — production provisioning   | `v0.71.1-prod-provisioning`                            | migrate/verify scripts, `/health/ready`, smoke script, Render preDeploy, launch guards, DEPLOY runbook; 605 pytest                                                                                                                                            |
| 2026-06-27 | Phase 12 Slice 12.1 — hosting & infrastructure  | `v0.71.0-hosting-infrastructure`                       | `netlify.toml`, `backend/Dockerfile`, `render.yaml`, `CORS_ORIGINS`, `.env.production.example`, `DEPLOY.md`; 596 pytest                                                                                                                                       |
| 2026-06-27 | Phase 12 Slice 0c — member add-by-email         | `v0.70.3-member-add-by-email`                          | Email-based member invite; reuse existing user across restaurants; 592 pytest                                                                                                                                                                                 |
| 2026-06-25 | Alembic migration grants fix                    | `v0.67.2-alembic-migration-grants`                     | `alembic upgrade head` uses schema owner; auto-grant `mizan_app`; 547 pytest                                                                                                                                                                                  |
| 2026-06-25 | Phase 11 Slice 11.1 — default cash drawer       | `v0.68.0-default-money-accounts`                       | `ensure_default_cash_drawer` on chart seed; Banking hint; OB default drawer; 549 pytest                                                                                                                                                                       |
| 2026-06-25 | Phase 11 plan restored                          | —                                                      | Audit-driven pre-go-live slices 11.1–11.12; deployment → Phase 12                                                                                                                                                                                             |
| 2026-06-25 | Phase 10 Slice 3 — Shell feedback               | `v0.66.2-shell-feedback`                               | Toasts on all POST saves; verified palette/Esc/skeletons; build green                                                                                                                                                                                         |
| 2026-06-25 | Phase 10 Slice 2 — Delivery nav nesting         | `v0.66.1-delivery-nav`                                 | Nested Delivery sidebar; removed flat duplicates; palette unchanged; build green                                                                                                                                                                              |
| 2026-06-24 | Phase 10 Slice 1 — Shared DateInput             | `v0.66.0-date-picker`                                  | `DateInput` + calendar popover; 22 date fields migrated; default today on forms; build green; 545 pytest                                                                                                                                                      |
| 2026-06-24 | Phase 9 Slice 9 — Settings & onboarding         | `v0.64.0-phase9-settings-onboarding`                   | Settings hub, OB wizard, members, entity create; 545 pytest                                                                                                                                                                                                   |
| 2026-06-24 | Phase 9 Slice 3 — Suppliers & payables          | `v0.59.0-phase9-suppliers-payables`                    | Supplier CRUD; e-Fatura upload/review; payables summary; record payment                                                                                                                                                                                       |
| 2026-06-24 | Phase 8.8 H4 — card-tip day ops guidance        | `v0.58.3-phase8.8-h4-z-ops-guidance`                   | Z mismatch review copy; Decisions §9 operator note; integration test; 543 pytest                                                                                                                                                                              |
| 2026-06-24 | Phase 8.8 H3 — expense receipt test gaps        | `v0.58.2-phase8.8-h3-expense-receipt-guards`           | Line-sum mismatch confirm blocked (existing guard); cross-entity read/confirm + RLS isolation; 4 tests; 542 pytest                                                                                                                                            |
| 2026-06-24 | Phase 8.8 H2 — tips expense cash-only at API    | `v0.58.1-phase8.8-h2-tips-cash-only`                   | `post_expense_entry` rejects `5700` from bank; `InvalidExpensePostingError` → 422; 2 tests; 538 pytest                                                                                                                                                        |
| 2026-06-24 | Phase 8.8 H1 — commission sweep timing guard    | `v0.58.0-phase8.8-h1-commission-sweep-guard`           | `clear-commission` rejects undeposited card sales (`in_transit > 0`, no settlements); `InTransitCardSalesError` → 422; 2 tests; 536 pytest                                                                                                                    |
| 2026-06-24 | Z match-or-review (supersedes B1 tip basis)     | `v0.57.0-pos-z-match-or-review`                        | No POS tip posting; Z == system card → post; tips expense-only; P&L/BS test; 534 pytest                                                                                                                                                                       |
| 2026-06-24 | Phase 9 — read-back lists + Clerk               | `v0.56.0-phase9-readback-clerk`                        | `/expenses` + `/sales` list pages; `@clerk/nextjs` auth; entity switcher; `GET /users/me`; 534 pytest                                                                                                                                                         |
| 2026-06-24 | Phase 8.7 + Phase 9 New menu                    | `v0.55.0-phase9-new-menu`                              | Multi-line receipt OCR, manual sales API, New dropdown, receipt review; tags `v0.52.0`–`v0.55.0`; 533 pytest                                                                                                                                                  |
| 2026-06-24 | Tips Slice B2 — card commission total clearance | `v0.50.0-pos-commission-total-clearance-slice-b2`      | One-button `1400` residual → `5300` sweep; `POS_COMMISSION_SWEEP`; no migration; 511 pytest                                                                                                                                                                   |
| 2026-06-24 | Tips Slice B1 — card tips via Z report          | `v0.49.0-pos-card-tips-z-report-slice-b1`              | **Superseded by `v0.57.0*`* — was `card_sale_basis` + `POS_CARD_TIP`; do not restore                                                                                                                                                                          |
| 2026-06-23 | Tips Slice A — tips are an expense              | `v0.48.0-tips-expense-slice-a`                         | Retire `2260`/tips subsystem; gross sales; `5700 Tips Expense`; migration `045`; 497 pytest                                                                                                                                                                   |
| 2026-06-23 | Period locks review fixes                       | `v0.47.12`                                             | IMMUTABLE_AUDIT_TABLES registry; append-only audit triggers; period_locks no-delete; split correction tests; 483 pytest                                                                                                                                       |
| 2026-06-23 | PDF export review fixes                         | `v0.47.11`                                             | Lazy reportlab; bundled DejaVu fonts; ₺/Turkish glyph tests; fresh-install CI guard; 473 pytest                                                                                                                                                               |
| 2026-06-23 | PDF export — financial statements               | `v0.47.10-phase8.5-pdf-export`                         | reportlab PDF for P&L/balance sheet/cash flow; `format_try` at render edge; `GET .../export/pdf`; 469 pytest                                                                                                                                                  |
| 2026-06-23 | Flexible dates + soft period locks              | `v0.47.9-phase8.5-period-locks`                        | Go-live floor; soft day/month locks; owner unlock + audit; dirty flag; posting boundary guard; 464 pytest                                                                                                                                                     |
| 2026-06-23 | Pagination + search + filters                   | `v0.47.5-phase8.5-pagination-filters`                  | Shared listing module; paginated list responses on all list endpoints; ledger entries list; 444 pytest                                                                                                                                                        |
| 2026-06-23 | Idempotency on writes                           | `v0.47.3-phase8.5-idempotency`                         | Server-side `Idempotency-Key` middleware; `idempotency_records` table; 432 pytest                                                                                                                                                                             |
| 2026-06-22 | DB provisioning                                 | `v0.47.2-phase8-db-provisioning`                       | Alembic chain fix, canonical `upgrade head`, RLS+triggers migration 038, 423 pytest                                                                                                                                                                           |
| 2026-06-22 | Auth hardening                                  | `v0.47.1-phase8-auth-hardening`                        | CLERK_TEST_MODE + audience production guards; permanent route/posting/RLS tests; RLS GUC re-sync; 420 pytest                                                                                                                                                  |
| 2026-06-22 | Launch readiness                                | `39d11ed` / `v0.47.0-phase8-launch-readiness`          | Clerk JWT/JWKS auth, invite-only provisioning, AUTH_ENFORCEMENT default on, 412 pytest                                                                                                                                                                        |
| 2026-06-22 | Backups                                         | `eed9f92` / `v0.46.0-phase8-backups`                   | pg_dump+uploads artifact, S3/local storage, Celery+Redis schedule, retention, restore-verify, OPS_RESTORE.md, 401 pytest                                                                                                                                      |
| 2026-06-22 | Security hardening                              | — / `v0.45.0-phase8-security-hardening`                | write/read/report guards on all entity routes; scoped entity list; membership user-lookup RLS; 398 pytest                                                                                                                                                     |
| 2026-06-22 | Roles & permissions                             | — / `v0.44.0-phase8-roles-permissions`                 | users + entity_memberships, permission layer, financial report guards, 389 pytest                                                                                                                                                                             |
| 2026-06-22 | POS daily-summary photo intake                  | `4a529b3` / `v0.32.0-phase6-pos-daily-summary-intake`  | `pos_daily_summaries`, OCR v1, confirm posts card batch + cash in, 275 pytest                                                                                                                                                                                 |
| 2026-06-21 | App scaffold & repo setup                       | `d91ccec` / `v0.1.0-phase0-scaffold`                   | FastAPI + Next.js monorepo, Mizan shell, money type, docker Postgres, pytest                                                                                                                                                                                  |
| 2026-06-21 | Multi-restaurant foundation                     | `29ce4a3` / `v0.2.0-phase0-entity-isolation`           | Entity + RLS, entity_context, cross-entity isolation tests                                                                                                                                                                                                    |
| 2026-06-21 | Opening-balances plan                           | `451c57f` / `v0.4.0-phase0-complete`                   | Default chart, OB validation, wizard plan, Phase 0 done                                                                                                                                                                                                       |
| 2026-06-21 | Chart of accounts + entity scoping              | `781b7f0` / `v0.5.0-phase1-chart-of-accounts`          | Persisted accounts, seed/list API, RLS isolation                                                                                                                                                                                                              |
| 2026-06-21 | Read e-Fatura invoice into draft                | `a952821` / `v0.9.0-phase1-efatura-draft`              | invoice_drafts, UBL-TR XML, PDF heuristics, 70 pytest                                                                                                                                                                                                         |
| 2026-06-21 | Supplier master (per entity)                    | `63ed5cf` / `v0.10.0-phase2-supplier-master`           | suppliers CRUD, VKN lookup, entity isolation, 85 pytest                                                                                                                                                                                                       |
| 2026-06-21 | Payables ledger & balance                       | `48dbdd7` / `v0.11.0-phase2-payables-ledger`           | supplier_ledger_entries, running balance, payables API, 97 pytest                                                                                                                                                                                             |
| 2026-06-21 | Invoice → payable posting (draft-to-ledger)     | `3f367f5` / `v0.15.0-phase2-draft-to-ledger`           | confirmed draft → GL + payables; Input VAT 1500; 127 pytest                                                                                                                                                                                                   |
| 2026-06-21 | Supplier payment GL posting                     | `a08e703` / `v0.16.0-phase2-supplier-payment-gl`       | `post_supplier_payment()` Dr AP Cr bank/cash + subledger; Phase 2 complete                                                                                                                                                                                    |
| 2026-06-21 | Bank/cash account tree                          | — / `v0.17.0-phase3-bank-cash-tree`                    | `money_accounts` + GL sub-accounts; tree API; 143 pytest                                                                                                                                                                                                      |
| 2026-06-21 | Statement import & classify                     | `6133506` / `v0.18.0-phase3-statement-import-classify` | CSV import + classify; link-or-post supplier payments; 151 pytest                                                                                                                                                                                             |


---

*Keep this file current. If it disagrees with git or `PROGRESS.md`, git wins — then fix the docs.*