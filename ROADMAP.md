# ROADMAP — Restaurant Bookkeeping App

**Build progress tracker.** Mirrors Decisions §27. Update after every slice — mandatory before marking work complete (see `CURSOR_RULES.md` §2).

**Rule:** Nothing advances to the next slice until the current slice passes the completion gate (characterized → audited → tested → fixed → API verified → ROADMAP updated → commit/tag) and the owner signs off.

---

## Current status

**Crash / new session:** read this file + `PROGRESS.md`, then run the Recovery Protocol in `CURSOR_RULES.md` §5 before changing code. Git wins if docs disagree — then fix the docs.

| Field | Value |
|-------|-------|
| **Active phase** | Phase 1 — Ledger core + supplier invoices |
| **Active slice** | Audit trail on all changes |
| **Last completed slice** | Double-entry posting service (single boundary) |
| **Last commit/tag** | (pending) / `v0.6.0-phase1-ledger-posting` |
| **Next up** | Audit trail on all changes |

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
| Audit trail on all changes | not started | |
| Void / reverse (no hard deletes) | not started | |
| Basic manual journals | not started | |
| Read e-Fatura invoice (PDF) into draft | not started | |

**Phase 1 complete when:** all slices above done, tested, committed, owner sign-off.

---

## Phase 2 — Suppliers & payables

| Slice | Status | Notes |
|-------|--------|-------|
| Supplier master (per entity) | not started | |
| Payables ledger & balance | not started | |
| Invoice → payable posting | not started | |
| Payment reduces payable | not started | |

**Phase 2 complete when:** all slices above done, tested, committed, owner sign-off.

---

## Phase 3 — Banking hub + bank statements

Account tree, import & classify, transfer linking, opening balances. **Statement-first:** flows start from uploads, not invented transactions.

| Slice | Status | Notes |
|-------|--------|-------|
| Bank/cash account tree (per entity) | not started | |
| Statement import & classify | not started | |
| Transfer linking (own-account, not income/expense) | not started | |
| Opening balances | not started | |

**Phase 3 complete when:** all slices above done, tested, committed, owner sign-off.

---

## Phase 4 — POS settlement + credit cards

| Slice | Status | Notes |
|-------|--------|-------|
| POS settlement intake | not started | |
| Credit card clearing accounts | not started | |
| Card sales → bank deposit reconciliation | not started | |

**Phase 4 complete when:** all slices above done, tested, committed, owner sign-off.

---

## Phase 5 — Cash drawer, forex, staff, partner reimbursements, receivables

| Slice | Status | Notes |
|-------|--------|-------|
| Cash drawer | not started | |
| Forex (FX holdings, conversions) | not started | |
| Staff (salary vs advance — no double-count) | not started | |
| Partner reimbursements | not started | |
| Receivables | not started | |

**Phase 5 complete when:** all slices above done, tested, committed, owner sign-off.

---

## Phase 6 — Sales intake + tips + expenses

POS daily-summary photo + delivery platform reports; commission e-Faturas via vendor pipeline; manual entry; handwritten reading as fallback.

| Slice | Status | Notes |
|-------|--------|-------|
| POS daily-summary photo intake | not started | |
| Delivery platform reports (gross / commission / net) | not started | Per-platform clearing balances |
| Commission e-Faturas (vendor pipeline) | not started | |
| Tips (pass-through, not revenue/expense) | not started | |
| Expenses + spelling tolerance | not started | |

**Phase 6 complete when:** all slices above done, tested, committed, owner sign-off.

*Note: Phase 6 may need to land with or just before Phase 4 (settlements reconcile against sales). Resequence if dependencies require — the firm rule is tested + signed off, not strict phase numbering.*

---

## Phase 7 — Dashboard, reports, Excel export, financial statements

P&L, Balance Sheet, Cash flow, per-rate KDV report, period comparison.

| Slice | Status | Notes |
|-------|--------|-------|
| Dashboard | not started | |
| P&L & Balance Sheet (per entity) | not started | |
| Cash flow statement | not started | |
| Per-rate KDV report | not started | |
| Period comparison | not started | |
| Excel export | not started | |

**Phase 7 complete when:** all slices above done, tested, committed, owner sign-off.

---

## Phase 8 — Roles & permissions, backups, security hardening, launch

| Slice | Status | Notes |
|-------|--------|-------|
| Roles & permissions | not started | |
| Backups | not started | |
| Security hardening | not started | |
| Launch readiness | not started | |

**Phase 8 complete when:** all slices above done, tested, committed, owner sign-off.

---

## Later (post-v1)

Not in current build order — track here when scoped:

- Proper KDV/tax-return module
- Per-rate VAT separation (if needed beyond Phase 7)
- FX revaluation
- Owner combined-restaurant view

---

## Slice log (recent completions)

| Date | Slice | Commit/tag | Summary |
|------|-------|------------|---------|
| 2026-06-21 | App scaffold & repo setup | `d91ccec` / `v0.1.0-phase0-scaffold` | FastAPI + Next.js monorepo, Mizan shell, money type, docker Postgres, pytest |
| 2026-06-21 | Multi-restaurant foundation | `29ce4a3` / `v0.2.0-phase0-entity-isolation` | Entity + RLS, entity_context, cross-entity isolation tests |
| 2026-06-21 | Opening-balances plan | `451c57f` / `v0.4.0-phase0-complete` | Default chart, OB validation, wizard plan, Phase 0 done |
| 2026-06-21 | Chart of accounts + entity scoping | `781b7f0` / `v0.5.0-phase1-chart-of-accounts` | Persisted accounts, seed/list API, RLS isolation |

---

*Keep this file current. If it disagrees with git or `PROGRESS.md`, git wins — then fix the docs.*
