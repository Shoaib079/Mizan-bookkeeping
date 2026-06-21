# TESTS

Test register: what is tested, why it matters, pass/fail status (see CURSOR_RULES.md §8).

| Test file | What it guards | Status |
|-----------|----------------|--------|
| `backend/tests/test_health.py` | API liveness for deploy/dev | pass |
| `backend/tests/test_money.py` | Integer kuruş, Turkish format, loose parse (Decisions §5) | pass |
| `backend/tests/test_entity_isolation.py` | Cross-entity isolation — RLS + entity_context | pass |
| `backend/tests/test_default_chart.py` | Default chart includes Opening Balance Equity; no inventory | pass |
| `backend/tests/test_opening_balances.py` | OB validation, equity offset, validate API; **blocks FX/partner/unmodeled** | pass |
| `backend/tests/test_chart_of_accounts.py` | Per-entity chart seed, RLS isolation, API | pass |
| `backend/tests/test_ledger_posting.py` | Single posting boundary — balanced/unbalanced/zero/cross-entity, immutability, void/reverse, audit, API | pass |
| `backend/tests/test_ledger_db_immutability.py` | PostgreSQL triggers block raw SQL UPDATE/DELETE on entries, lines, audit; void gate | pass |
| `backend/tests/test_manual_journals.py` | Manual journal API — source=manual, list/get filters, cross-entity isolation, void | pass |
| `backend/tests/test_efatura_draft.py` | e-Fatura upload → draft — UBL-TR XML, math validation, duplicate 409, RLS isolation, PDF fixture | pass |
| `backend/tests/test_draft_supplier_link.py` | Draft → supplier linking — VKN auto-link, manual link/unlink, cross-entity 404, unknown supplier 404 | pass |
| `backend/tests/test_draft_review.py` | Draft confirm/reject — supplier required, confirmed immutable, status filter, needs_review flow | pass |
| `backend/tests/test_suppliers.py` | Supplier master — VKN uniqueness per entity, CRUD, deactivate, cross-entity isolation, API | pass |
| `backend/tests/test_payables.py` | Payables ledger — balance, opening balance, payments reduce balance + GL link, overpayment rejected, API | pass |
| `backend/tests/test_invoice_posting.py` | Draft-to-ledger — GL + payables posting, `journal_entry_id` on subledger, VAT lines, reject guards, cross-entity, API E2E | pass |
| `backend/tests/test_supplier_payment_gl.py` | Supplier payment GL — AP control account = subledger, bank credited, `journal_entry_id` link, non-asset rejected, API E2E | pass |
| `backend/tests/test_banking_accounts.py` | Bank/cash account tree — GL sub-accounts, codes, balances, rollup, RLS isolation, API CRUD + tree, supplier payment to sub-account | pass |
| `backend/tests/test_bank_statement_import.py` | Bank statement CSV import + classify — lines stored, duplicate fingerprint 409, supplier payment GL post, link existing payment (no double journal), re-classify rejected, bank fee no GL, cross-entity isolation, API E2E | pass |
| `backend/tests/test_account_transfers.py` | Own-account transfers — manual GL Dr/Cr asset only, statement outflow post, inflow link-or-post (single journal), same-from/to rejected, cross-entity rejected, re-classify rejected, RLS isolation, API E2E | pass |

**Requires:** PostgreSQL (`docker compose up -d` or local Postgres). Tests auto-create `mizan` role/DBs via `postgres` admin user if needed.

Run: `cd backend && PYTHONPATH=. python3 -m pytest -v`

Frontend: `cd frontend && npm run build`
