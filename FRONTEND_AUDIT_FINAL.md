# FRONTEND_AUDIT_FINAL — the fix-it-once list

**Date:** 2026-07-10 · Supersedes `FRONTEND_AUDIT.md` (first pass is folded in here). Every claim below was verified in code, with file references. Companion visual: `FRONTEND_PROPOSAL_PREVIEW.html` (open in a browser).

---

## Part A — Bugs and gaps found page-by-page

### A1 — HIGH · The entire Sales section is invisible (⌘K-only island)

`SIDEBAR_HIDDEN_HREFS` (nav-sections.ts:255) hides `/sales`, `/close-day`, `/cards` from the sidebar, and grep confirms **zero inbound links** anywhere in the app to `/close-day` and `/cards`, and exactly one to `/sales` (inside the manual-daily-sales form). The Sales section tabs only render once you are already inside the section. For a restaurant bookkeeping app, **Sales is unreachable except through ⌘K** — a first-time user will never find daily sales, card clearing, or close-day. This is the root of "many pages are hidden in command K."

**Fix:** Sales goes back in the sidebar as a top-level item (tabs: Daily sales · Card clearing · Close day). Nothing live should be ⌘K-only; ⌘K is an accelerator, not the primary navigation.

### A2 — HIGH · Directory pages show no money

`/suppliers`, `/customers`, `/staff`, `/partners` all render **Name / identifier / Status only** (verified: no balance column in any of the four) and link away to `/balances/*` for amounts. The question every one of these pages exists to answer — "how much do I owe / am I owed?" — requires a second navigation, a scan of a second table, then a third click back to the detail page. The backend balance endpoints already exist (the balances tabs use them).

**Fix:** add a right-aligned Balance column (green/red by sign) + a footer total to all four directory pages. Then the `/balances/*` tabs become the cross-entity *summary* view and the directories become self-sufficient (see merge M4).

### A3 — HIGH · Silent 50-row truncation on every list using `useEntityList`

`use-entity-list.ts` appends `limit=50` and there is **no pagination UI in any consumer**. The sales page even shows the real total ("94 daily summaries") while rendering only 50 rows — data past row 50 silently disappears. After ~2 months of daily entries this hits every restaurant. The GL panel is the only list with a real pager.

**Fix:** one shared `<TablePager>` (the GL already has the pattern) wired into `useEntityList`; show "1–50 of 94" everywhere.

### A4 — MEDIUM · Back navigation is static and has holes ("go back doesn't work properly")

`backLinkForPathname` (nav-sections.ts:525) returns hardcoded parents, so:

- `/banking/accounts/{id}` always goes back to the `/banking` hub — never to the branch list (Banks / Credit cards / Cash) you actually came from.
- `/banking/statements/{id}` renders "← Account" with `href="/banking"` until the statement loads — click it early (or on load error) and you land on the hub.
- `/banking/cash` has **no back rule at all** (banks/cards/fx do) — a dead end unless you notice the section tabs.
- Arriving anywhere from a different context (supplier detail from a statement line, GL from dashboard) then clicking "back" discards your origin and dumps you at the static parent.
- `/onboarding/opening-balances` goes "back" to `/reports` — a setup page whose parent is Reports (see M6).

**Fix:** history-aware back — push a `from` param (or use a tiny nav stack in sessionStorage) and fall back to the static parent only when there's no history. Add the missing `/banking/cash` rule regardless. Breadcrumbs on detail pages (`Banking / Banks / Garanti TL`) remove the ambiguity permanently.

### A5 — MEDIUM · Entity switcher is display-only in the sidebar

`EntityBadge` in the sidebar has no click handler — switching restaurants lives only in the top-right account menu. Users will click the sidebar badge (it looks like a control), nothing happens. **Fix:** make the sidebar badge the actual switcher dropdown.

### A6 — MEDIUM · ⌘K searches suppliers + expense items only

`palette-search.ts` covers suppliers and expense items. Customers, staff, partners, group sales, and transactions are not findable. Combined with A1, the palette is simultaneously the only door to some pages and blind to half the data. **Fix:** add customers/staff/partners (endpoints exist); add a transaction-description search endpoint for "⌘K → Metro 4.500".

### A7 — Assorted per-page findings

- **Suppliers/customers lists:** no search box and no pagination (with A3, an 80-supplier list is a truncated wall). Add the standard list-page header: search + filter + count.
- **Dashboard recent entries:** rows are static `<li>` — not clickable (only "View all"). The KPI cards themselves are good (Net result, Cash + bank, Sales + charts).
- **Reports → Ledger:** zero links out — account names, descriptions, entry ids are all plain text.
- **GL detail panel:** chain links exist (amends/reversed-by) but there is no "open source page/document" link, and the panel explicitly tells users to go find "the dedicated correction flow" for subledger entries.
- **`/customers` is labeled "Customers" in the sidebar and "Agencies" in its own tabs** — terminology drift, pick one.
- **`/cards` (POS card clearing) vs `/banking/cards` (credit-card accounts):** two "cards" pages meaning different things — rename to "Card clearing" and "Credit cards" everywhere including ⌘K labels.
- **Route hygiene is otherwise good:** the legacy URLs (`/payables`, `/receivables`, `/uploads`, `/banking/review`, `/review/posted`, all `/setup/*`) redirect correctly — verified each one.

---

## Part B — Duplicate / overlapping pages, and what to merge

### M1 — `/sales` vs `/review/sales` — true duplicate, merge

Both list `GET /pos/daily-summaries`; both mount `CorrectDailySalesForm`. One is orphaned (A1), one lives in Review. **Proposal:** one Sales page (sidebar, per A1) with a status filter (needs review / posted); `/review/sales` becomes that page pre-filtered to needs-review. One component, two URL states — delete the duplicate.

### M2 — Three "close day" forms

`day-closeout-form`, `cash-drawer-close-form`, `cash-drawer-close-day-form` + a Record-hub "Close day" action + an orphaned `/close-day` page. **Proposal:** one Close-day flow (page), Record hub action opens the same page, and the two cash-drawer variants become steps inside it, not siblings.

### M3 — Record hub dialogs vs dedicated pages

~30 Record actions open dialogs whose forms also live on pages (transfers, FX, group sales…). Two entry points with subtly different behavior each. **Proposal:** keep both entry points but make them provably identical — the page hosts the form, the Record action deep-links to the page with the form open (`?new=1`). One implementation per action.

### M4 — Directory pages vs `/balances/*` tabs

Four pairs of pages answering overlapping questions (A2). **Proposal:** balance columns in directories; Balances hub keeps only the aggregate views (totals, cash position, aging later). No page loses a capability; each pair collapses to one purpose per page.

### M5 — Sales/graph naming collision (see A7 `/cards`)

Rename, don't merge — they're different features wearing the same name.

### M6 — `/onboarding/opening-balances` sitting in Reports

A setup task presented as a report card, whose back link goes to `/reports`. **Proposal:** move it to Settings → Restaurant (where the rest of setup consolidated — that migration was otherwise completed cleanly), and keep a small "Opening balances" link on the Balance-sheet report only.

---

## Part C — The systemic fixes (from pass 1, still the core)

### C1 — Edit/Void is not global

Verified coverage: customer/supplier/staff/partner ledgers, FX wallet, expenses review, GL (manual + bank charges only), statement lines, group sales, manual journals — **have** actions. Missing entirely: transfers, bank account activity, POS settlements (`/cards`), delivery reports & settlements, close-day history, dashboard entries, reports ledger. Backend holes: **no void endpoint exists for delivery reports/settlements or POS day summaries/settlements** (`features/delivery`, `features/pos` — checked); transfers/close-day can already use the generic `POST /ledger/entries/{id}/void`.

**Fix — one global Transaction Drawer:** a single registry mapping `journal_entry.source` → `{editForm, voidPath, sourceHref}` (all 13 correct-forms already exist), one right-side drawer mounted in the app shell, opened by clicking **any transaction row on any page**. Shows lines, chain links, counterparty chip, source document, Edit / Void / Duplicate gated by `canEditSubledgerRow` + role + period lock. After a void/edit it shows the new chain and fires one `ledger-changed` event that pages listen to. This makes every transaction editable/voidable *from wherever the user found it* — including surfaces that don't exist yet.

### C2 — Reliability

Zero `error.tsx` / `loading.tsx` / `not-found.tsx` files in the whole app router (one render error = white screen; every navigation is blank until data lands). Every page hand-rolls fetch/state (no cache, no revalidation, stale sibling pages after mutations). **Fix:** route-level error boundaries + `loading.tsx` skeletons (components exist, never mounted); adopt TanStack Query behind the existing `apiFetch` (its retry/backoff stays); mutation invalidation replaces the ad-hoc `reload()` wiring.

### C3 — Look & feel

Keep the locked palette; add: dark mode (tokens are ready — one `.dark` block + toggle), elevation tokens for cards/drawer, real page titles (20px in content area, not 14px in the top bar) + breadcrumbs, collapsible sidebar, row hover + whole-row click targets + sticky headers + keyboard ↑/↓, status pills used consistently everywhere (posted / needs review / voided / corrected), 150ms transitions, amount coloring by sign.

### C4 — Mobile & language

`app-shell` has effectively one responsive class; the fixed 240px sidebar makes phones unusable — yet receipt photos are a core flow. Fix: slide-over drawer + bottom tab bar (Home · Record · Review · Balances · More), tables collapse to card rows. And the UI is English-only against a bilingual TR/EN spec (DESIGN_SYSTEM §1) — start with nav, statuses, and form labels.

---

## Part D — Build order (each step ships alone, later steps get cheaper)

1. **Navigation repair (A1, A4, A5, A7 renames)** — sidebar entries, back-link rules + `from` param, entity switcher, labels. Pure frontend, no risk, kills the two complaints users hit first.
2. **List integrity (A2, A3, A6)** — balance columns, shared pager, palette coverage.
3. **Route safety nets (C2a)** — `error.tsx` / `loading.tsx` sweep.
4. **Transaction Drawer (C1)** — registry + drawer on GL, dashboard, banking first (no new endpoints needed).
5. **Backend voids (delivery, POS)** → registry entries → edit/void is now truly global. Decide the FINANCIAL_AUDIT F3 as-of/reporting policy *before* this step.
6. **Data layer (C2b)** — TanStack Query, section by section.
7. **Merges (M1–M6)** — now trivial because the drawer + pager + nav are shared.
8. **Theme pass (C3)** — dark mode, elevation, headers.
9. **Mobile shell + TR localization (C4).**

---

## Part E — Verification notes

Checked by reading code (not runtime): all 60 routes classified live/redirect; inbound links grepped per route; every void/correct endpoint enumerated in `backend/app/features/*/api.py`; back-link rules read in full; `SIDEBAR_HIDDEN_HREFS` read in full. Not exercised: runtime role gating, Clerk auth flows, real API responses. Two prior docs overlap this one: UX_AUDIT_PROPOSAL (its hub migration shipped and mostly succeeded — the redirects prove it) and FINANCIAL_AUDIT (F3 interacts with step 5 above).
