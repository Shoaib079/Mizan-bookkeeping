# AGENT_IMPLEMENTATION_PROMPTS — copy-paste prompts to build the approved frontend

Source of truth: `FRONTEND_AUDIT_FINAL.md` (what & why) and `FRONTEND_PROPOSAL_PREVIEW.html` (approved look).
**Paste one phase at a time, in order. Never paste them all at once.** Each phase ships alone; verify before starting the next.

---

## Standing header — paste at the START of every session, before the phase prompt

```
Read FRONTEND_AUDIT_FINAL.md and open FRONTEND_PROPOSAL_PREVIEW.html — that preview is the approved design; match its layout, colors, spacing, and interactions. Follow CURSOR_RULES.md and DESIGN_SYSTEM.md: all styling through the token file (globals.css) and shared components only — never hardcode colors or styles in pages. Do not change accounting behavior, API contracts, or any existing redirect. Keep every existing test green; add tests for new logic. Update CHANGELOG.md when done. Work in small commits, one concern each.
```

---

## Phase 1 — Navigation repair (audit A1, A4, A5, A7)

```
Fix navigation exactly per FRONTEND_AUDIT_FINAL.md Part A:

1. Sidebar (match the preview's sidebar): remove /sales, /close-day, /cards from SIDEBAR_HIDDEN_HREFS and add a "Sales" top-level sidebar item whose section tabs are Daily sales / Card clearing / Close day. Add "Settings" to the sidebar bottom. Group the sidebar with the preview's section labels: Money in (Sales, Delivery, Customers), Money out (Suppliers, Staff, Partners), Money held (Banking), Understand (Reports, Settings), with Dashboard/Record/Review/Balances on top.
2. Back links: make PageBackLink history-aware — when navigating internally, pass a ?from= param (or sessionStorage nav stack) and prefer it over the static parent from backLinkForPathname; keep the static parent as fallback for direct loads. Add the missing back rule for /banking/cash. Fix /banking/statements/[id] so the back link never points to /banking while the statement is loading.
3. Breadcrumbs: add a shared <Breadcrumbs> in the content header on all detail pages (e.g. Banking / Banks / Garanti TL; Suppliers / Metro Toptan), per the preview.
4. Entity switcher: make the sidebar EntityBadge a real dropdown that switches restaurants (same logic as the account-menu switcher; keep the account-menu one too).
5. Rename for clarity everywhere including palette labels: /cards → "Card clearing", /banking/cards → "Credit cards"; unify "Agencies" → "Customers".

Do not delete any route or redirect. Verify: every live page is reachable by clicking from the sidebar alone; grep confirms no route has zero inbound links except redirects.
```

## Phase 2 — List integrity (A2, A3, A6)

```
Per FRONTEND_AUDIT_FINAL.md A2/A3/A6, matching the Suppliers screen in FRONTEND_PROPOSAL_PREVIEW.html:

1. Balance columns: add a right-aligned Balance column + footer total to /suppliers, /customers, /staff, /partners using the same endpoints the /balances/* tabs already use. Color amounts by sign (token colors). Rows keep linking to detail pages.
2. Pagination: build one shared <TablePager> ("1–50 of N", Prev/Next) and wire it into useEntityList and every consumer. No list may silently truncate at 50 again. Show the range on every list page.
3. Search: add the standard list header (search input + status filter + count) to suppliers and customers lists.
4. Command palette: extend palette-search to customers, staff, and partners using existing list endpoints (same pattern as suppliers).

Verify: sales page with >50 summaries pages correctly; suppliers page shows the same total payable as /balances/suppliers.
```

## Phase 3 — Route safety nets (C2a)

```
Add Next.js route-level resilience, no logic changes:
1. global-error.tsx and a root not-found.tsx.
2. error.tsx per section (banking, review, reports, sales, customers-section, procurement, staff, partners, delivery, balances, settings) with a friendly message + Retry (reset()).
3. loading.tsx per section using the existing Skeleton/TableSkeleton components.
Match app styling via tokens. Verify by temporarily throwing in a page: the shell must survive with an inline error card, not a white screen.
```

## Phase 4 — Global Transaction Drawer (C1) — the big one

```
Build the global transaction drawer exactly as shown in FRONTEND_PROPOSAL_PREVIEW.html (right-side drawer):

1. Create lib/transaction-actions.ts: a registry mapping journal_entry.source → { label, EditForm (reuse the existing correct-* forms), voidPath, sourceHref(entry), counterpartyHref(entry) }. Cover every source the GL panel knows. Sources with no void endpoint yet (delivery, POS summaries/settlements) get actions:"view-only" with a note.
2. Create components/ledger/transaction-drawer.tsx: header (amount, description, date, status pills incl. Corrected/Voided), journal lines table, correction-chain links (reuse the ChainLink logic from general-ledger-panel), Connected section (open source page, counterparty, document), audit line, footer buttons Duplicate / Edit / Void gated by canEditSubledgerRow + role + period lock. Esc closes; focus is trapped.
3. Mount once in AppShell behind a context: openTransaction(journalEntryId). Fetch entry details via the existing ledger entries endpoint.
4. Wire rows to open it on: dashboard recent entries, reports/ledger (GL), banking account detail, banking transfers, cards page, close-day history, delivery reports/settlements (view-only for now). Whole row is the click target with hover state, per the preview.
5. After a successful edit/void, dispatch a "mizan:ledger-changed" event; pages that show ledger data listen and reload. Remove the GL detail panel's "use the dedicated correction flow" copy — the drawer replaces it.
6. Transfers and close-day void: use the existing generic POST /entities/{id}/ledger/entries/{entry_id}/void.

Add tests for the registry (every source resolves) and the canEdit gating. Do not change any correct-* form's behavior.
```

## Phase 5 — Backend voids → drawer completion

```
Backend first, then frontend:
1. Add void endpoints following the existing SubledgerVoidOut pattern (see expenses/api.py): delivery reports, delivery settlements, POS daily summaries, POS settlements. Reuse core/ledger correction machinery; respect period locks; write tests mirroring the expense void tests.
2. Before exposing them: implement the FINANCIAL_AUDIT F3 decision on voids vs historical reports (as-of behavior) as specified in DECISIONS.md — if undecided, stop and ask.
3. Flip the registry entries from view-only to full edit/void. Delivery and POS rows now void from the drawer anywhere.
```

## Phase 6 — Data layer (C2b)

```
Adopt TanStack Query app-wide, one section at a time starting with Review, then Banking, then the rest:
- Wrap the existing apiFetch (keep its retry/backoff and auth) in useQuery/useMutation helpers keyed by [entityId, domain, params].
- Replace hand-rolled useEffect fetching; mutations invalidate their domain keys; the "mizan:ledger-changed" event becomes a queryClient.invalidateQueries call.
- Keep URL-driven filter state exactly as is. No visual changes in this phase. All tests green after each section before moving on.
```

## Phase 7 — Merges (M1–M6)

```
Do the merges from FRONTEND_AUDIT_FINAL.md Part B, one commit each:
M1: merge /sales and /review/sales into one Sales page with status filter chips (All / Needs review / Posted); /review/sales renders it pre-filtered. Delete the duplicate component.
M2: consolidate the three close-day forms into one Close-day flow on /close-day; the Record action links there.
M3: Record hub actions deep-link to their pages with ?new=1 opening the form, instead of duplicating forms in dialogs. Migrate the top 5 actions first (Close day, Daily sales, Manual expense, Transfer, Supplier payment), then the rest.
M6: move Opening balances from the Reports card grid into Settings → Restaurant tabs; keep a link on the Balance-sheet report page. Keep the old URL as a redirect.
Every removed page becomes a redirect — never a 404.
```

## Phase 8 — Theme pass (C3) — match the preview's paint

```
Only globals.css + shared components; zero page-logic changes. Match FRONTEND_PROPOSAL_PREVIEW.html:
1. Dark mode: add the .dark token block (use the preview's dark values), a toggle in the top bar (moon/sun), persist in localStorage, respect prefers-color-scheme.
2. Elevation: add --shadow-card and --shadow-pop tokens; apply to cards, drawer, menus, palette.
3. Page headers: 20-21px semibold title in the content area with breadcrumb above and actions right; top bar keeps search / review pill / Add / theme / avatar only.
4. Tables: sticky headers, row hover bg, uppercase 11.5px column labels, sign-colored amounts, footer total rows — as in the preview.
5. Status pills everywhere: Posted (green), Needs review (amber), Voided (slate, with strike-through rows), Corrected (blue) — one StatusBadge vocabulary.
6. 150ms ease transitions on hover/drawer/dialogs. Show before/after screenshots of Dashboard, Suppliers, Banking.
```

## Phase 9 — Mobile + Turkish

```
1. Mobile shell per the preview's narrow layout: sidebar becomes a slide-over drawer; add the bottom tab bar (Home, Record, Review, Balances, More); tables collapse to card rows on <820px; touch targets ≥44px.
2. TR localization: introduce next-intl (or a flat dictionary) with tr as default and en fallback; translate nav, section labels, status pills, buttons, form labels, empty states first. Money/date formats unchanged (already Turkish).
```

---

## How to verify each phase (tell the agent)

```
After each phase: run the full test suite; click-test the affected screens against FRONTEND_PROPOSAL_PREVIEW.html side by side; confirm no route 404s (check the redirect registry tests); update CHANGELOG.md and PROGRESS.md.
```
