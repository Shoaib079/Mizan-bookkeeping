# ROADMAP — Restaurant Bookkeeping App

**Build progress tracker.** Mirrors Decisions §27. Update after every slice — mandatory before marking work complete (see `CURSOR_RULES.md` §2).

**Rule:** Nothing advances to the next slice until the current slice passes the completion gate (characterized → audited → tested → fixed → API verified → self-audited → ROADMAP updated → commit/tag) and the owner signs off.

---

## Current status

**Crash / new session:** read this file + `PROGRESS.md`, then run the Recovery Protocol in `CURSOR_RULES.md` §5 before changing code. Git wins if docs disagree — then fix the docs.

| Field | Value |
|-------|-------|
| **Active phase** | Phase 9 — frontend |
| **Active slice** | Phase 9 Slice 4 — Banking & cash |
| **Last completed slice** | Phase 9 Slice 3 — Suppliers & payables (`v0.59.0-phase9-suppliers-payables`) |
| **Last commit/tag** | `v0.59.0-phase9-suppliers-payables` |
| **Next up** | Phase 9 Slice 4 — Banking & cash |

**The whole journey:** Phases 0–8 = backend core (DONE). **Phase 8.7** = expense-receipt OCR + manual daily-sales API (DONE). **Phase 8.8** = remaining backend gaps from the 2026-06-24 adversarial review (not a re-do of tips/Z — see **Do not rebuild** below). Phase 9 = frontend. Phase 10 = deployment & go-live. Phase 11 = post-launch enhancements. Build strictly in order, one slice at a time, never skipping the completion gate or the golden rules below.

### Do not rebuild (already done — git is source of truth)

| Work | Tag / commit | Status | Do **not** duplicate |
|------|--------------|--------|----------------------|
| Tips = cash expense (`5700`), gross sales, no `2260` | `v0.48.0-tips-expense-slice-a` | done | Re-add tips payable pot, POS carve-out, or `2260` |
| Card commission total-clearance sweep | `v0.50.0-pos-commission-total-clearance-slice-b2` | done | Re-add `commission_recognition` setting or per-deposit commission UI |
| Tip photo OCR stub | `v0.51.0-expense-photo-tip-ocr-slice-c` | done | New tip-only pipeline — use unified `expense-receipts` |
| Multi-line expense receipt + manual sales API | `v0.52.0`–`v0.54.0`, `d2a624b` | done | Re-build D1–D3 intake from scratch |
| **Original Slice B1** (`card_sale_basis`, `POS_CARD_TIP` at confirm) | `v0.49.0` | **superseded** | Re-implement `system`/`z_report`/`ask` tip posting at POS |
| **Z match-or-review** (Z == system card; tips expense-only) | `v0.57.0-pos-z-match-or-review`, `a6dd4e6` | done | Re-derive `tip = Z − card` at POS or book `5700` on confirm |
| Phase 9 New menu + receipt review | `v0.55.0-phase9-new-menu` | done | Re-scaffold shell / New dropdown |
| Phase 9 read-back + Clerk | `v0.56.0-phase9-readback-clerk` | done | Re-wire auth from scratch |

**Owner sign-off ✓ (2026-06-21)** on money-critical rows above — tips A/B2/C, Phase 8.7 D1–D3, Phase 9 core (`v0.52.0`–`v0.56.0`), Z match-or-review (`v0.57.0`). Original Slice B1 (`v0.49.0`) was superseded before sign-off. Tag `v0.57.1-owner-sign-off`.

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
| Tips (pass-through, not revenue/expense) | **superseded** | Was `v0.35.0` — `tip_accruals`/`tip_payouts`/`2260`; **reversed by Slice A `v0.48.0`** — tips are cash expense (`5700`), gross sales; subsystem removed migration `045`; see **Do not rebuild** |
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
| 2. Correct / amend operation | done | `correct_journal_entry()` — atomic void + reversal + corrected post in one transaction; `amends_entry_id` / `amended_by_entry_id` links; `LedgerAuditAction.AMEND`; `POST /entities/{id}/ledger/entries/{id}/correct` (**whitelist:** `MANUAL` + `BANK_FEE` only — all other sources 409 with dedicated-flow or void-and-re-enter hint); subledger-safe follow-up: `correction.py` registry + type-specific flows; dedicated correct endpoints for supplier payment, customer payment, FX purchase; completeness guard test; 454 pytest |
| 3. Pagination + search + filters | done | Shared `app/core/listing/` (`ListParams`, Turkish-aware `q`, date/amount/status/FK filters, `PaginatedListOut`). All entity list endpoints return `{items, total, limit, offset}`; new `GET .../ledger/entries`. Consistent query params: `q`, `from`, `to`, `min_amount`, `max_amount`, `status`, `*_id`. `test_list_pagination.py`; 444 pytest |
| 4. Flexible dates + soft period locks | done | Go-live floor; soft day/month locks; owner unlock + audit; dirty flag; `IMMUTABLE_AUDIT_TABLES` + append-only audit triggers; `period_locks` no-delete trigger; migration `042`; guard-tests; split correction lock tests; 483 pytest |
| 5. PDF export — financial statements | done | Lazy `reportlab` imports; bundled DejaVu Sans TTF (`app/core/pdf/fonts.py`); ₺ + Turkish glyphs fail loudly; bold totals via DejaVuSans-Bold; `GET .../export/pdf`; `financial_reports_guard`; `test_pdf_export.py` (6 tests); fresh-install guard script + CI; `REVIEWER_BRIEF.md`; 473 pytest |

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

| Item | Tag | Summary |
|------|-----|---------|
| 0 | `v0.47.13-phase8.6-control-account-ties` | Control-account tie registry + completeness guards |
| 1 | `v0.47.14-phase8.6-staff-advance-fix` | `ADVANCE_APPLIED` subledger; full payable clearance |
| 2 | `v0.47.15-phase8.6-payables-gl-tie` | AP adjustments through GL posting boundary |
| 3 | `v0.47.16-phase8.6-settlement-idempotency` | POS/delivery settlement dedup + batch unique |
| 4 | `v0.47.17-phase8.6-pos-tips-carveout` | POS tips carved from revenue at confirm — **superseded** by Slice A (`v0.48.0`) then Z match-or-review (`v0.57.0`) |
| 5 | `v0.47.18-phase8.6-cash-flow-investing` | `FX_PURCHASE` → investing; source registry guard |
| 6 | `v0.47.19-phase8.6-subledger-immutability-guards` | `IMMUTABLE_SUBLEDGER_TABLES` + raw SQL tests |

---

## Phase 8.7 — Expense receipt OCR + manual sales (backend, pre-frontend)

**Status: COMPLETE ✓ (owner signed off 2026-06-21)** — D0–D3 built, committed `d2a624b`, tagged `v0.52.0`–`v0.54.0`. **Follow-up:** Z simplification landed after 8.7 as `v0.57.0` (not part of D1–D3 — do not re-build 8.7). Remaining gaps → **Phase 8.8**.

**Why before Phase 9:** Slice C reads **only a tip** from a receipt photo. The owner needs **all handwritten lines** (peynir, süt, …) as separate cash expenses under their names, plus typed sales/expenses from the Add button. Backend APIs must exist before the frontend wires them.

**Owner decisions (confirmed 2026-06-24):**

- One receipt photo → **one cash expense per line** (item name + amount); tip line → `5700`, other lines default → `5200 Genel Giderler` (editable on review).
- Receipt OCR payment is **cash-only** (cash drawer chosen at upload).
- **Review-first** — nothing auto-posts; owner confirms (and may edit) before GL.

**Build order (each slice = completion gate + tag + owner sign-off on money-critical slices):**

| Slice | Status | Purpose | Tag (planned) |
|-------|--------|---------|---------------|
| **D0 — Promote Decisions** | done | Multi-line receipt OCR + cash-only + vision OCR in Decisions docs | docs only |
| **D1 — Expense receipt intake** | done | migration `048`, upload/confirm/reject API, `tip-photos` wrapper | `v0.52.0-expense-receipt-intake` |
| **D2 — Complete OCR adapter** | done | `expense_receipt.py` fixture/heuristics/vision; multi-line + tip tests | `v0.53.0-expense-receipt-ocr` |
| **D3 — Manual daily sales API** | done | `POST .../pos/manual-daily-sales`; reuse POS confirm posting | `v0.54.0-manual-daily-sales` |

**APIs (planned):**

| Method | Path | Role |
|--------|------|------|
| `POST` | `/entities/{id}/expense-receipts` | Multipart upload → intake + line drafts |
| `GET` | `/entities/{id}/expense-receipts/{id}` | Intake + lines for review screen |
| `POST` | `/entities/{id}/expense-receipts/{id}/confirm` | Edit lines → post all atomically |
| `POST` | `/entities/{id}/expense-receipts/{id}/reject` | Reject without posting |
| `POST` | `/entities/{id}/pos/manual-daily-sales` | Typed cash + card sales (manual entry) |
| `POST` | `/entities/{id}/expenses` | Manual expense (already exists) |
| `POST` | `/entities/{id}/expenses/tip-photos` | **Legacy wrapper** → unified intake (Slice C compat) |

**Needs Review guards (deterministic, not AI):** no lines extracted; zero/negative line amounts; fuzzy item spelling; optional receipt-total vs sum(lines) mismatch; duplicate photo per entity (409).

**Out of scope for Phase 8.7:** bank-paid expense receipts; supplier e-Fatura fields on market receipts; Receipt AI learning store (`FUTURE_IDEAS.md`); manual↔receipt duplicate linking (later slice).

**Phase 8.7 complete when:** D0–D3 done, full pytest + fresh-install verify green, ROADMAP updated, owner sign-off on money-critical slices → **then** Phase 9 frontend. **→ Phase 8.7 COMPLETE ✓ (owner signed off 2026-06-21).** Phase 8.8 gaps remain.

---

## Phase 8.8 — Adversarial review follow-ups (backend hardening)

**Status: COMPLETE ✓** — H1–H5 done (`v0.58.0`–`v0.58.4`). Surfaced by independent adversarial review after `v0.57.0`. These were **gaps in guards/tests/ops safety/docs**, not a re-do of Slice A/B/C or Phase 8.7. Do **not** re-open `card_sale_basis` or POS tip posting (see **Do not rebuild** above).

**Purpose:** Close remaining money/ops risks before owner sign-off and production. Each slice = completion gate + tag. Can run in parallel with Phase 9 frontend where noted.

| Slice | Status | Implements | Acceptance (minimum) |
|-------|--------|------------|----------------------|
| **H1 — Commission sweep timing guard** | done | Adversarial finding: `clear-commission` sweeps all of `1400` even when card sales are still in transit | `POST .../clear-commission` rejects when `GET .../clearing-reconciliation` shows `in_transit_kurus > 0` and no settlements (`pos_settlement_count == 0`) → 422 + clear message; 2 permanent tests; `DECISIONS.md` § commission sweep updated. Tag `v0.58.0-phase8.8-h1-commission-sweep-guard`. **536 pytest green.** |
| **H2 — Tips expense cash-only at API** | done | Adversarial finding: generic `post_expense_entry` allows `5700` from bank | `post_expense_entry` rejects `5700` unless `money_account` is cash (`InvalidExpensePostingError` → 422); receipt intake unchanged (already cash-only); 2 tests; `DECISIONS.md` § tips updated. Tag `v0.58.1-phase8.8-h2-tips-cash-only`. |
| **H3 — Expense receipt test gaps** | done | Adversarial finding: missing negative/isolation coverage | Guard already in `confirm_expense_receipt` (line sum vs `receipt_total_kurus`); 4 permanent tests — mismatch blocked, override fix posts, API + service cross-entity read/confirm 404, RLS hides intakes/lines. Tag `v0.58.2-phase8.8-h3-expense-receipt-guards`. **542 pytest green.** |
| **H4 — Card-tip day ops guidance** | done | Adversarial finding: when Z > system card, review message does not explain cash↔card reallocation workflow | Needs Review copy explains reallocate cash→card (same total) + expense-paper tip + re-confirm; Decisions §9 operator note; integration test mismatch → expense tip → corrected confirm → deposit + sweep clears `1400`. Tag `v0.58.3-phase8.8-h4-z-ops-guidance`. |
| **H5 — Docs dedup** | done | Stale `DECISIONS.md` Slice B1 (`system`/`z_report` GL) contradicts `v0.57.0` entry | B1 marked superseded; canonical Z match-or-review in v0.57.0 entry; Phase 6 tips pass-through row updated; no code change. Tag `v0.58.4-phase8.8-complete`. |

**Phase 8.8 complete when:** H1–H5 done (or explicitly deferred by owner in Decisions), full pytest green, ROADMAP updated, owner sign-off on money-critical items H1–H2. **→ Phase 8.8 COMPLETE ✓ (owner signed off H1–H2, 2026-06-21).** Tag `v0.58.5-owner-sign-off`.

**Out of scope for Phase 8.8:** Re-building Z tip derivation at POS; re-adding `card_sale_basis`; frontend forms (→ Phase 9 Slice 2d).

---

## Phase 9 — Frontend (record data, then see it)

Backend core is complete; Phase 8.7 adds the remaining intake APIs this UI needs. Follow `DESIGN_SYSTEM.md` (white bg,
blue `#2563EB`, Inter, Lucide, shadcn token file, the page archetypes, app shell) and the
"structure first, theme later" rule. Stack: Next.js + TypeScript + Tailwind + shadcn/ui. Each slice
is a thin vertical: auth → entity context → API → ledger → read-back, shippable on its own.

Phase 8.7 backend APIs must be signed off **before** slices that depend on them (receipt upload, manual daily sales). Other slices wire existing backend APIs — no new accounting logic in the frontend. One shared component kit + one token file (DESIGN_SYSTEM.md); every screen is one of the locked page archetypes. Build all structure against default tokens; the final look is applied later (Slice 10) by editing only the token file. Golden rule #8 applies to every form.

| Slice | Status | Notes |
|-------|--------|-------|
| 1. Shell + login + **New** menu | done | App shell + sidebar **New** dropdown; Clerk login when `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` set; entity switcher | `v0.55.0-phase9-new-menu` |
| 2. Manual sales + expenses | done | Forms wired to `POST /expenses` and `POST /pos/manual-daily-sales` | — |
| 2b. Expense receipt upload | done | Upload → `POST /expense-receipts` → review route | — |
| 2c. Read-back lists + Clerk | done | `/expenses` + `/sales` lists; Clerk login + entity switcher + `GET /users/me` | `v0.56.0-phase9-readback-clerk` |
| **2d. Money-entry UX gaps (adversarial follow-up)** | **planned** | **Do not re-build 2/2b — patch only.** | When `card_tips_z_report_enabled`: manual daily sales form sends `z_report_kurus`; treat API `status: needs_review` as failure (not success); manual expense allows picking `5700`; double-submit lock on confirm buttons. Maps to Phase 8.8 H4 operator flow. |
| 3. Suppliers & payables | done | Supplier master CRUD; e-Fatura upload → link supplier → confirm → post; record payment; supplier ledger + `/payables` summary. Wired to existing Phase 2 APIs — no new backend logic. | `v0.59.0-phase9-suppliers-payables` |
| 4. Banking & cash | planned | Account tree + balances; statement upload → classify → Needs Review; transfers; cash drawer (open / movements / EOD close with over-short); FX wallets (purchase / convert / spend). |
| 5. POS & delivery sales | planned | POS daily-summary + card-sales intake; delivery platform reports + settlements + reconciliation; user-managed delivery platforms; commission e-Faturas. |
| 6. Staff, partners, receivables, tips | planned | Entry forms + ledger views for each subledger (salary vs advance, partner reimbursements, customer receivables, cash tip expense). Update: tips are cash expense (`5700`), not a tip pot. |
| 7. Needs-review queue + document review | done | Expense receipt review screen (`/review/receipts/[id]`) — photo left, editable lines, confirm | — |
| 8. Dashboard + reports | planned | Dashboard tiles wired to `GET .../dashboard` (**replace hardcoded KPI placeholders** on `/`); Reports card-library landing; P&L / balance sheet / cash flow / KDV input / delivery sales / period comparison read views. **Export = ONE "Download" control per report (dropdown menu of formats), NOT separate buttons:** all reports offer Excel; the three financial statements (P&L / balance sheet / cash flow) additionally offer PDF (backend from Phase 8.5 Slice 5). Shared download component, consistent everywhere. Role-gated (cashier can't see financials). |
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
- **Tip treatment — Slice A DONE (`v0.48.0`) ✓ signed off.** See **Do not rebuild**.
- **Tip treatment — original Slice B1 (`v0.49.0`) SUPERSEDED by `v0.57.0`.** Do not re-implement `card_sale_basis` / `POS_CARD_TIP` at confirm. Current model: Z match-or-review; tips expense-only.
- **Tip treatment — Slice B2 DONE (`v0.50.0`) ✓ signed off.** Commission sweep done; **H1** in-transit guard done (`v0.58.0`).
- **Tip treatment — Slice C DONE (`v0.51.0`) ✓ signed off;** folded into Phase 8.7.
- **Phase 8.7 + Phase 9 core DONE (`v0.52.0`–`v0.56.0`) ✓ signed off.** Frontend gaps → Phase 9 Slice 2d + 8.
- **Z match-or-review DONE (`v0.57.0`) ✓ signed off.** Ops copy + integration test → Phase 8.8 H4 **done** (`v0.58.3`).
- **Bank deposit exceeds card sale (no Z entered):** still rejected at settlement (`test_inferred_commission_rejects_net_exceeding_batch_gross`). With Z tracking off, owner records deposits manually; with Z on, mismatch routes to Needs Review — not auto-resolved.

---

## Slice log (recent completions)

| Date | Slice | Commit/tag | Summary |
|------|-------|------------|---------|
| 2026-06-24 | Phase 8.8 H5 — docs dedup | `v0.58.4-phase8.8-complete` | B1 superseded banner; canonical Z in v0.57.0 entry; Phase 6 tips row superseded; Phase 8.8 complete |
| 2026-06-24 | Phase 8.8 H4 — card-tip day ops guidance | `v0.58.3-phase8.8-h4-z-ops-guidance` | Z mismatch review copy; Decisions §9 operator note; integration test; 543 pytest |
| 2026-06-24 | Phase 8.8 H3 — expense receipt test gaps | `v0.58.2-phase8.8-h3-expense-receipt-guards` | Line-sum mismatch confirm blocked (existing guard); cross-entity read/confirm + RLS isolation; 4 tests; 542 pytest |
| 2026-06-24 | Phase 8.8 H2 — tips expense cash-only at API | `v0.58.1-phase8.8-h2-tips-cash-only` | `post_expense_entry` rejects `5700` from bank; `InvalidExpensePostingError` → 422; 2 tests; 538 pytest |
| 2026-06-24 | Phase 8.8 H1 — commission sweep timing guard | `v0.58.0-phase8.8-h1-commission-sweep-guard` | `clear-commission` rejects undeposited card sales (`in_transit > 0`, no settlements); `InTransitCardSalesError` → 422; 2 tests; 536 pytest |
| 2026-06-24 | Z match-or-review (supersedes B1 tip basis) | `v0.57.0-pos-z-match-or-review` | No POS tip posting; Z == system card → post; tips expense-only; P&L/BS test; 534 pytest |
| 2026-06-24 | Phase 9 — read-back lists + Clerk | `v0.56.0-phase9-readback-clerk` | `/expenses` + `/sales` list pages; `@clerk/nextjs` auth; entity switcher; `GET /users/me`; 534 pytest |
| 2026-06-24 | Phase 8.7 + Phase 9 New menu | `v0.55.0-phase9-new-menu` | Multi-line receipt OCR, manual sales API, New dropdown, receipt review; tags `v0.52.0`–`v0.55.0`; 533 pytest |
| 2026-06-24 | Tips Slice B2 — card commission total clearance | `v0.50.0-pos-commission-total-clearance-slice-b2` | One-button `1400` residual → `5300` sweep; `POS_COMMISSION_SWEEP`; no migration; 511 pytest |
| 2026-06-24 | Tips Slice B1 — card tips via Z report | `v0.49.0-pos-card-tips-z-report-slice-b1` | **Superseded by `v0.57.0`** — was `card_sale_basis` + `POS_CARD_TIP`; do not restore |
| 2026-06-23 | Tips Slice A — tips are an expense | `v0.48.0-tips-expense-slice-a` | Retire `2260`/tips subsystem; gross sales; `5700 Tips Expense`; migration `045`; 497 pytest |
| 2026-06-23 | Period locks review fixes | `v0.47.12` | IMMUTABLE_AUDIT_TABLES registry; append-only audit triggers; period_locks no-delete; split correction tests; 483 pytest |
| 2026-06-23 | PDF export review fixes | `v0.47.11` | Lazy reportlab; bundled DejaVu fonts; ₺/Turkish glyph tests; fresh-install CI guard; 473 pytest |
| 2026-06-23 | PDF export — financial statements | `v0.47.10-phase8.5-pdf-export` | reportlab PDF for P&L/balance sheet/cash flow; `format_try` at render edge; `GET .../export/pdf`; 469 pytest |
| 2026-06-23 | Flexible dates + soft period locks | `v0.47.9-phase8.5-period-locks` | Go-live floor; soft day/month locks; owner unlock + audit; dirty flag; posting boundary guard; 464 pytest |
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
