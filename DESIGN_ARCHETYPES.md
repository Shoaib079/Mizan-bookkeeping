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

### 5. ~~`ReviewPage`~~ — folded into `ListPage` (2026-08-04)
A review queue turned out to be a list with different row actions: header,
toolbar, table, empty state. The only thing it needed that `ListPage` lacked was
a place to open the selected document in place, so `ListPage` gained a
`preview` slot. Building a separate `ReviewPage` would have been a near-copy —
the fork the rule at the top forbids. Queue tabs come from `SectionShell`, which
already renders them for the whole `/review` section.

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
☑ `PageHeader` ☑ `EntityDetailPage` ☑ `ListPage` ☑ `HubPage` ☑ ~~`ReviewPage`~~ (folded into `ListPage`) ☑ `DocumentReviewPage` ☑ `FormPage` ☑ `ReportPage` ☑ `OverviewPage` ☑ `SummaryPanel` ☑ `StatCard` ☑ `LedgerTable` ☑ `FilterChips`

All built. `LedgerTable`'s row-action rule was pulled forward before the component existed (actions in a trailing column, Edit and Void weighted alike), so adopting it changed no pixels — it only stops the next ledger inventing a fourth layout.

### Slice 2 — entity detail (7) — **done 2026-08-04**
☑ `/staff/[id]` ☑ `/suppliers/[id]` ☑ `/customers/[id]` ☑ `/partners/[id]` ☑ `/banking/accounts/[id]` ☑ `/banking/fx/[id]` ☑ `/customers/group-sales/[id]`

All seven now compose `EntityDetailPage`; none draws its own title or balance card, and `archetypes.test.ts` fails if one starts again. Two things the slice forced out into the open:

- **One `h1` per page.** `AppShell` also drew a heading, so a migrated page had two. `PageHeader` now claims the title slot (`page-title-slot.tsx`) and the shell falls back to a breadcrumb — no hardcoded list of migrated routes to go stale.
- **Money isn't always lira.** Staff are paid in USD/EUR and FX wallets hold foreign currency, so `SummaryPanel` and `HeadlineFigure` take an optional `format`. Extended, not forked (see the rule at the top).

### Slice 3 — lists (11) — **done 2026-08-04**
☑ `/staff` ☑ `/suppliers` ☑ `/customers` ☑ `/partners` ☑ `/sales` ☑ `/cards` ☑ `/banking/transfers` ☑ `/banking/cash` ☑ `/customers/group-sales` ☑ `/customers/group-menus` ☑ `/delivery/platforms`

Nine compose `ListPage`. Two do not, and shouldn't: **`/banking/cash`** (drawers + sessions + movements) and **`/cards`** (reconciliation + batches + settlements) are workspaces, not lists — forcing them into a list shape would be the drift the archetypes exist to stop. They take `PageHeader` so their identity and actions match, and keep their own bodies.

What the slice turned up:

- **Rule 5 was being broken in three places.** `/staff` and `/partners` had no pager at all; daily sales fetched 200 rows and told the reader *"showing 200 — download Excel for the full list"*. Sales now pages properly (`SALES_PAGE_SIZE`, resetting to page one when the period or filter changes). `/partners` is the one list still capped — it fetches `limit=50` through its own `apiFetch` for the ownership-share warning rather than `useEntityList`, so paging it means reworking that call. Left deliberately, noted here, guarded in the test.
- **`ListPage` gained a `summary` slot** so suppliers and customers can show their roll-up figure through `HeadlineFigure` instead of hand-drawing a card (`HubPage` already had one).
- **Daily sales had its own filter chips** in a different style to `FilterChips` (solid vs tinted). Now shared.
- Removed two hand-written `← Banking` back links that duplicated `PageBackLink` in the shell.

### Slice 4 — overview + hubs (8) — **done 2026-08-04**
☑ `/` **(dashboard — `OverviewPage`, §4b)** ☑ `/banking` ☑ `/banking/banks` ☑ `/banking/cards` ☑ `/banking/fx` ☑ `/delivery` ☑ `/record` ☑ `/more`

*(`/reports` is the reports hub — migrated with its own family in slice 6.)*

`OverviewPage` and `StatCard` built here, completing all but `LedgerTable`. What the slice turned up:

- **The dashboard had three card shapes for one job** — a linked "This period" card, a plain sales/expenses pair, and the "Right now" tiles, each with its own radius, padding and heading. All now `StatCard`.
- **`CashBankSnapshotCard` sat beside one of them at a wider radius and more padding**, so two cards on the same row visibly failed to line up. Same shell now, asserted in the test.
- **A second tile component existed.** `BankingHubTile` duplicated `HubTileCard` with different emphasis. Deleted; the banking hub composes `HubPage`.
- `/banking/banks`, `/banking/cards` and `/banking/fx` share one implementation that repeated its title twice — once as the page heading, once as the section header above the same list. The section keeps only the total now.

### Slice 5 — review + documents (13) — **done 2026-08-04**
☑ `/review/bank` ☑ `/review/sales` ☑ `/review/receipts` ☑ `/review/invoices` ☑ `/review/expenses` ☑ `/review/delivery` ☑ `/review/manual-journals` ☑ `/review/receipts/[id]` ☑ `/review/invoices/[id]` ☑ `/sales/[id]` ☑ `/banking/statements/[id]` ☑ `/delivery/reports` ☑ `/delivery/settlements`

`ReviewPage` was not built — see §5. The queues are `ListPage`s; the two-pane
document pages use `DocumentReviewPage`.

What the slice turned up:

- **Six surfaces drew their own filter chips.** Solid where the shared chip is tinted, three as `role="tablist"`, each with its own padding: statement review, invoice review, expense review (two separate rows), the statement lines ledger, and daily sales. All shared now, and a test fails if a review surface rolls its own again.
- **`/sales/[id]` had a status branch that wasn't exhaustive.** `canConfirm` covers draft/needs_review and `isTerminal` covers posted/rejected — a `duplicate` is neither. Collapsing it to a binary would have told the reader a duplicate "cannot be changed" when it can. Kept three-way, with a comment saying why.
- `/banking/statements/[id]` keeps its own body: it is an import workspace (preview, mapping, line classification), not a document review.

### Slice 6 — reports (12, incl. the `/reports` hub) — **done 2026-08-04**
☑ `/reports` ☑ `/reports/profit-and-loss` ☑ `/reports/balance-sheet` ☑ `/reports/cash-flow` ☑ `/reports/ledger` ☑ `/reports/kdv-input` ☑ `/reports/delivery-sales` ☑ `/reports/period-comparison` ☑ `/reports/cash-book` ☑ `/reports/expense-register` ☑ `/reports/bank-reconciliation` ☑ `/reports/month-close`

Eleven compose `ReportPage`. The **hub** keeps its own body — a period summary, a mobile-only sticky control bar and a tile grid — and takes `PageHeader` for identity, the same call already made for `/banking/cash` and `/cards`.

What the slice turned up:

- **All twelve hand-wrote the same four states**: no restaurant selected, forbidden, error, loading. Each with its own spacing, so the period control and download menu sat at slightly different heights from one report to the next. `ReportPage` owns them now.
- **P&L and balance sheet drew their own KPI boxes** in a `.map()` over a literal array, at `text-xl` where `StatCard` uses `text-2xl`. Both now use `StatCard`, so the dashboard and the reports agree.
- The balance sheet's KPI band is the one that was reporting a broken accounting equation until the contra-account fix earlier the same day — worth re-reading on production.

### Slice 7 — forms + settings + auth (7) — **done 2026-08-04**
☑ `/settings/restaurant` ☑ `/settings/profile` ☑ `/onboarding/opening-balances` ☑ `/banking/accounts/[id]/import` ☑ `/split` ☑ `/sign-in` ☑ `/sign-up`

Four compose `FormPage`. **`/split`** is a workflow rather than a settings form, so it takes `PageHeader` only. **`/sign-in` and `/sign-up`** live outside `AppShell` entirely — they are Clerk's own components on a centred background, with no app chrome, and giving them an archetype would be pretending they are app pages.

What the slice turned up:

- **Settings cards used `p-5`** where every other card in the app uses `p-4`, and each page capped its own width differently (`max-w-xl`, `max-w-3xl`, `max-w-4xl`). `FormPage` caps it once, with `wide`/`full` for the two-column setup screens.
- `/split` printed its own `<h1>` **in addition to** the shell's — the last page still doing that.
- **Non-blocking warning added** to `/cards`: card clearing is an asset and cannot legitimately go negative, so when it does, deposits are recorded but the sales behind them are not. Spice Corner is −462.870,73 ₺ against 28 settlements with no card sales. It states the amount and links to Daily sales; it disables nothing, because the fix is to carry on entering the missing sales. A test asserts it never blocks.

### Slice 8 — sweep — **done 2026-08-04**
☑ delete every now-unreferenced component and helper ☑ no page renders its own mobile/desktop fork ☑ shell no longer draws a heading ☑ `tsc`, `eslint`, full test suite

- **`LedgerTable` built**, and the customer, staff and partner ledgers adopted it. Deliberately not a data grid: each ledger keeps its own columns because they genuinely differ (pax and forex on customers, extra days on staff, native quantity on FX). What it owns is the frame — header, empty states, correction history, band rows, actions column.
- **The title handshake is gone.** Every live page carries its own `PageHeader` now, so `AppShell` no longer draws a heading and `page-title-slot.tsx` is deleted. The shell contributes the trail that leads to the title, nothing more. Four pages needed a header first: `/banking/fx`, `/banking/statements/[id]`, `/review/expenses`, `/review/invoices/[id]`.
- **Twelve unreferenced modules deleted**, including four `balances/*` tables orphaned when those routes became redirects in IA v2, and `fx-wallet-action-dialog` superseded by `fx-unified-dialog`. Two had tests still guarding them; the FX one was pointed at the live component rather than deleted, so the guarantee survives the file.
- Two more hand-written back links removed (FX hub, statement detail) — `PageBackLink` in the shell already does this.

**Deliberately left:** inline `rounded-lg border border-border bg-card` remains in 10 files. Those are one-off panels — a reconciliation block, a warning box, a drawer list — not cards pretending to be a shared component. Forcing them behind an archetype would be the fork the rules forbid. `middleware.ts` and `void-confirm-dialog.tsx` show as unreferenced by the module scan: the first is a Next convention, the second is imported relatively.
