# FRONTEND_AUDIT — full frontend review (modernity · reliability · interconnection · global edit/void)

**Date:** 2026-07-10 · **Scope:** every page under `frontend/src/app` (~60 routes), shared components, and the backend endpoints the UI depends on. Written from two seats: the developer who has to maintain it, and the owner who uses it every night after close.

---

## Executive summary

The foundation is better than most apps at this stage: one token file, one component kit, hub pages (Record / Review / Balances), URL-driven filters, idempotent submits, draft autosave, and a real correction engine in the ledger core. The problems are that the good machinery is **unevenly wired**:

1. **Edit/Void is per-feature, not global.** Roughly half the surfaces that display money have no Edit/Void, and two transaction families (delivery, POS card settlements/day summaries) can't be voided even by the backend.
2. **The graph is one-directional.** Detail pages reach transactions, but transactions rarely reach back to their source, counterparty, or document. The General Ledger literally tells the user to go find "the dedicated correction flow" instead of offering the action.
3. **Reliability is hand-rolled per page.** No route-level error boundaries or loading states exist anywhere; every page reimplements fetch/loading/error; a single render error white-screens the app.
4. **The look is clean but static.** No dark mode, no elevation, a fixed non-collapsible sidebar, a 14px page title, and effectively no mobile layout — for an owner who photographs receipts on a phone.
5. **English-only UI** despite the bilingual TR/EN requirement in DESIGN_SYSTEM.md §1.

The single highest-leverage fix is **one shared Transaction Drawer** mounted everywhere (§3). It solves #1 and #2 together, permanently, instead of patching page by page.

---

## 1. What holds up (verified, keep as-is)

- **Design tokens:** `globals.css` is the only style source; pages don't hardcode colors. Re-skinning genuinely is a one-file job. Dark mode is one token block away.
- **Correction engine:** `core/ledger/correction.py` + `ledger-display.ts` give a real amend/reverse chain (`reverses / reversed_by / amends / amended_by`), `display_kind` (`effective | superseded | void_reversal`), history toggle, corrected badge, strike-through styling. This is the right architecture — it's just not exposed everywhere.
- **Safety plumbing:** `use-submit-idempotency`, `apiFetch` retry/backoff, `form-draft` autosave, `unsaved-work` guard, period-lock-aware submits (`use-period-unlock-submit`).
- **IA:** the UX_AUDIT hubs shipped (Record / Review / Balances), legacy redirects are registered (`nav-sections.ts`), review counts propagate to sidebar + tabs + top bar.
- **Good link pattern that already exists:** receivables rows → `/customers/{id}`; statement lines can void through the ledger path and downgrade the line back to review. These are the patterns to replicate, not invent.

---

## 2. Finding F1 — Edit/Void coverage map (the core gap)

`SubledgerRowActions` (Edit + Void) and the 13 `correct-*` forms exist, but they are mounted on only some surfaces. Verified coverage:

| Surface | Edit | Void | Notes |
|---|---|---|---|
| Customer detail ledger | ✅ | ✅ | reference implementation |
| Supplier activity panel | ✅ | ✅ | |
| Staff detail ledger | ✅ | ✅ | |
| Partner detail ledger | ✅ | ✅ | |
| FX wallet | ✅ | ✅ | |
| Expenses review | ✅ | ✅ | `/expenses` redirects here — fine |
| Sales (daily summaries) | ✅ Correct | ❌ | backend has `/correct` only — **a wrong day summary can never be voided** |
| Group sales | — | ✅ | |
| Manual journals | ✅ (GL) | ✅ | |
| General ledger (`/review/posted`) | manual + bank charges only | manual only | detail panel *tells the user to go elsewhere* for everything else |
| Bank statement lines | reclassify | ✅ undo/void | good |
| **Transfers** (`/banking/transfers`) | ❌ | ❌ | backend generic void exists; no UI |
| **Bank account detail** (transaction list) | ❌ | ❌ | no row actions at all |
| **POS card settlements** (`/cards`) | ❌ | ❌ | no endpoint, no UI |
| **Delivery reports & settlements** | ❌ | ❌ | **no `/void` or `/correct` endpoint exists in `features/delivery`** — a mis-keyed settlement is permanent |
| **Close-day closeouts** | ❌ | ❌ | |
| Dashboard recent entries | ❌ | ❌ | rows aren't even clickable |
| Reports → Ledger | ❌ | ❌ | fully read-only, no links |

**End-user translation:** "I can fix a supplier payment if I remember it lives on the supplier page, but I can't fix it from the bank account where I actually noticed it. I can't void a delivery settlement at all. My POS day summary from last Tuesday is wrong and the Correct button exists on one page only."

**Backend gaps to close first** (frontend can't fix what has no endpoint):

- `POST /delivery/reports/{id}/void`, `POST /delivery/settlements/{id}/void` (+ correct variants)
- `POST /pos/daily-summaries/{id}/void`
- `POST /pos/settlements/{id}/void`
- Transfers and close-day can reuse the existing generic `POST /entities/{id}/ledger/entries/{entry_id}/void` — no new endpoint needed, only UI.

---

## 3. Proposal P1 — one global Transaction Drawer (fixes F1 + F2 at the root)

Stop mounting per-page action buttons. Build **one** component and mount it once in the app shell:

```
<TransactionPeek journalEntryId={...} />   // opened from ANY row, ANY page
```

**How it works (developer view):**

1. **Resolver, not switch statements in pages.** A single registry `lib/transaction-actions.ts` maps `journal_entry.source` → `{ editForm, voidPath, sourceHref, label }`. All 13 `correct-*` forms and all void paths already exist — this file just centralizes the routing that is currently copy-pasted into 7 pages.
2. **One drawer UI** (right-side sheet): date, description, amount, status pill, debit/credit lines, correction chain links (already built in `general-ledger-panel`), counterparty chip (→ supplier/customer/staff/partner page), source document thumbnail if any, and **Edit / Void / Duplicate** buttons gated by `canEditSubledgerRow` + role + period lock.
3. **Every row everywhere opens it**: dashboard recent entries, GL, reports ledger, bank account detail, transfers, cards, delivery, balances drill-downs. A row anywhere = the same peek, the same actions. New feature? Add one registry entry and every surface gets edit/void for free.
4. **After-action behavior:** drawer stays open showing the new chain ("Superseded by …"), emits one `mizan:ledger-changed` event; pages listening to it reload. No more per-page `onSaved={() => void reload()}` wiring drift.

This is exactly the "even if it came from somewhere else" requirement: the drawer doesn't care which page you found the transaction on.

---

## 4. Finding F2 — interconnection gaps (and fixes)

- **GL detail panel** shows chain links between entries but **no link to the source** (the expense, the sale, the customer). Fix: `sourceHref` from the P1 registry — "Open in Expenses →".
- **Dashboard recent entries**: rows are plain `<li>`, only a global "View all" link. Fix: rows open the Transaction Drawer.
- **Reports → Ledger**: zero links (verified: no `href`/`push` in the page). Fix: same drawer; account names link to filtered GL.
- **Counterparty names** are links on receivables (good) but plain text on statement lines, GL, expenses lists. Fix: one `<CounterpartyChip>` used everywhere a supplier/customer/staff/partner appears.
- **Documents ↔ transactions**: an invoice review page exists, but from a posted expense there's no "view the receipt that created me". The drawer should show the linked document.
- **Command palette** searches suppliers + expense items only. Add customers, staff, and (via one backend endpoint) transaction description search — "⌘K → 'Metro 4.500'" should land on the entry.
- **No breadcrumbs**; `PageBackLink` only. Adequate once the drawer exists, but detail pages (customer/supplier/staff) should show `Customers / Ali Veli`.

---

## 5. Finding F3 — reliability

- **Zero `error.tsx`, `loading.tsx`, `not-found.tsx` files in the entire app router** (verified by find). One thrown render error = white screen with no recovery; every navigation shows nothing until JS data lands. Fix: root `global-error.tsx` + per-section `error.tsx` ("Something broke — Retry / Report") and `loading.tsx` skeletons (the `Skeleton` component already exists, it's just never mounted at route level).
- **Every page hand-rolls `useState`/`useEffect`/`apiFetch`.** Consequences: no cache (revisiting a page refetches everything), no background revalidation, stale sibling pages after a mutation, and drifting loading/error patterns. Fix: adopt TanStack Query behind the existing `apiFetch` (retry logic stays). Mutation invalidation by entity+domain key replaces ad-hoc `reload()` chains. This is the biggest "feels modern and reliable" upgrade per line of code changed.
- **No optimistic updates** anywhere; every save = spinner + full table reload.
- Idempotency, retry/backoff, drafts, unsaved-work guard: already good — keep.

---

## 6. Finding F4 — the look (current vs proposed)

**Current:** locked palette is right (white, `#2563EB`, hairlines, Inter, tabular numbers) but execution reads flat and utilitarian: 14px page title in the top bar, no elevation scale, no hover affordances on most tables, fixed 240px sidebar that never collapses, no dark mode, no motion, empty vertical rhythm on hub pages.

**Proposed look — "same skeleton, modern skin", all inside the token contract:**

1. **Dark mode now.** Tokens are already CSS variables; add a `.dark` block + toggle in the account menu. Restaurant owners close the day at midnight — this is a real feature, not aesthetics.
2. **Elevation + depth tokens:** `--shadow-card: 0 1px 2px rgb(15 23 42 / .05)`, `--shadow-pop` for menus/drawer. Cards get whisper-depth instead of border-only.
3. **Header hierarchy:** page title 20/28 semibold in the content area (per DESIGN_SYSTEM §3 H2), breadcrumb above, actions right. Top bar keeps only search / Add / review pill / avatar.
4. **Sidebar:** collapsible to icon rail (state in `localStorage`), section counts (already have `NavCountBadge`), active item = blue tint bar. Mobile: slide-over drawer + bottom tab bar (Home · Record · Review · Balances · More).
5. **Tables:** sticky headers, row hover (`bg-muted/40`), whole-row click target opening the drawer, keyboard ↑/↓ + Enter (spec'd in DESIGN_SYSTEM §10, not implemented), amount column tinted green/red by sign.
6. **Status pills everywhere:** posted / needs review / voided / superseded / corrected — one `StatusBadge` vocabulary on every surface (it exists; usage is inconsistent).
7. **Dashboard:** KPI cards with 7-day sparkline + delta chip (↑ 12%), review-queue card with per-type counts, recent entries as drawer-opening rows.
8. **Motion:** 150ms ease on hover/drawer/dialog; skeleton pulse (exists) mounted via route `loading.tsx`. Nothing bouncy.
9. **Turkish first:** the app targets Turkish restaurants and is English-only today. Introduce a minimal dictionary (`next-intl` or even a flat map) starting with nav, statuses, and form labels. Money is already TR-formatted.

---

## 7. Finding F5 — visibility

- Voided/superseded history toggle exists only on ledger surfaces that adopted `ledger-history-toggle`. With P1, the drawer shows chain state everywhere, and every list gets the same "Show history (3 hidden)" affordance from one component.
- **"Was corrected" badge** should ride along on any row whose entry has `was_corrected` — today it's only in detail ledgers.
- **No audit/activity feed.** GL copy admits the immutable audit-events log is deferred. Even before it lands, a lightweight "Activity" page listing recent posts/voids/corrections by user would answer "who changed this?" — the chain data already exists.
- **Notifications icon** from the design spec's top bar was never built; the review pill partially covers it. Fine to defer, but decide.

---

## 8. Missing pieces — full punch list

**Backend prerequisites:** delivery void/correct endpoints; POS day-summary void; POS settlement void; transaction text-search endpoint for ⌘K.

**Platform (build once):** Transaction Drawer + action registry (P1); TanStack Query adoption; route-level `error/loading/not-found`; CounterpartyChip; global history-toggle; `mizan:ledger-changed` event; dark mode tokens; mobile shell.

**Per-page wiring after P1 (each ~small):** dashboard recent entries → drawer; reports/ledger → drawer; bank account detail → drawer; transfers → drawer + void; cards → drawer + void; delivery reports/settlements → drawer + void; close-day history → drawer.

**Polish:** breadcrumbs on detail pages; sticky table headers; keyboard row nav; export buttons on all list pages (report pages have them, list pages don't); print stylesheet for reports; bulk actions beyond statements (e.g., bulk-approve review queue); TR localization pass.

---

## 9. Suggested order (each step ships alone)

1. **P1 registry + drawer**, mounted first on GL + dashboard (no new endpoints needed).
2. Route-level `error.tsx` / `loading.tsx` sweep (pure additions, zero regression risk).
3. Backend void endpoints (delivery, POS) → wire into registry — edit/void is now truly global.
4. TanStack Query migration, one section at a time (start with Review, highest churn).
5. Theme pass: dark mode + elevation + header hierarchy (token file + shell only).
6. Mobile shell + responsive tables.
7. ⌘K transaction search + TR localization.

---

## Limits of this review

Static code review only — not run against live data; role-based rendering and Clerk flows not exercised; accessibility checked structurally (focus rings exist in the kit) but not with a screen reader. FINANCIAL_AUDIT F3 ("voids rewrite historical reports") interacts with making void global: **the more voidable everything becomes, the more you need the as-of/report-snapshot answer** — decide that policy before step 3.
