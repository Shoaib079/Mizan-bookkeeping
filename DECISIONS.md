# DECISIONS

Significant technical choices and rationale (see CURSOR_RULES.md §8). Product decisions live in Restaurant_Bookkeeping_App_Decisions.md.

## 2026-06-21 — Own-account transfer linking (Phase 3)

**Choice:** `post_account_transfer()` in `core/banking/posting.py` — single GL journal (`JournalEntrySource.TRANSFER`): debit destination money account GL sub-account, credit source (asset-to-asset only; no revenue/expense). `account_transfers` table links from/to money accounts, journal entry, and optional statement line FKs (`from_statement_line_id`, `to_statement_line_id`); `bank_statement_lines.account_transfer_id` for line lookup. Classify `transfer` on outflows: post transfer from statement account to `counterpart_money_account_id`. Inflows: match existing transfer (`to_money_account` = current, same amount/date, `to_statement_line_id` NULL, outflow already posted) → `status=linked`, no new GL; else post with counterpart as source. Manual transfers via dedicated API. Posted/linked lines cannot be re-classified.

**Why:** Decisions §12 — transfers between own accounts are one movement, not income/expense.

**API:** `POST/GET .../banking/transfers`; classify PATCH accepts `counterpart_money_account_id` when `classification=transfer`.

**Not in slice:** opening balances, multi-entity transfers, FX conversion, UI, auto-detect from description.

**Migration:** Alembic `017`.

## 2026-06-21 — Bank statement import & classify (Phase 3)

**Choice:** `bank_statements` + `bank_statement_lines` (entity RLS). CSV v1 format: `transaction_date` (YYYY-MM-DD), signed `amount_kurus` (outflows negative), `description`, optional `reference`. Parser in `adapters/bank_parsers/csv_simple.py`. Import rejects duplicate `(entity_id, file_fingerprint)` and overlapping periods for the same bank money account. Classify `supplier_payment` on outflows: first match existing `SupplierLedgerEntry` (`movement_type=payment`, same supplier, `abs(amount)`, exact date); if found → `status=linked` with FKs, no GL post; else → `post_supplier_payment()` with `payment_account_id` = money account GL sub-account and `reference_type=bank_statement_line`. `bank_fee` / `unknown` set `status=classified` only (no GL this slice). Posted/linked lines cannot be re-classified.

**Why:** Decisions §12 statement-first banking; Phase 3 constraint — never double-post supplier payments.

**API:** `POST/GET .../banking/accounts/{money_account_id}/statements`, `GET .../banking/statements/{statement_id}`, `PATCH .../statements/{id}/lines/{line_id}/classify`.

**Not in slice:** transfers, opening balances, credit card statements, PDF/OFX, auto-classify, UI.

**Migration:** Alembic `016`.

## 2026-06-21 — Bank/cash account tree (Phase 3)

**Choice:** `features/banking/` — `money_accounts` table (entity RLS) links named bank/cash accounts to auto-created GL sub-accounts under bucket `1100` (bank TRY) / `1000` (cash TRY). `accounts.parent_account_id` FK to bucket; codes auto-assigned `1101+` / `1001+`; inherit type/normal balance; `accepts_opening_balance=true`. Parent bucket balance in tree API = sum of active child GL balances (rollup helper). Aggregate `1100`/`1000` remain valid `payment_account_id` targets for backward compat.

**Why:** Decisions §12 — banking hub tree per entity; `docs/OPENING_BALANCES.md` wizard step 4 (named sub-accounts).

**API:** `POST/GET/PATCH /entities/{id}/banking/accounts`, `GET .../tree`. Create requires seeded chart (409 if not).

**Not in slice:** credit cards (`2100`), FX cash, statement import, transfers, opening balance posting, UI.

**Migration:** Alembic `015`.

## 2026-06-21 — Entity isolation via PostgreSQL RLS

**Choice:** Enforce multi-restaurant isolation at the **database** with PostgreSQL row-level security (`FORCE ROW LEVEL SECURITY`) on every entity-scoped table, plus application `entity_context()` setting `app.current_entity_id`.

**Why:** CURSOR_RULES §1 requires DB-level enforcement so no code path can leak across entities. RLS applies to ORM and raw SQL.

**Pattern for new tables:** inherit `EntityScopedMixin`, add table name to `app/db/rls.py` `RLS_TABLES`, include in Alembic migration.

## 2026-06-21 — Opening balances offset via Opening Balance Equity

**Choice:** User enters natural-side opening figures per balance-sheet account; system generates **Opening Balance Equity (`3900`)** offset so the day-one journal balances.

**Why:** Decisions §19 — running business go-live; standard accounting practice.

**Plan:** `docs/OPENING_BALANCES.md`. Posting lands in Phase 1 `core/ledger`.

## 2026-06-21 — Single posting boundary in core/ledger

**Choice:** All ledger writes go through `post_journal_entry()` in `core/ledger/posting.py`. Journal tables inherit `EntityScopedMixin`; amounts are integer kuruş; validation rejects unbalanced entries, zero lines, inactive/unknown accounts, and cross-entity account references.

**Why:** Decisions §1 / CURSOR_RULES §1 #10 — one boundary prevents bypass paths. Feature APIs delegate to core; no direct journal inserts elsewhere.

**Cross-entity account check:** RLS normally hides other entities' accounts. Posting uses transaction-local `app.posting_lookup` + `accounts_posting_lookup` SELECT policy so the boundary can detect entity mismatch without exposing accounts to normal queries.

## 2026-06-21 — Posted journal immutability + void/reverse + audit

**Choice:** Posted `journal_entries` and lines are immutable at ORM (event listeners) and PostgreSQL (BEFORE UPDATE/DELETE triggers). Corrections only via `void_journal_entry()`, which posts a balanced reversing entry linked to the original. Every post and void writes a row to `ledger_audit_events` with `actor_id`, timestamp, and optional reason.

**Why:** Decisions §1 / CURSOR_RULES §1 #3 — void → reverse → audit; no in-place edits to posted amounts. `actor_id` is a plain UUID parameter until auth lands (no over-engineered ActorContext).

**Void metadata:** Original entry `status=voided`, `reversed_by_entry_id` set; reversal `reverses_entry_id` points at original. Both entries remain visible; net ledger effect is zero.

**API:** `POST .../ledger/entries` requires `actor_id`; `POST .../ledger/entries/{entry_id}/void` with optional `reason` and `void_date`. No PATCH/DELETE on entries.

## 2026-06-21 — Ledger DB immutability bootstrap + void gate

**Choice:** Centralize PostgreSQL immutability triggers in `apply_ledger_immutability()` (bootstrap + Alembic `006`). Void metadata (`status`, `reversed_by_entry_id`, `voided_at`) updates require transaction-local `set_config('app.journal_void_update', '1', true)` — set by `journal_void_update_allowed(session)` during `void_journal_entry()`. `ledger_audit_events` is append-only at DB (no UPDATE/DELETE).

**Why:** v0.7.0 triggers existed only via Alembic; test/dev bootstrap used `create_all` without triggers, so raw SQL could bypass ORM listeners. Hardening closes that gap without new product surface.

## 2026-06-21 — Manual journals via dedicated API + entry source typing

**Choice:** Add `JournalEntrySource` on `journal_entries` (`manual`, `opening_balance`, `invoice`, `system`). Accountant adjustments use `features/manual_journals/` with `POST/GET /entities/{id}/manual-journals` (list/get/void). All posts go through `post_journal_entry(..., source=...)`. Void reversals stamp `source=system`.

**Why:** Decisions §1 — manual journals are a distinct, audited flow; source typing lets list/filter exclude automated entries (invoices, opening balances, void reversals) without ad-hoc flags.

**API migration:** Removed generic `POST .../ledger/entries` (no source typing). Kept `POST .../ledger/entries/{id}/void` for ledger-wide void; manual-journals also exposes `POST .../manual-journals/{id}/void` with enriched response (account code/name on lines).

**Immutability:** `source` is immutable after post (ORM + DB trigger). No PATCH on entries.

## 2026-06-21 — e-Fatura read into draft (no posting)

**Choice:** `features/invoices/` with `invoice_drafts` table (entity-scoped RLS). Upload via `POST .../invoices/efatura/draft` (multipart). Prefer UBL-TR XML (`extract_efatura_xml`); PDF v1 uses fixture registry for tests and optional `pypdf` text + regex heuristics for common GİB layouts. Unknown/unreadable PDFs return 422 — full vision OCR deferred.

**Why:** Decisions §7 — supplier invoices from e-Fatura; prefer XML, fall back to PDF; per-rate KDV breakdown; net + VAT = gross check. Decisions §8 — SHA256 `file_fingerprint` for duplicate detection per entity. Slice is **read into draft only** — no ledger posting, payables, or supplier master.

**Duplicate handling:** Same fingerprint + entity → HTTP 409 with `existing_draft_id`. Cross-entity: same file allowed (fingerprint scoped per entity).

**Math:** `validate_invoice_totals()` — integer kuruş, zero tolerance.

**Storage:** `adapters/storage/local.py` writes to configurable `upload_dir` (default `data/uploads/`).

## 2026-06-21 — Opening balance validate API blocks unmodeled categories

**Choice:** Whitelist aggregate codes only; refuse FX (`1010`–`1030`), partner (`2150`), and future sub-account codes with explicit **not supported yet** errors.

**Why:** Block, don't guess — especially FX as plain kuruş (Decisions §15 quantity model).

## 2026-06-21 — Supplier master per entity (Phase 2)

**Choice:** `features/suppliers/` with `suppliers` table (entity-scoped RLS). One supplier record per VKN per entity; same real-world supplier across restaurants = separate rows. VKN is 10–11 digits, immutable after create. Deactivate via `is_active=false` only — no hard delete.

**Why:** Decisions §8 — suppliers tracked per restaurant/entity; VKN from e-Fatura for matching; no heavy name-matching. Slice is **master data only** — no payables ledger, posting, or payments yet.

**API:** `POST/GET/PATCH /entities/{id}/suppliers`; `GET .../suppliers/by-vkn/{vkn}` for future draft→supplier linking. Duplicate VKN within entity → HTTP 409.

**Unique constraint:** `(entity_id, vkn)`. Cross-entity: same VKN allowed (separate books per entity).

## 2026-06-21 — Payables ledger & balance (Phase 2)

**Choice:** `core/payables/` with `supplier_ledger_entries` table (entity-scoped RLS, append-only). Single write boundary: `record_supplier_movement()`. Signed integer kuruş: positive increases payable, negative decreases. Movement types include `opening_balance`, `adjustment`, `invoice`, `payment`, `credit_note`; only `opening_balance` and `adjustment` writable via API this slice.

**Why:** Decisions §8 — ledger/balance-based payables; running supplier ledger; payables page shows all supplier balances + total; no invoice-by-invoice payment allocation. No GL posting from payables movements this slice.

**Immutability:** ORM event listeners + PostgreSQL BEFORE UPDATE/DELETE triggers (`apply_payables_immutability()`). Corrections via reversing adjustment movement (future).

**API:** `GET /entities/{id}/payables` (total + per-supplier balances); `GET .../suppliers/{id}/ledger`; `POST .../suppliers/{id}/ledger/movements` with `actor_id`, `movement_date`, `movement_type`, `amount_kurus`, `description`.

**Balance:** `current_balance_kurus(supplier_id)` = SUM(`amount_kurus`); entity total = sum across active suppliers.

## 2026-06-21 — Draft → supplier linking (Phase 2)

**Choice:** Nullable `supplier_id` FK on `invoice_drafts` → `suppliers`. On upload, auto-link when extracted VKN matches an existing supplier via `find_by_vkn`. Manual link via `POST .../link-supplier` (explicit `supplier_id` or auto by draft VKN); unlink via `POST .../unlink-supplier`.

**Why:** Decisions §8 — match e-Fatura supplier VKN to supplier master before review/posting. No ledger posting this slice.

**API:** Draft responses include `supplier_id`, `linked_supplier_name`, `linked_supplier_vkn` when linked.

## 2026-06-21 — Draft review / confirm workflow (Phase 2)

**Choice:** Extend `InvoiceDraftStatus` with `confirmed`. Confirm requires linked `supplier_id`, status `draft` or `needs_review`, and `actor_id`; stamps `confirmed_at` / `confirmed_by`. Reject sets `needs_review` with optional `review_reason`. Confirmed drafts are immutable (no relink/unlink/reject).

**Why:** Decisions §7/§8 — review gate before posting; confirmed = ready for future draft-to-ledger slice.

**API:** `POST .../confirm`, `POST .../reject`; list drafts supports `?status=`.

## 2026-06-21 — Payment reduces payable (Phase 2)

**Choice (superseded):** Initial slice used payables-only subledger movement without GL. Replaced by supplier payment GL posting slice below.

**Why:** Interim step before banking phase; GL integration now complete.

## 2026-06-21 — Supplier payment GL posting (Phase 2)

**Choice:** `core/payables/posting.py` — `post_supplier_payment()` atomically: balanced GL journal via `prepare_journal_entry(..., source=payment)` (debit AP `2000`, credit caller-selected bank/cash asset) + negative payables movement via `persist_supplier_payment_entry()` with linked `journal_entry_id`. Removed `record_supplier_payment()` from ledger boundary.

**Why:** Decisions §8/§11 — supplier payments must post to double-entry ledger and reduce payable in one transaction; AP control account must reconcile to subledger total.

**GL pattern:** Debit AP for payment amount; credit active ASSET account (`payment_account_id`). Non-asset accounts rejected.

**Subledger:** Payment stored as negative kuruş with type `payment`; `journal_entry_id` FK links to GL entry. Invoice subledger rows also require `journal_entry_id`.

**API:** `POST /entities/{id}/suppliers/{supplier_id}/payments` with `payment_date`, `amount_kurus`, `description`, `actor_id`, **`payment_account_id`** (required), optional `reference`. Returns `journal_entry_id`, `supplier_ledger_entry`, `payable_balance_kurus`.

**Overpayment policy:** Reject if `current_balance - payment < 0` (unchanged).

**Not GL-posted:** `opening_balance` and `adjustment` subledger movements remain payables-only; control-account tests use invoice post + payment path.

**Phase 3 constraint:** Bank-statement supplier payment classification reuses `post_supplier_payment()` OR links to an existing payment (match supplier/amount/date) — never posts twice.

**Migration:** Alembic `014` adds nullable `journal_entry_id` FK on `supplier_ledger_entries`.

## 2026-06-21 — Invoice draft-to-ledger posting (Phase 2)

**Choice:** `core/invoices/posting.py` — `post_confirmed_draft()` atomically: balanced GL journal via `prepare_journal_entry(..., source=invoice)` + supplier payables via `persist_supplier_invoice_entry()` (type `invoice`, positive gross kuruş). Draft status becomes `posted` with `journal_entry_id` FK — prevents re-post.

**Why:** Decisions §7/§11 — confirmed supplier invoice posts to double-entry ledger and increases payable; one transaction, one posting boundary per subsystem.

**GL pattern:** Credit AP `2000` (gross); debit caller-selected expense account (net); debit Input VAT `1500` — one line per `vat_breakdown` entry (or aggregated if breakdown empty but gross − net > 0). Integer kuruş; debits = credits validated before post.

**Chart:** Added `1500` Input VAT to default chart (`accepts_opening_balance=false`). Alembic `013` idempotently inserts `1500` for entities that already have a chart.

**API:** `POST /entities/{id}/invoices/drafts/{draft_id}/post` with `actor_id`, `expense_account_id`. Returns posted draft, journal entry summary, supplier ledger entry id, payable balance.

**Guards:** Confirmed + linked supplier only; expense account must be active EXPENSE type; already-posted rejected.

**Not in scope:** void posted invoice; auto expense categorization; bank payment GL.

**Updated:** Supplier payment GL posting slice adds bank/cash GL credit via `post_supplier_payment()` — see DECISIONS payment GL entry.

