# DESIGN_ARCHETYPES — one app, built by one hand

**Date:** 2026-07-14 · **Status:** the contract for every screen. `DESIGN_SYSTEM.md` defines the *paint* (colors, type, spacing tokens). This defines the **structure** — the page-level shapes every screen must compose from.

**Why this exists.** The app had 21 shared UI atoms but zero shared page shapes, so every page hand-assembled its own layout. Four entity detail pages ended up with four different arrangements of the same four ingredients (see the audit below), and `rounded-lg border border-border bg-card` was copy-pasted inline across 40+ files. That is the whole reason the app "feels like different people made it". Atoms alone don't buy consistency; **archetypes** do.

**The rule:** a page declares *what it is* — identity, position, panels, rows. It never writes layout. If a page needs a shape no archetype provides, we extend the archetype, never fork it inside the page.

---

## The evidence (2026-07-14 audit)

| | Edit button | Balance figure | Breakdown | Actions |
|---|---|---|---|---|
| Staff `/staff/[id]` | inline by name | right card, `min-w-[16rem]` | inside the card | — |
| Supplier `/suppliers/[id]` | inline by name | **full-width block below** | none | header right |
| Customer `/customers/[id]` | **in a row below** | right card, no min width | none | row below |
| Partner `/partners/[id]` | inline by name | right card | two stickers | row below |

Same ingredients. Four layouts. Multiply across 58 live pages.

---

## The archetypes

### 1. `PageHeader`
Breadcrumb · title · meta row (badges, plain facts) · action cluster (primary, secondary, overflow `⋯`).
Every page gets exactly one. Titles come from `pageTitleForPathname`; breadcrumbs from the nav registry.

### 2. `EntityDetailPage`
`PageHeader` + **headline figure** (the one number this page exists to answer) + **panel row** (0–3 `SummaryPanel`) + **activity** (`LedgerTable` with filter chips, period bands, history toggle, row actions).

Fills for each entity:

| Page | Headline | Panels | Activity |
|---|---|---|---|
| Staff | Net to pay | Salary · Advances | Staff ledger |
| Supplier | Payable balance | Payables · Invoices | Supplier activity |
| Customer | Receivable balance | Receivables · Group sales | Customer ledger |
| Partner | Owed to partner | **Profit · Cash & expenses** (built 2026-07-14) | Partner ledger |
| Bank/cash account | Current balance | This month in/out · Statements | Account activity |
| FX wallet | Wallet balance | Holdings · TRY cost | FX ledger |
| Delivery platform | Owed by platform | Reports · Settlements | Platform activity |

### 3. `ListPage`
`PageHeader` + toolbar (search · filter chips · date range) + count line + **table or mobile cards (one component decides, not each page)** + `TablePager` + optional footer total.

### 4. `HubPage`
`PageHeader` + tile grid. One tile component, one grid. Banking, Delivery, Review, Record, Reports, More, Settings.

### 4b. `OverviewPage` — the dashboard
The dashboard is **not** a tile grid and must not be forced into one: it is KPI
cards + trend charts + recent entries + drill-down cards. It gets its own
archetype so it shares the header, card, money and empty-state rules while
keeping its own body: `PageHeader` + period control + `StatCard` row +
chart row + activity card. Only `/` uses it.

### 5. `ReviewPage`
`PageHeader` + queue tabs with counts + rows with inline confirm/reject + document preview pane where one exists.

### 6. `DocumentReviewPage`
Two-pane: original document left, extracted fields + confidence + actions right. Receipts, invoices, POS summaries, delivery reports.

### 7. `FormPage`
`PageHeader` + `FormSection` groups + sticky save bar. Settings, opening balances, setup flows.

### 8. `ReportPage`
`PageHeader` + period controls + KPI band + statement table + download menu. Mirrors the PDF/Excel exports shipped 2026-07-13/14 so screen and paper match.

### Shared pieces used by all
`SummaryPanel` (labelled lines + rule + total — generalized from the partner stickers) · `StatCard` · `LedgerTable` · `FilterChips` · `EmptyState` · `TablePager` · `StatusBadge`.

---

## Migration checklist — every page, nothing skipped

Legend: ☐ pending · ☑ done.

**Coverage proof:** 88 routes total − 30 redirects = **58 live pages**, and the slices below list exactly 58: 7 detail + 11 lists + 8 overview/hubs + 13 review/documents + 12 reports + 7 forms/settings/auth. Redirects need no design work (they render nothing) but are counted here so the arithmetic can be checked.

### Slice 1 — archetype components
☑ `PageHeader` ☑ `EntityDetailPage` ☑ `ListPage` ☑ `HubPage` ☐ `ReviewPage` ☐ `DocumentReviewPage` ☐ `FormPage` ☐ `ReportPage` ☑ `SummaryPanel` ☐ `StatCard` ☐ `LedgerTable` ☑ `FilterChips`

`LedgerTable` is still to build; its row-action rule was pulled forward on 2026-08-04 (actions live in a trailing column, Edit and Void weighted alike) because the inline placement was the loudest thing on the staff page.

### Slice 2 — entity detail (7) — **done 2026-08-04**
☑ `/staff/[id]` ☑ `/suppliers/[id]` ☑ `/customers/[id]` ☑ `/partners/[id]` ☑ `/banking/accounts/[id]` ☑ `/banking/fx/[id]` ☑ `/customers/group-sales/[id]`

All seven now compose `EntityDetailPage`; none draws its own title or balance card, and `archetypes.test.ts` fails if one starts again. Two things the slice forced out into the open:

- **One `h1` per page.** `AppShell` also drew a heading, so a migrated page had two. `PageHeader` now claims the title slot (`page-title-slot.tsx`) and the shell falls back to a breadcrumb — no hardcoded list of migrated routes to go stale.
- **Money isn't always lira.** Staff are paid in USD/EUR and FX wallets hold foreign currency, so `SummaryPanel` and `HeadlineFigure` take an optional `format`. Extended, not forked (see the rule at the top).

### Slice 3 — lists (11)
☐ `/staff` ☐ `/suppliers` ☐ `/customers` ☐ `/partners` ☐ `/sales` ☐ `/cards` ☐ `/banking/transfers` ☐ `/banking/cash` ☐ `/customers/group-sales` ☐ `/customers/group-menus` ☐ `/delivery/platforms`

### Slice 4 — overview + hubs (8)
☐ `/` **(dashboard — `OverviewPage`, §4b)** ☐ `/banking` ☐ `/banking/banks` ☐ `/banking/cards` ☐ `/banking/fx` ☐ `/delivery` ☐ `/record` ☐ `/more`

*(`/reports` is the reports hub — migrated with its own family in slice 6.)*

### Slice 5 — review + documents (13)
☐ `/review/bank` ☐ `/review/sales` ☐ `/review/receipts` ☐ `/review/invoices` ☐ `/review/expenses` ☐ `/review/delivery` ☐ `/review/manual-journals` ☐ `/review/receipts/[id]` ☐ `/review/invoices/[id]` ☐ `/sales/[id]` ☐ `/banking/statements/[id]` ☐ `/delivery/reports` ☐ `/delivery/settlements`

### Slice 6 — reports (12, incl. the `/reports` hub)
☐ `/reports` ☐ `/reports/profit-and-loss` ☐ `/reports/balance-sheet` ☐ `/reports/cash-flow` ☐ `/reports/ledger` ☐ `/reports/kdv-input` ☐ `/reports/delivery-sales` ☐ `/reports/period-comparison` ☐ `/reports/cash-book` ☐ `/reports/expense-register` ☐ `/reports/bank-reconciliation` ☐ `/reports/month-close`

### Slice 7 — forms + settings + auth (7)
☐ `/settings/restaurant` ☐ `/settings/profile` ☐ `/onboarding/opening-balances` ☐ `/banking/accounts/[id]/import` ☐ `/split` ☐ `/sign-in` ☐ `/sign-up`

### Slice 8 — sweep
☐ delete every now-unreferenced component and helper ☐ no inline `rounded-lg border border-border bg-card` left in `app/` ☐ no page renders its own mobile/desktop fork ☐ hoist the remaining bare `AppShell` calls into section layouts, then drop the shell's own `<h1>` and the `page-title-slot` handshake with it ☐ `tsc`, `eslint`, full test suite, production build ☐ update `FRONTEND_AUDIT_FINAL.md` status

---

## Rules that stop drift

1. **Pages don't style.** No `className` with layout/color in `app/**` except spacing between archetype slots.
2. **One headline number per detail page** — the question that page answers.
3. **Money is always** right-aligned, tabular, sign-coloured, Turkish-formatted.
4. **Mobile is not a page's problem** — `ListPage`/`EntityDetailPage` own the breakpoint.
5. **Every list pages.** No silent truncation, ever.
6. **Every empty state names the next action.**
7. **Same vocabulary as the books** — `transaction-registry.ts` labels; never raw enum values.
8. **Delete on migrate.** The bespoke code goes in the same commit as the archetype adoption.
