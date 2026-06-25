# ROADMAP — Restaurant Bookkeeping App

**Build progress tracker.** Mirrors Decisions §27. Update after every slice — mandatory before marking work complete (see `CURSOR_RULES.md` §2).

**Rule:** Nothing advances to the next slice until the current slice passes the completion gate (characterized → audited → tested → fixed → API verified → self-audited → ROADMAP updated → commit/tag) and the owner signs off.

---

## Current status

**Crash / new session:** read this file + `PROGRESS.md`, then run the Recovery Protocol in `CURSOR_RULES.md` §5 before changing code. Git wins if docs disagree — then fix the docs.

| Field | Value |
|-------|-------|
| **Active phase** | Phase 10 — pre-launch UX & FX wiring |
| **Active slice** | **10.3** — Shell feedback (verify palette/Esc/skeletons; toasts on all saves) |
| **Last completed slice** | Phase 10 Slice 2 — Delivery nav nesting (`v0.66.1`) |
| **Last commit/tag** | `v0.66.1-delivery-nav` |
| **Next up** | Phase 10.2 → 10.8 (strict order; full `DESIGN_SYSTEM.md` §10 + FX; see below) |

**The whole journey:** Phases 0–9 = backend + frontend v1 (DONE, `v0.65.0`). **Phase 10** = pre-launch: complete **all** locked `DESIGN_SYSTEM.md` §10 interaction UX + delivery nav + FX wiring — **build before go-live**. **Phase 11** = deployment & go-live. **Phase 12** = post-launch parking lot. Build strictly in order, one slice at a time, never skipping the completion gate or the golden rules below.

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
| **2d. Money-entry UX gaps (adversarial follow-up)** | done | Z field when `card_tips_z_report_enabled`; `needs_review` on manual sales stays open with `review_reason`; manual expense picks 5200/5700; double-submit on both forms. Maps to Phase 8.8 H4. |
| 3. Suppliers & payables | done | Supplier master CRUD; e-Fatura upload → link supplier → confirm → post; record payment; supplier ledger + `/payables` summary. Wired to existing Phase 2 APIs — no new backend logic. | `v0.59.0-phase9-suppliers-payables` |
| 4. Banking & cash | done | Account tree + balances; statement upload → classify → Needs Review; transfers; cash drawer (open / movements / EOD close with over-short); FX wallets (purchase / convert / spend). Wired to existing Phase 3–5 APIs — no new backend logic. | `v0.60.0-phase9-banking-cash` |
| 5. POS & delivery sales | done | POS daily-summary photo upload → review/confirm (`/sales/[id]`); card-sales batches + POS settlements + clearing reconciliation + commission clearance (`/cards`); delivery platforms CRUD, reports, settlements, per-platform reconciliation (`/delivery/*`); commission e-Fatura via extended invoice review (link posted report → post to clearing). Wired to existing Phase 6 POS/delivery APIs — no new backend logic. | `v0.61.0-phase9-pos-delivery-sales` |
| 6. Staff, partners, receivables, tips | done | `/staff`, `/partners`, `/customers`, `/receivables`; subledger actions (accrual/advance/payment, expense fronted/reimbursement, credit sale/payment); cash tips via New → Cash tip + Expenses button (`5700` only — no tip pot). Wired to Phase 5 APIs — no new backend logic. | `v0.62.0-phase9-staff-partners-receivables` |
| 7. Needs-review queue + document review | done | Expense receipt review screen (`/review/receipts/[id]`) — photo left, editable lines, confirm | — |
| 8. Dashboard + reports | done | Dashboard `/` wired to `GET .../dashboard` (date range, live KPIs); Reports landing `/reports` card library; read views P&L, balance sheet, cash flow, KDV input, delivery sales, period comparison with query params; shared `ReportDownloadMenu` (Excel all, PDF on financial statements) via authenticated blob download; 403 friendly message for cashier role. | `v0.63.0-phase9-dashboard-reports` |
| 9. Settings & onboarding | done | `/settings` hub; `/settings/opening-balances` wizard (validate → preview → post); `/settings/members` (CRUD roles, 403 message); `/settings/entity` (create restaurant, seed chart, feature toggles); link to `/delivery/platforms`; informational backup panel (no status API). Wired to existing Phase 0/8 onboarding + auth APIs — no new backend logic. | `v0.64.0-phase9-settings-onboarding` |
| 10. Theme refinement + UX polish | done | Refined token file (`globals.css`); custom toast system on form saves; `TableSkeleton`/`EmptyState` on `useEntityList` pages; Cmd/Ctrl-K command palette; Dialog Esc/focus trap; token focus rings; sticky table headers. No new backend logic. | `v0.65.0-phase9-theme-ux-polish` |

**Phase 9 complete** — all slices done, tested, committed (`v0.65.0`). **Owner sign-off pending** → frontend v1 complete.

**Known gap (code audit 2026-06-24):** `DESIGN_SYSTEM.md` §10 is only **partly** shipped (Phase 9 Slice 10: toasts, palette, dialog Esc/focus trap, skeletons). **Missing:** shared date picker, combobox pickers, systematic autofocus, inline validation, autosave/discard confirm, toasts on all forms. Delivery nav duplicates in `app-routes.ts`. FX buy: UI lists cash+bank; backend **cash only**, no `cash_movements`. See **Phase 10 audit** below.

---

## Phase 10 — Pre-launch UX (`DESIGN_SYSTEM.md` §10) & FX wiring (owner 2026-06-24)

**Status: PLANNED** — build **before Phase 11 (go-live)**, strict order **10.1 → 10.8**. Do not start Phase 11 deployment until **10.8** passes the completion gate (10.1–10.7 frontend UX; **10.8** money-critical + owner sign-off).

### Code audit (do not trust ROADMAP/tests alone — verified in repo)

| Area | ROADMAP / tests say | **Actual code (audit)** | Phase 10 action |
|------|---------------------|-------------------------|-----------------|
| **Date typing** | — | `parseTrDate` / `formatTrDate` in `frontend/src/lib/money.ts` ✓ | **Keep** — `DateInput` wraps these |
| Date picker component | DESIGN_SYSTEM §5 + §10 | **`DateInput`** + `lib/dates.ts` in `v0.66.0` | **Done** in 10.1 |
| **Date fields** | “~20 forms” | **22 files** migrated to `DateInput` | **Done** in 10.1 |
| **Report date range** | Dashboard + reports wired | `ReportDateRange` / `ReportAsOfDate` use `DateInput` | **Done** in 10.1 |
| **Balance sheet as-of** | — | `report-as-of-date.tsx` uses `DateInput` | **Done** in 10.1 |
| **Review screens** | Listed 4 review UIs | Only **`pos-summary-review.tsx`** has an **editable** date field; `receipt-review`, `invoice-draft-review`, `delivery-report-review` show dates as **read-only text** only | **Do not** add date pickers there unless product asks |
| **Phase 9 Slice 10** | “UX polish” done | Toasts, command palette, dialog Esc/focus, skeletons, tokens ✓ — **date picker not included** | 10.1 completes §10 date slice of Slice 10 |
| **Delivery nav** | Slice 5 built `/delivery/*` | Nested under **Delivery** in sidebar (`nestedUnder` + children) | **Done** in 10.2 |
| **FX form UI** | Banking slice wired | `fx-purchase-form.tsx` loads **cash + bank** ✓ | **Label only** in 10.8 (already lists both) |
| **FX backend** | Phase 5 FX purchase done | `post_fx_purchase()` → `_validate_try_cash_money_account` **CASH only**; `test_rejects_bank_as_try_payment_account` expects reject | **Extend** to BANK in **10.8** |
| **FX cash subledger** | — | **No** `CashMovement` on FX purchase (GL `Dr` FX / `Cr` cash GL only); drawer page won’t list FX buys | **Add** OUT movement when source is cash in **10.8** |
| **FX conversion** | — | `fx-conversion-form.tsx` already loads cash+bank for TRY receive; `spend_posting` allows CASH\|BANK | **Out of scope** 10.8 unless audit finds gap |
| **Cmd/Ctrl-K palette** | §10 | `command-palette.tsx` in `app-shell.tsx` ✓ | **Verify** in 10.3; fix gaps only |
| **Dialog Esc + focus trap** | Phase 9 Slice 10 | `dialog.tsx`: Esc closes, Tab trap, auto-focus first input on open ✓ | **Verify** in 10.3 |
| **Skeletons / empty states** | Phase 9 Slice 10 | `PageSkeleton`, `TableSkeleton`, `EmptyState` on list pages ✓ | **Verify** in 10.3 |
| **Toasts on save** | §10 | `useToast` on **~9** forms/pages only (expense, sales, entity, OB, CRUD masters) — **~22** POST forms without toast | **Extend** in 10.3 |
| **Enter submits form** | §10 | All **31** `components/forms/*` use `<form onSubmit>` + `type="submit"` ✓ | **Audit** in 10.4; fix any outliers |
| **First-field autofocus** | §10 | **No** `autoFocus` props; `Dialog` focuses first field when dialog opens ✓; Clerk `/sign-in` is third-party | **Extend** in 10.4 for app-owned full pages (e.g. OB wizard step open) |
| **Combobox / type-to-filter** | §10 | **No** `Combobox` component; **~20** forms use plain `<Select>` for long lists (supplier, account, GL, etc.) | **Build** in 10.5 |
| **Inline validation** | §10 | Submit-time errors only; `manual-daily-sales-form` shows running total label but no live mismatch styling | **Build** in 10.6 |
| **Autosave / discard confirm** | §10 | **No** draft persistence; dialog backdrop/Esc closes without unsaved warning | **Build** in 10.7 |

**Already implemented — do NOT redo in Phase 10:**

- Phases 0–9 backend + frontend v1 (`v0.65.0`); Phase 8.7/8.8; Z match-or-review (`v0.57.0`); tips expense-only; expense receipt OCR; manual daily sales; POS/delivery/banking UIs.
- `ReportDateRange` / dashboard / reports **API wiring** (only upgrade inputs to `DateInput`).
- `fx-purchase-form` **account fetch** (cash+bank) — fix backend + labels, don’t rebuild form from scratch.
- `/delivery` hub + child **pages** — only **sidebar IA** changes in 10.2.
- `Dialog` Esc/focus-trap/first-field focus — **verify** in 10.3, don’t rewrite unless broken.
- `CommandPalette`, skeletons, empty states — **verify** in 10.3.
- All forms already use `onSubmit` — **audit** in 10.4, don’t rebuild form structure.

### Owner decisions (locked)

| Topic | Decision |
|-------|----------|
| **Dates** | Typable `DD.MM.YYYY` + **small calendar** from icon in field — **no toggle/mode** (`DESIGN_SYSTEM.md` §10). |
| **FX buy USD/EUR** | **Cash drawer + bank** (`CASH` + `BANK`). **Not** credit card. Cash path → drawer movement + GL. |
| **Delivery nav** | **Confirmed:** nest platforms / reports / settlements under **Delivery**. |

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
  → 10.8 FX purchase (cash + bank)   ← money-critical; last before go-live
```

10.1 and 10.2 may share one commit if both gates pass. **10.8 = separate commit/tag** (money-critical). Slices 10.3–10.7 may batch where gates pass, but **order is fixed** — don’t start 10.5 before 10.4 audit documents Enter/focus baseline.

---

### Slice 10.1 — Shared `DateInput` (`DESIGN_SYSTEM.md` §10)

| | |
|---|---|
| **Status** | done |
| **Implements** | §10: type `DD.MM.YYYY` **or** pick from calendar; sensible default; Enter confirms; Esc closes popover |
| **Owner** | **Small calendar is enough** — compact single-month popover |
| **Tag** | `v0.66.0-date-picker` |

**What §10 requires (checklist when done):**

- [x] One shared `frontend/src/components/ui/date-input.tsx` (+ minimal popover; token-styled).
- [x] Field always **typable**; trailing **calendar icon inside** input opens **small** month grid — **not** a separate mode toggle.
- [x] Pick day → updates display string; invalid typed date → existing submit-time errors unchanged.
- [x] Default today on new forms; pre-fill document date on `pos-summary-review` when summary loads.
- [x] Arrow keys change day **while popover open**.
- [x] `parseTrDate` / `formatTrDate` remain the API boundary — no backend date format changes.

**Replace raw date inputs (grep-verified file list):**

| File | Notes |
|------|--------|
| `components/forms/manual-expense-form.tsx` | |
| `components/forms/manual-daily-sales-form.tsx` | |
| `components/forms/cash-movement-form.tsx` | |
| `components/forms/transfer-form.tsx` | |
| `components/forms/card-sales-form.tsx` | |
| `components/forms/pos-settlement-form.tsx` | |
| `components/forms/supplier-payment-form.tsx` | |
| `components/forms/customer-payment-form.tsx` | |
| `components/forms/customer-credit-sale-form.tsx` | |
| `components/forms/partner-reimbursement-form.tsx` | |
| `components/forms/partner-expense-fronted-form.tsx` | |
| `components/forms/staff-accrual-form.tsx` | |
| `components/forms/staff-cash-movement-form.tsx` | |
| `components/forms/delivery-report-form.tsx` | |
| `components/forms/delivery-settlement-form.tsx` | |
| `components/forms/fx-purchase-form.tsx` | |
| `components/forms/fx-conversion-form.tsx` | |
| `components/forms/fx-expense-spend-form.tsx` | |
| `components/pos-summary-review.tsx` | editable confirm date |
| `components/reports/report-date-range.tsx` | two fields |
| `components/reports/report-as-of-date.tsx` | |
| `app/settings/opening-balances/page.tsx` | go-live date |

**Manual verify (required — not only `npm run build`):** open manual expense, dashboard range, opening balances, POS review confirm — type date, pick from calendar, submit.

**Out of scope:** time-of-day; `receipt-review` / invoice / delivery review read-only dates.

---

### Slice 10.2 — Delivery nav nested under Delivery (**owner confirmed**)

| | |
|---|---|
| **Status** | planned |
| **Implements** | `DESIGN_SYSTEM.md` §6 grouped nav |
| **Suggested tag** | `v0.66.1-delivery-nav` |

**Acceptance:** One Delivery group in sidebar: hub + Platforms + Reports + Settlements; remove flat duplicates (lines 51–53 in `app-routes.ts`); parent active on `/delivery/*`; command palette unchanged.

**Audit before:** `app-routes.ts`, `app-shell.tsx` — **no** nested nav exists today.

**Out of scope:** hide when `delivery_enabled` off; nest Banking transfers/cash (same pattern, not requested).

---

### Slice 10.3 — Shell feedback completion (`DESIGN_SYSTEM.md` §10 — partial items)

| | |
|---|---|
| **Status** | planned |
| **Implements** | §10 instant feedback: toasts, loading/skeletons; verify keyboard shell behaviors |
| **Suggested tag** | `v0.66.2-shell-feedback` |

**Already shipped (verify, don’t rebuild):**

| Item | Location | Gate |
|------|----------|------|
| Cmd/Ctrl-K command palette | `command-palette.tsx`, `app-shell.tsx` | Opens from anywhere; indexes routes |
| Esc closes dialog | `components/ui/dialog.tsx` | Manual on 3 dialogs |
| Skeletons on list pages | `PageSkeleton` / `TableSkeleton` | Spot-check expenses, sales, banking |
| Empty states | `EmptyState` | Spot-check one list page |

**Build / extend:**

- [ ] **`useToast` on every successful POST** — audit all `components/forms/*` + review confirm flows (`pos-summary-review`, `receipt-review`, `invoice-draft-review`, `delivery-report-review`, `statement-line-classify`). Today only ~9 call sites; **all** money/master/upload saves get a plain-language toast (e.g. “Expense saved”).
- [ ] **Consistent error display** — failed POST still uses inline `setError` (no toast spam on validation errors).

**Manual verify:** save manual expense → toast; open list → skeleton then rows; Cmd+K → navigate; Esc closes New → form dialog.

**Do not redo:** toast provider, command palette implementation, skeleton components.

---

### Slice 10.4 — Focus + Enter-submit audit (`DESIGN_SYSTEM.md` §10)

| | |
|---|---|
| **Status** | planned |
| **Implements** | §10 keyboard-first: Enter submits; first field focused; sensible Tab order |
| **Suggested tag** | `v0.66.3-focus-enter` |

**Audit baseline (code):** all 31 `components/forms/*` already use `<form onSubmit>` + submit button — **Enter should work** in dialogs. `Dialog` auto-focuses first `input|select|textarea` on open.

**Acceptance:**

- [ ] Documented audit checklist: every dialog form + full-page forms (`opening-balances`, settings entity) — Enter submits without clicking Save.
- [ ] **First field focused** when app-owned surface opens: all `Dialog` forms (rely on existing `dialog.tsx` focus); **opening-balances wizard** first field on each step; review panels with editable fields focus first editable on load where practical.
- [ ] Tab order follows visual order (fix any `tabIndex` hacks or focus traps blocking Tab).
- [ ] **Out of scope:** Clerk `SignIn` / `SignUp` focus (third-party widget).

**Manual verify:** open manual expense dialog → type immediately; Enter saves; Tab through fields in order.

---

### Slice 10.5 — Shared `Combobox` (type-to-filter pickers)

| | |
|---|---|
| **Status** | planned |
| **Implements** | §10 “type-to-filter in every picker (combobox): type Met → Metro” |
| **Suggested tag** | `v0.66.4-combobox` |

**Problem today:** long `<Select>` dropdowns (~20 forms) — supplier, customer, partner, employee, money account, GL/expense account, delivery platform, card terminal, etc. No filter-as-you-type.

**Acceptance:**

- [ ] Shared `frontend/src/components/ui/combobox.tsx` (or `account-combobox`, `entity-combobox` wrappers) — token-styled; keyboard: type filter, ↑↓, Enter select, Esc close.
- [ ] Migrate **every** picker with **>8 options** or dynamic lists (grep `<Select` in `components/forms/` + review screens with account pickers).
- [ ] Short static enums (e.g. Dr/Cr, movement direction) may stay `<Select>`.

**Manual verify:** supplier payment → type vendor name fragment → list filters → Enter selects.

**Do not redo:** underlying option fetch APIs; only replace UI control.

---

### Slice 10.6 — Inline validation (`DESIGN_SYSTEM.md` §10)

| | |
|---|---|
| **Status** | planned |
| **Implements** | §10 “inline validation as you go … plain language — not a wall of errors after submit” |
| **Suggested tag** | `v0.66.5-inline-validation` |

**Priority surfaces (money-critical UX):**

| Form / screen | Rule (examples) |
|---------------|-----------------|
| `manual-daily-sales-form` | Live total; warn if cash + card = 0 before submit |
| `pos-summary-review` | Same cash/card totals; Z vs card when Z enabled (display mismatch hint) |
| `delivery-report-form` | Commission vs net consistency hint (already shows amounts) |
| `opening-balances/page.tsx` | Line balance / required account before validate step |
| `transfer-form`, `cash-movement-form` | Amount > 0; from ≠ to |
| Payment forms | Amount ≤ outstanding where API exposes balance (optional nice-to-have) |

**Acceptance:**

- [ ] Shared pattern: field-level or summary `text-destructive` / `text-muted-foreground` hints **while editing**, not only `setError` on submit.
- [ ] Plain Turkish/English copy per `DESIGN_SYSTEM.md` tone.
- [ ] Submit still blocked when invalid (existing server validation unchanged).

**Manual verify:** manual daily sales — clear cash+card hint without clicking Save.

---

### Slice 10.7 — Autosave + discard confirm (`DESIGN_SYSTEM.md` §10)

| | |
|---|---|
| **Status** | planned |
| **Implements** | §10 “don’t lose my work: drafts autosave; confirm before discarding unsaved changes” |
| **Suggested tag** | `v0.66.6-draft-safety` |

**Problem today:** closing dialog (Esc, backdrop, Cancel) drops in-progress form state with no warning.

**Acceptance:**

- [ ] **`useUnsavedChanges` or `Dialog` `dirty` prop** — when form state differs from initial, Esc / backdrop / Cancel prompts “Discard unsaved changes?” (confirm/cancel).
- [ ] **Autosave drafts** (localStorage, entity-scoped keys) for:
  - `manual-expense-form` (multi-line),
  - `opening-balances` wizard lines,
  - `receipt-review` line edits (in-progress only),
  - any other multi-field dialog flagged in audit.
- [ ] Restore draft on reopen (“Resume draft?” optional one-time prompt).
- [ ] Successful POST clears draft key.

**Out of scope:** server-side draft API; sync across devices.

**Manual verify:** start expense, add line, Esc → confirm dialog; reopen → draft restored.

---

### Slice 10.8 — FX purchase: cash drawer **or** bank (full wiring)

| | |
|---|---|
| **Status** | planned |
| **Money-critical** | Yes — owner sign-off |
| **Suggested tag** | `v0.67.0-fx-purchase-cash-and-bank` |

**Audit gap (today):**

| Layer | Now | Target |
|-------|-----|--------|
| UI | Cash+bank in dropdown | Clear labels; **no** `CREDIT_CARD` |
| Backend | `test_rejects_bank_as_try_payment_account` | Accept `BANK`; still reject card/FX wallet |
| GL | `Dr` FX / `Cr` cash GL | `Cr` payer GL (cash or bank) |
| Cash drawer | No movement row | `CashMovement` OUT when payer is `CASH` (same `journal_entry_id`) |
| Corrections | FX subledger only | Cash movement void/amend when cash-sourced |

**Tests:** update/replace bank-reject test; add bank purchase + cash movement tests; **manual:** buy from drawer → see line on `/banking/cash`; buy from bank → FX up, bank GL down, no drawer line.

**Do not rebuild:** `post_fx_conversion`, `post_fx_expense_spend`, FX quantity model.

---

### Phase 10 complete when

| Slice | Gate |
|-------|------|
| 10.1 | All checklist files use `DateInput`; manual date verify on 4 screens; build green | **done** (`v0.66.0`) |
| 10.2 | Nested Delivery nav; duplicates removed |
| 10.3 | Toasts on all POST saves; palette/Esc/skeletons verified |
| 10.4 | Enter-submit + focus audit passed; OB wizard + dialogs checked |
| 10.5 | Combobox on long pickers; manual type-to-filter verify |
| 10.6 | Inline hints on priority money forms |
| 10.7 | Discard confirm on dirty dialogs; autosave on listed forms |
| 10.8 | Bank path works; cash path + movement; full `pytest`; **owner sign-off** |

Then proceed to **Phase 11 — Deployment & go-live**.

---

## Phase 11 — Deployment & go-live

Take the tested app to a real, secure production environment and put real data in it.

| Slice | Status | Notes |
|-------|--------|-------|
| 1. Hosting & infrastructure | planned | Provision managed Postgres + Redis + app host + object storage (uploads & backups); set all secrets/env vars; HTTPS/SSL + domain. |
| 2. Production provisioning | planned | Stand up the DB via the canonical `alembic upgrade head`; confirm RLS + immutability triggers present on the prod-equivalent DB; Clerk **production** keys + JWT template emitting `email`/`email_verified`; `AUTH_ENFORCEMENT=true`, `CLERK_TEST_MODE` off (boot guard verified). |
| 3. Backups live | planned | Scheduled backups running to off-site storage; run a real restore-verify in production and confirm the books tie; alert on backup failure. |
| 4. Observability | planned | Error tracking, structured logging, uptime/health checks, basic rate limiting. |
| 5. Pre-launch security pass | planned | Tighten `create_entity` (auth required); dependency scan (no high/critical CVEs); secrets audit; full suite green under production settings; final guard-test run. |
| 6. Owner onboarding & smoke test | planned | Create the real restaurant(s), seed chart, enter opening balances, invite users with roles; run the end-to-end smoke test in production; **go live.** |

**Phase 11 complete when:** app is live, backed up, monitored, and the owner has recorded real data successfully.

---

## Phase 12 — Post-launch enhancements (parking lot)

**Note:** Phase **10** slices (10.1–10.8) are **pre-launch** (`DESIGN_SYSTEM.md` §10 + FX). This section is **after** go-live. Promote to Decisions before building.

- **§10 interaction UX (dates, combobox, validation, drafts, toasts, focus)** — **→ Phase 10** (pre-launch; slices 10.1–10.7).
- **Delivery sidebar nesting** — **→ Phase 10.2** (owner confirmed).
- **FX purchase cash + bank** — **→ Phase 10.8** (pre-launch).
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
| 2026-06-24 | Phase 10 Slice 1 — Shared DateInput | `v0.66.0-date-picker` | `DateInput` + calendar popover; 22 date fields migrated; default today on forms; build green; 545 pytest |
| 2026-06-24 | Phase 9 Slice 9 — Settings & onboarding | `v0.64.0-phase9-settings-onboarding` | Settings hub, OB wizard, members, entity create; 545 pytest |
| 2026-06-24 | Phase 9 Slice 3 — Suppliers & payables | `v0.59.0-phase9-suppliers-payables` | Supplier CRUD; e-Fatura upload/review; payables summary; record payment |
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
