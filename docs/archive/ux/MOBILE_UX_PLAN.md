# Mizan — Mobile UX plan (C4)

**Status:** **Built** in Next.js (2026-08-03) — see slice log in `ROADMAP.md`  
**Preview:** open `MOBILE_UX_PREVIEW.html` in a browser  
**Breakpoint:** `820px` — below = mobile shell; at/above = existing desktop sidebar  
**Design tokens:** same as `DESIGN_SYSTEM.md` (no new palette)

---

## 1. Design principles

1. **Five things on thumb reach** — Home, Review, Record (center FAB), Banking, More. **Right now** (payables, receivables, staff, partners) lives on **Home** — same as desktop. Everything else lives under More or drill-in pages.
2. **Feel like a native app, not shrunken web** — grouped lists on a gray shell (`#F2F2F7`), full-screen pushes, bottom sheet modals, no desktop sidebar, no bordered “web cards” on menu screens. Business list pages use white content with card rows; settings/menus use the iOS Settings pattern.
3. **One Settings entry in More** — not three setup rows. Tap **Settings** → full page with Restaurant, Books, Modules, Account, Sign out. Each row drills in or toggles inline.
4. **No sidebar on phone** — More is a **full tab page**. Drill-in pages use **← Back** and hide the tab bar.
5. **Desktop-first for heavy work** — bank reconciliation, wide GL — usable on phone but not the design target.

---

## 2a. Native app vs shrunken web

| Web (avoid on phone) | Native app (target) |
|----------------------|---------------------|
| Fixed sidebar | Bottom tabs + More page |
| Bordered cards on white for menus | Gray shell + inset white groups |
| Data tables with 5+ columns | Card rows, one fact per line |
| Dialogs / modals for forms | Full-screen push with Cancel / Save |
| Right-side transaction drawer | Bottom sheet |
| Multiple “settings” links scattered | **One Settings** in More |
| Desktop page title + breadcrumb in content | Top bar title only; back on drill-in |
| Small click targets | 52px rows, 56px FAB |

---

| Token | Hex | Use on mobile |
|-------|-----|----------------|
| Background | `#FFFFFF` | Tab roots: Home, Record, list content |
| Shell (grouped menus) | `#F2F2F7` | More tab, Settings — native grouped-list background |
| Text primary | `#334155` | Titles, row labels |
| Text muted | `#64748B` | Subtitles, meta |
| Text faint | `#94A3B8` | Section headers, chevrons |
| Primary | `#2563EB` | FAB, active tab, links, primary buttons |
| Primary soft | `#EFF6FF` | Icon chips on More rows, active row tint |
| Success | `#16A34A` | Posted pill, positive amounts |
| Warning | `#B45309` | Needs review pill, review badge |
| Danger | `#DC2626` | Void, negative amounts (contextual) |
| Border | `#E2E8F0` | Cards, dividers, tab bar top |

**Type (Inter):**

| Element | Size / weight |
|---------|----------------|
| Tab screen title | 18px semibold |
| KPI value | 17px semibold tabular |
| Card row title | 13px medium |
| Card row meta | 11px regular |
| More section label | 11px uppercase tracking |
| More row label | 15px regular |
| Bottom tab label | 10px regular (10.5px Record FAB label) |

**Money:** always tabular, Turkish format `1.234,56 ₺`. Positive inflows may use success green on amount only.

**Dates (no future):**

| Rule | Behavior |
|------|----------|
| **Today** | All period labels and sample dates derive from the device clock — updates automatically each day |
| **Default period** | Current month, month-to-date through **today** |
| **Period picker** | Month navigation cannot go past the current month; **future days are disabled** (gray, not tappable) |
| **Posting / recording** | Transaction date defaults to today; `max` = today — no future expenses, sales, or payments |
| **Past months** | Full month selectable for reports and dashboard lookback |

Touch targets and calendar UX match modern banking apps: today highlighted in primary blue, future days visibly disabled.

**Touch:** minimum tap target **44×44px**. Row height ≥ 48px. FAB **56×56px**.

---

## 2b. Responsive — every phone, no fixed width

The mobile UI is **not** tied to iPhone 14 dimensions (390×844). That size appears only in `MOBILE_UX_PREVIEW.html` as a **desktop demo frame** so you can see the mock beside the spec.

| Concern | How we handle it |
|---------|-------------------|
| Different screen widths | Layout uses **100% viewport width** + fluid grids (`1fr 1fr` KPIs, full-width rows). No `width: 390px` in production. |
| Different screen heights | Shell height = **`100dvh`** (dynamic viewport — accounts for mobile browser chrome). Scroll areas use `flex: 1; overflow-y: auto`. |
| Notch / home indicator | **`env(safe-area-inset-*)`** padding on top bar, bottom tab bar, and scroll padding. Viewport meta includes `viewport-fit=cover`. |
| Desktop vs phone | Single **820px breakpoint** — below = bottom tabs + More page; at/above = existing sidebar. Not per-device breakpoints. |
| Small phones (e.g. SE) | Same layout; 2-column KPI grid may feel tighter but stays usable. Long labels truncate with ellipsis. |
| Large phones / phablets | Extra width goes to content — not side margins or a centered phone column. |
| Performance / “lag” | Layout is CSS flex/grid only. Lag comes from heavy JS or network, **not** from matching a specific resolution. |
| Pixel density | Icons and borders use SVG / CSS; `rem` typography scales with user font settings. |

**Real app build (C4):** Tailwind `max-w-*` on desktop content areas only; mobile shell has **no max-width container**. Lists and forms are edge-to-edge with consistent horizontal padding (~14–16px).

---

## 3. Shell layout

```
┌─────────────────────────────┐
│ Top bar (52px)              │  ← title · optional subtitle · review pill · avatar
├─────────────────────────────┤
│                             │
│  Scrollable content         │  ← padding 14px; bottom padding clears tab bar
│                             │
├─────────────────────────────┤
│ Home Review [+] Bal More    │  ← 68px + safe area; Record = raised FAB
└─────────────────────────────┘
```

**Top bar rules:**

| Context | Left | Center | Right |
|---------|------|--------|-------|
| Tab root (Home, Review, Record, Banking, More) | — | Title + entity subtitle | Review count pill (if >0) · **avatar → Your profile** |
| Drill-in from More | **← Back** | Page title | Optional action |
| Form / modal | Cancel or ← | Form title | Save (primary) |

**Bottom tabs:** always visible on mobile (including drill-in pages) so Home / Review / Record / Banking / More are always one tap away. Hidden only on auth routes. Full-screen forms and the transaction sheet overlay the bar.

**Search:** no wide search pill on mobile top bar. Entry points: Review hub, list pages (inline search field), future ⌘K as bottom sheet search.

---

## 4. Bottom navigation

| Tab | Icon | Role |
|-----|------|------|
| **Home** | grid | Dashboard — period KPIs, **Right now** balances, recent entries |
| **Review** | checkmark | Queue — bank, invoices, sales, receipts (badge = total) |
| **Record** | **+ FAB** (center) | Record desk — photo, sales, cash, people (primary action) |
| **Banking** | building | Accounts, transfers, cash drawer — cards & FX |
| **More** | grid/menu | **Full page** — everything not in tabs |

Record FAB: `#2563EB` circle, white `+`, 3px white ring, shadow `0 4px 16px rgb(37 99 235 / 45%)`, sits **22px above** tab bar.

---

## 5. More page (full screen — not a drawer)

Structure (top → bottom):

1. **Entity card** — restaurant name; tap → switch restaurant sheet  
2. **Money in** — Sales · Delivery · Customers  
3. **Money out** — Suppliers · Staff · Partners  
4. **Money held** — Banking · Card clearing · Cash & FX  
5. **Understand** — Reports (hub)  
6. **Settings** — **single row** → Settings page (§5a)

No Sign out on More — it lives inside Settings. No separate Setup section.

Visual: gray shell background, white rounded groups, 52px rows, 16px labels, chevron ›.

---

## 5a. Settings page (one drill-in from More)

Grouped like iOS Settings — same gray shell + white groups:

| Section | Rows |
|---------|------|
| **Restaurant** | Company profile · Team |
| **Books** | Opening balances |
| **Modules** | Delivery · Card clearing · FX — **inline toggles**, no sub-page |
| **Account** | Backups |
| **Sign out** | Destructive centered row |

Each chevron row pushes a **full-screen form page** (Cancel / Save top bar) — not desktop-style stacked sections on one long web page.

**Your profile** is **not** in Settings — tap the **avatar (top-right)** on any tab root to open `/settings/profile` (name, email, save).

Team on mobile: one card per member (not a clipped table).

Delivery module rows on More hidden when toggle off (same as desktop).

---

## 6. Page-by-page spec

### Tab roots

#### Home (`/`)
- 2×2 KPI grid: Net result · Cash+bank · Sales · Needs review  
- **Right now** section — same cards as desktop (payables, receivables, staff, partners, FX)  
- Panel “Recent entries” — card rows → transaction bottom sheet  
- Link “See all” → General ledger (More → Reports)

#### Review (`/review`)
- 2×2 queue tiles: Bank · Invoices · Sales · Other (counts)  
- Tap tile → existing review sub-routes (`/review/bank`, etc.) as drill-in with back  
- Bank line cards: description · amount · Classify CTA

#### Record (`/record`)

**Goal: fewer taps** — form on the same tab, not a menu that pushes another page.

- **Horizontal chips** (scroll): Sales · Expense · Receipt · Salary · FX · Cash — one tap switches the inline form below (same pattern as desktop Record desk sidebar)
- **Default chip:** Sales (most daily action) — land on Record tab → form already visible → fill → **Post**
- **Receipt chip:** large camera target — opens capture immediately (not a list item that navigates away)
- **Date fields:** pre-filled with **today**, read-only or max=today
- **Posted today** strip under form — confirms what went out today without leaving the tab
- **More actions** collapsed — supplier pay, partner, upload, close day (less frequent, one extra tap to expand)

**Clicks comparison (daily sales):**

| Old | New |
|-----|-----|
| Record tab → Sales tile → full-screen form → Post (3 taps + navigation) | Record tab → form already there → Post (1 tap) |

Optional v2: FAB **long-press** → jump straight to receipt camera from any tab.

Tap chip → inline form swaps; primary actions never push a separate menu page.

#### More (`/more` — new route alias, mobile-only shell section)
- Spec in §5 above  
- No sidebar, no hamburger

---

### Drill-in lists (from More or Home Right now)

**Shared list pattern:**

- Sticky subheader: search field (44px) + optional filter chips  
- Summary strip if applicable (e.g. total payables)  
- **Card rows** instead of table:

```
┌────────────────────────────────────┐
│ Metro Toptan              −23.400 ₺│
│ Active · last 08.07.2026           │
└────────────────────────────────────┘
```

- Tap row → detail page  
- Pagination: “Load more” button (not tiny prev/next)  
- Export: icon in top bar → share sheet / download

| Page | Route | Mobile notes |
|------|-------|--------------|
| Sales | `/sales` | Filter chips All / Needs review / Posted; card per day |
| Delivery | `/delivery` | Hub cards: Platforms · Reports · Settlements |
| Customers | `/customers` | Balance column “owed to you” in green |
| Suppliers | `/suppliers` | Total payables card at top |
| Staff | `/staff` | Net balance column |
| Partners | `/partners` | Net position column |
| Banking | `/banking` | Account cards → activity (card rows) |
| Card clearing | `/cards` | Summary + settlement cards |
| Cash & FX | `/banking/cash`, FX routes | Wallet cards |

---

### Detail pages (partner, supplier, staff, customer, bank account)

- **Header card:** name · status pill · key balance (large tabular)  
- **Actions row:** Edit name · Record payment · … (horizontal scroll chips if many)  
- **Ledger:** card rows (date · description · amount · status) · toggle “Show history”  
- Tap ledger row → transaction bottom sheet  
- **No** wide multi-column tables

---

### Reports hub (`/reports`)

- Period summary card at top (Sales · Expenses · Net · FX) — skeleton while loading  
- **Download** in sticky header — download icon + “Download” label; exports Excel/PDF for selected period (share sheet on phone)  
- **Card grid** (1 column on phone): P&L · Balance sheet · Cash flow · GL · Bank recon · Month close · …  
- Each card: icon · title · one-line description · tap → report page  
- Per-report export on individual report pages: sticky footer “Download Excel / PDF” (same icon)

**More page:** single **Reports** row under Understand — no Download on More; download lives only inside Reports.

Report pages: filters collapse to vertical stack; statement tables → card rows or horizontal scroll only when unavoidable (discourage).

---

### Settings (`/settings` mobile hub → `/settings/restaurant` etc.)

- **Not** the desktop long-scroll settings page on phone  
- Entry: More → **Settings** (one row)  
- Hub: grouped list (§5a)  
- Drill-ins: full-screen pages per concern (company form, team list, opening balances wizard)  
- Modules: toggles on the hub — instant save, no separate page

---

### Forms (Record flows)

- **Full screen** with top bar Cancel | Title | Save  
- First field auto-focused; numeric keyboard for amounts  
- Date: native-friendly picker + typed `DD.MM.YYYY`  
- Receipt photo: camera capture prominent; gallery second  
- Duplicate guard: bottom sheet confirm  
- Success: toast + navigate back to origin tab

---

### Transaction peek

- **Bottom sheet** (max 88% height), not right drawer  
- Handle bar · amount · description · status pills  
- Journal lines in bordered list  
- Correction chain as links  
- Footer: Duplicate · Edit · Void (44px buttons)  
- Backdrop tap dismisses

---

## 7. What stays desktop-first (usable but not optimized)

- Bank reconciliation wide grid  
- Month-close long checklist (scroll ok)  
- General ledger with many columns (expand row for lines)  
- Bulk statement classify (reduce to single-line flow on phone v2)  
- Excel-style pivot reports

---

## 8. Navigation map

```
[Tabs]
  Home ───────────────────────────── Dashboard + Right now → directories
  Review ─────────────────────────── Queue → sub-review pages
  Record (FAB) ───────────────────── Record desk → forms
  Banking ────────────────────────── Accounts · transfers · cash drawer
  More ───────────────────────────── §5 menu page
        ├─ Sales, Delivery, Customers
        ├─ Suppliers, Staff, Partners
        ├─ Banking, Cards, Cash/FX
        ├─ Reports hub → individual reports
        └─ Settings → company · team · opening balances · modules · backups · sign out

Avatar (top-right on tab roots) → Your profile

[Drill-in stack]
  More → Suppliers → Metro detail → (transaction sheet)
  Back pops one level; tab switch resets stack to tab root
```

---

## 9. Implementation slices (when building)

| Slice | Deliverable |
|-------|-------------|
| **C4.1 Shell** | Breakpoint hook · bottom tabs · FAB · hide desktop sidebar · `/more` route |
| **C4.2 More page** | Grouped list component · entity switcher · wire all links |
| **C4.3 Card rows** | `MobileDataList` replaces `DataTable` under 820px on list pages |
| **C4.4 Transaction sheet** | Bottom sheet variant of transaction drawer |
| **C4.5 Record full-screen** | Forms as pages not dialogs on mobile |
| **C4.6 Polish** | Safe areas · loading skeletons · tab badges · back stack |

Promote to `ROADMAP.md` / Decisions when owner approves build order.

---

## 10. Files

| File | Purpose |
|------|---------|
| `MOBILE_UX_PREVIEW.html` | Interactive phone mock — tabs, More page, drill-in, FAB |
| `MOBILE_UX_PLAN.md` | This document |
| `DESIGN_SYSTEM.md` | Locked colors & components |
| `FRONTEND_AUDIT_FINAL.md` § C4 | Original audit item |
