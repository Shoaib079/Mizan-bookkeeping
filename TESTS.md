# TESTS

Test register: what is tested, why it matters, pass/fail status (see CURSOR_RULES.md §8).

| Test file | What it guards | Status |
|-----------|----------------|--------|
| `backend/tests/test_health.py` | API liveness for deploy/dev | pass |
| `backend/tests/test_money.py` | Integer kuruş, Turkish format, loose parse (Decisions §5) | pass |
| `backend/tests/test_entity_isolation.py` | Cross-entity isolation — RLS + entity_context | pass |
| `backend/tests/test_default_chart.py` | Default chart includes Opening Balance Equity; no inventory | pass |
| `backend/tests/test_opening_balances.py` | OB validation — equity offset, aggregate codes, money_account_id + supplier_id lines, reject aggregate 1100/1000/2100 when sub-accounts exist, validate API | pass |
| `backend/tests/test_opening_balances_post.py` | OB posting — GL + supplier subledger atomicity, AP control = subledger sum, bank GL debited, credit card GL credited, double post 409, entity isolation, post API E2E | pass |
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
| `backend/tests/test_banking_accounts.py` | Bank/cash account tree — GL sub-accounts, codes, balances, rollup, RLS isolation, API CRUD + tree (incl. credit_cards branch), supplier payment to sub-account | pass |
| `backend/tests/test_credit_card_accounts.py` | Credit card clearing accounts — GL sub-accounts under 2100, LIABILITY/CREDIT, tree branch + balance rollup, OB credit side, reject aggregate 2100, cross-entity isolation, API E2E | pass |
| `backend/tests/test_bank_statement_import.py` | Bank statement CSV import + classify — lines stored, duplicate fingerprint 409, supplier payment GL post, link existing payment (no double journal), near-match → needs_review, confirm link, re-classify rejected, unknown no GL, cross-entity isolation, API E2E | pass |
| `backend/tests/test_statement_event_posting.py` | Bank fee GL Dr 5300 / Cr bank; credit card payment Dr CC payable / Cr bank (reduces liability, no expense lines); statement classify + manual post; inflow/wrong account rejected; control balances tie; API E2E | pass |
| `backend/tests/test_banking_near_match.py` | Near-match date window helpers (±3 days, excludes exact date) | pass |
| `backend/tests/test_account_transfers.py` | Own-account transfers — manual GL Dr/Cr asset only, statement outflow post, inflow link-or-post (single journal), same-from/to rejected, cross-entity rejected, re-classify rejected, RLS isolation, API E2E | pass |
| `backend/tests/test_pos_settlement.py` | POS settlement intake — manual GL Dr bank / Cr 1400, clearing credit reduces debit balance, statement inflow classify posts GL, zero/negative rejected, cross-entity isolation, outflow classify rejected, API E2E | pass |
| `backend/tests/test_card_sales_reconciliation.py` | Card sales batches Dr 1400 / Cr 4000; settlement with explicit/inferred commission zeros clearing; reconciliation in-transit after sale; net-only settlement unchanged; gross < net rejected; cross-entity isolation; API E2E | pass |
| `backend/tests/test_cash_drawer.py` | Cash drawer — in/out GL on cash sub-account, EOD close over/short to 5400, exact close no journal, closed day blocks movements, bank account rejected, cross-entity isolation, API E2E | pass |
| `backend/tests/test_fx_purchase.py` | FX purchase — GL Dr FX / Cr TRY cash, control account (subledger try_cost = GL, native quantity balance), validation (cash-only payment, FX wallet required), tree foreign_currency branch, cross-entity + RLS isolation, API E2E | pass |
| `backend/tests/test_fx_spend.py` | FX conversion Dr bank/cash / Cr FX at average cost + realized gain 4200 or loss 5600; direct expense spend at average cost (no gain/loss); quantity + try_cost reduce; control accounts tie; insufficient balance rejected; API E2E | pass |
| `backend/tests/test_staff.py` | Staff — TRY accrual Dr 5100/Cr 2250, advance Dr 1300 (no expense), payment clears payable + advance offset (no second 5100), FX accrual subledger-only, FX payment expense at try_cost + wallet spend, cross-entity + RLS isolation, API E2E | pass |
| `backend/tests/test_partners.py` | Partner reimbursements — expense fronted Dr expense/Cr 2150, reimbursement Dr 2150 (no expense), control account = subledger sum, overpayment rejected, immutability, cross-entity + RLS isolation, API E2E | pass |
| `backend/tests/test_receivables.py` | Customer receivables — credit sale Dr AR/Cr revenue, payment no revenue, control account = subledger, overpayment rejected, per-customer OB, bank `customer_payment` classify, immutability, API E2E | pass |
| `backend/tests/test_pos_daily_summary.py` | POS daily-summary intake — OCR extract, upload draft, math mismatch → needs_review + confirm blocked, valid confirm posts card batch + cash in (no total line), duplicate fingerprint 409, duplicate-day upload → needs_review, confirm/post rejected when date already posted (service + API), DB partial unique index on posted rows, cross-entity isolation, corrected confirm, reject, API E2E | pass |
| `backend/tests/test_delivery_platforms.py` | User-managed delivery platforms — create allocates clearing sub under `1450`, rename/deactivate, duplicate name 409, delivery_enabled guard, API E2E | pass |
| `backend/tests/test_delivery_reports.py` | Delivery platform reports — intake draft/needs_review, post Dr clearing / Cr revenue (gross), settlement Dr bank / Cr clearing (net), reconciliation in-transit, `delivery_platform_id`, duplicate fingerprint 409, cross-entity isolation, statement classify `delivery_settlement`, API E2E | pass |
| `backend/tests/test_delivery_commission_efatura.py` | Delivery commission e-Faturas — full lifecycle report + settlement + commission invoice → clearing zero; Dr `5500` + Dr `1500` / Cr clearing (AP untouched); gross vs report `commission_kurus` mismatch → needs_review + post blocked; double commission blocked; cross-entity isolation; supplier invoice path unchanged; API E2E | pass |
| `backend/tests/test_tips.py` | Tips pass-through — card accrual Dr `1400`/Cr `2260` (no revenue/expense); cash held Dr cash/Cr `2260`; payout Dr `2260`/Cr cash (not expense); over-payout rejected; balance endpoint; API E2E | pass |
| `backend/tests/test_expenses.py` | Daily expenses — manual Dr expense/Cr bank (no AP); `has_source_document=false`; Turkish alias memory; fuzzy → needs_review (no GL); confirm posts + alias; merge items; `rent_utility` bank classify; cross-entity RLS | pass |
| `backend/tests/test_delivery_sales_report.py` | Delivery sales report — gross per platform + total from posted reports only; date range filter; draft/needs_review/rejected excluded; inactive platform with history; zero rows for platforms without reports; `delivery_enabled` + `from>to` → 422; cross-entity RLS; API E2E | pass |
| `backend/tests/test_dashboard.py` | Entity dashboard — period sales by source, expenses, net result, payables preview ordering + supplier filter, receivables, delivery in-transit clearing, needs-review counts, TRY position vs FX separate, optional expense/money account filters, `from>to` → 422, API E2E, cross-entity RLS | pass |
| `backend/tests/test_financial_statements.py` | P&L & Balance Sheet — revenue/expense/net from card/cash/delivery/expense postings, date range exclusion, voided entry excluded, opening-balance as-of balances, unclosed net income balances accounting equation, `from>to` → 422, API E2E, cross-entity RLS | pass |
| `backend/tests/test_cash_flow.py` | Cash flow statement — POS settlement inflow + supplier payment outflow, transfer net-zero exclusion, expense cash outflow, date range exclusion, `from>to` → 422, API E2E, cross-entity RLS | pass |

**Requires:** PostgreSQL (`docker compose up -d` or local Postgres). Tests auto-create `mizan` role/DBs via `postgres` admin user if needed.

**Count:** 354 pytest (last run 2026-06-22).

Run: `cd backend && PYTHONPATH=. python3 -m pytest -v`

Frontend: `cd frontend && npm run build`
