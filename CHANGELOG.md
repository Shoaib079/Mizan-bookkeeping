# CHANGELOG

Every change in plain English, dated (see CURSOR_RULES.md §8).

## 2026-06-21

Initial planning package committed to git (docs, rules, roadmap, design system, preview).

## 2026-06-21 (build)

Phase 0 — **App scaffold & repo setup**: FastAPI backend with `core/` layout and integer kuruş money type; Next.js frontend with Mizan design tokens and app shell; PostgreSQL via docker-compose; dev guide and Cursor rules wired; 6 backend tests passing.

Phase 0 — **Multi-restaurant foundation**: `Entity` registry; `EntityScopedMixin`; PostgreSQL RLS; `entity_context()`; 6 isolation tests (12 pytest total).

Phase 0 — **Opening-balances plan**: `docs/OPENING_BALANCES.md`; default restaurant chart seed; opening balance validation + day-one journal draft; onboarding validate API; **Phase 0 complete** (21 pytest total).

Phase 1 — **Chart of accounts + entity scoping**: persisted `accounts` per entity; seed/list API; Alembic `002_accounts_rls`; RLS isolation tests (27 pytest total).

Phase 1 — **Double-entry posting service**: `journal_entries` + `journal_entry_lines`; `post_journal_entry()` single posting boundary; `POST /entities/{id}/ledger/entries`; Alembic `003_journal_rls`, `004_accounts_posting_lookup`; balanced/unbalanced/zero/cross-entity tests (37 pytest total).

Phase 1 — **Ledger immutability, void/reverse, audit trail**: posted entries immutable (ORM + DB triggers); `void_journal_entry()` posts linked reversal; `ledger_audit_events` with `actor_id`; `POST /entities/{id}/ledger/entries/{entry_id}/void`; Alembic `005_ledger_void_audit` (44 pytest total). Tag `v0.7.0-phase1-ledger-void-audit`.

Phase 1 — **Ledger DB immutability (bootstrap + void gate)**: centralized `apply_ledger_immutability()` wired into test/dev bootstrap and Alembic `006`; void metadata updates require transaction-local `app.journal_void_update` gate; `ledger_audit_events` append-only at DB; 8 raw-SQL immutability tests (52 pytest total). Tag `v0.7.1-phase1-ledger-db-immutability`.

Phase 1 — **Basic manual journals**: `JournalEntrySource` column on `journal_entries`; dedicated `manual-journals` API (create, list, get, void) with account enrichment on lines; `post_journal_entry(..., source=...)`; generic `POST .../ledger/entries` removed in favour of typed routes; 7 manual-journal tests (59 pytest total). Tag `v0.8.0-phase1-manual-journals`.

Phase 1 — **Read e-Fatura invoice into draft**: `invoice_drafts` table with entity RLS; UBL-TR XML extraction; PDF v1 (fixture registry + pypdf heuristics); SHA256 duplicate detection; math validation; multipart upload API; local file storage adapter; 11 e-Fatura tests (70 pytest total). Tag `v0.9.0-phase1-efatura-draft`. **Phase 1 complete** (pending owner sign-off).

Phase 2 — **Supplier master (per entity)**: `suppliers` table with entity RLS; unique `(entity_id, vkn)`; CRUD + VKN lookup API; deactivate-only (no hard delete); 15 supplier tests (85 pytest total). Tag `v0.10.0-phase2-supplier-master`.

Phase 2 — **Payables ledger & balance**: `supplier_ledger_entries` append-only ledger; `record_supplier_movement()` single write boundary in `core/payables/`; signed kuruş amounts; `opening_balance` + `adjustment` via API; payables summary + supplier ledger routes; RLS + DB immutability triggers; 12 payables tests (97 pytest total). Tag `v0.11.0-phase2-payables-ledger`.

Phase 2 — **Draft → supplier linking**: nullable `supplier_id` FK on `invoice_drafts`; VKN auto-link on upload; manual link/unlink API; linked supplier name/VKN in responses; 8 tests (105 pytest total). Tag `v0.12.0-phase2-draft-supplier-link`.

Phase 2 — **Draft review / confirm workflow**: `confirmed` status with `confirmed_at` / `confirmed_by`; confirm requires linked supplier; reject → `needs_review` with optional reason; confirmed drafts immutable; list filter `?status=`; 6 tests (111 pytest total). Tag `v0.13.0-phase2-draft-review`.

Phase 2 — **Payment reduces payable**: `record_supplier_payment()` writes negative payables movement; `POST .../suppliers/{id}/payments`; overpayment rejected; payables list reflects new balance; **no GL posting**; 6 tests (117 pytest total). Tag `v0.14.0-phase2-payment-reduces-payable`.

Phase 2 — **Invoice → payable posting (draft-to-ledger)**: `post_confirmed_draft()` posts balanced GL journal (`source=invoice`) and supplier payables invoice movement atomically; draft status → `posted`; default chart adds Input VAT `1500`; Alembic `013`; `POST .../invoices/drafts/{id}/post`; 10 posting tests (127 pytest total). Tag `v0.15.0-phase2-draft-to-ledger`.

Phase 2 — **Supplier payment GL posting**: `post_supplier_payment()` in `core/payables/posting.py` atomically posts GL (`source=payment`, debit AP, credit bank/cash asset) and negative payables movement; `journal_entry_id` on subledger rows; Alembic `014`; `payment_account_id` required on payments API; AP control-account reconciliation tests; overpayment guard retained; 5 GL tests + updated payables tests (132 pytest total). Tag `v0.16.0-phase2-supplier-payment-gl`. **Phase 2 complete** (pending owner sign-off).

**Phase 2 owner sign-off** (2026-06-21): Suppliers & payables phase officially complete; active work moves to Phase 3 — Banking hub + bank statements.
