# Design System — the locked look (from the approved design sheet)

**Status:** Locked. This file defines the **visual language only** — the look, the structure, the components.
**Important:** We follow the **look and structure** of the approved design sheet ("Restaurant Defteri" style). We do **NOT** copy the placeholder content shown in those mockups (the sample VAT declaration, aging buckets, generic role names, etc.). All accounting *behaviour* comes from `Restaurant_Bookkeeping_App_Decisions.md`; all build rules from `CURSOR_RULES.md`. If look and behaviour ever seem to conflict, behaviour (Decisions) wins — restyle, don't re-spec.

**Build structure first; refine the theme later.** All pages and functionality ship against the current default tokens. The look (colors, fonts, spacing, radius) can be changed or fully replaced afterward by editing **only** the one shadcn/ui token file — zero page rework — as long as pages never hardcode styles.

---

## 0. Copy-paste instructions for Cursor

Use these verbatim when starting UI work or when polishing the look later.

### Standing rule — paste at the **start** of every UI build session

```
Build the whole app using a single theme token file (shadcn/ui tokens) for all colors, fonts, spacing, and radius. Every component and page must read styles from that token file and the shared component library — never hardcode a color or style inside a page. Use the palette and rules in DESIGN_SYSTEM.md as the starting theme. Build all pages and functionality first; we will refine or replace the visual theme later by editing only the token file, with no page changes.
```

### Theme refinement only — paste when improving the look (not structure)

```
Improve only the visual theme — do not change any page logic, layout, or structure. Edit only the design token file (colors, typography, spacing, radius) so the whole app re-skins at once. Keep it clean, modern, professional, white background, blue accent, consistent across every page, per DESIGN_SYSTEM.md. Show me before/after on a couple of pages. Do not hardcode styles in pages; everything stays in the token file.
```

---

## 1. The look in one line

Clean **white** background · rounded white cards with **hairline borders** · **blue** primary accent (medium, not dark) · **Inter** typography · **Lucide** icons · dense, tidy tables with right-aligned **tabular** numbers · bilingual Turkish/English labels · calm, modern, professional.

---

## 2. Colours (exact tokens)

- **Blue `#2563EB`** — primary / accent (active nav, primary buttons, links, charts). A clear medium blue, not too dark.
- **Green `#16A34A`** — success / confirmed / positive.
- **Amber `#F59E0B`** — warning / needs review.
- **Red `#DC2626`** — danger / negative / overdue.
- **Slate `#334155`** — primary text / neutral dark.
- **Background: white `#FFFFFF`** everywhere (page, sidebar, cards). No grey page backgrounds.
- Hairline borders and dividers; muted slate/grey for secondary text and table rules only.

Semantic colours are used mainly as small badges/pills, not large fills.

---

## 3. Typography

- **Font: Inter** (system fallback sans).
- **Heading 1** — 28 / 36, Semi Bold
- **Heading 2** — 20 / 28, Semi Bold
- **Heading 3** — 16 / 24, Semi Bold
- **Body 1** — 14 / 20, Regular
- **Body 2** — 13 / 18, Regular
- **Caption** — 11 / 14, Regular
- Sentence case. **Money/numbers:** tabular figures, right-aligned, Turkish format (`1.234,56 ₺`).

---

## 4. Icons

**Lucide** icon set throughout (outline style), consistent sizing (16–20px inline).

---

## 5. Components (one of each, reused everywhere)

- **Buttons:** Primary (blue filled), Secondary (outline), Ghost, and icon-only (`…`). All with default / hover / focus / disabled / loading states.
- **Inputs:** text input, **search** (icon-leading), **select / dropdown**, **date picker** (click/focus field or trailing calendar icon opens the popover; field stays typable) — all matching height and radius.
- **Badges / status pills:** Approved (green), Needs review (amber), Error / Overdue (red), Draft / Partially paid (slate). Small, rounded.
- **Data table:** dense, sortable headers, hairline row dividers, right-aligned amount columns, row actions (`…`), pagination.
- Plus: modal/dialog, tabs, toast, command palette (Cmd/Ctrl-K), empty states, loading skeletons — all in the same style.

---

## 6. Layout structure (the app shell)

- **Left sidebar (white):** brand/logo at top → **entity (restaurant) switcher** → grouped nav: **Overview**, **Books** (Uploads, Needs review, Sales, Expenses, Suppliers, Payables, Banks, Cards, KDV/Tax …), **Reports**, **Settings**. Collapsible. Active item = blue tint + blue text/icon.
- **Top bar:** page title / breadcrumb · global **search** · date-range / period · primary action (e.g. **Upload**) · notifications · user avatar.
- **Content area:** white, rounded cards and tables with hairline borders, generous spacing.

---

## 7. Page archetypes (every screen is one of these — that's the consistency)

Built and shown in the approved sheet, all visibly identical in style:
1. **Dashboard / Overview** — KPI cards + trend chart + side summary + recent table.
2. **List page** — filters + search + summary strip + dense table (e.g. payables, suppliers, transactions).
3. **Detail / ledger page** — entity header + summary tiles + tabbed running ledger + linked documents.
4. **Document review** — original document preview on one side; extracted fields + confidence + actions on the other.
5. **Reports — card-library layout** (the Reports landing page):
   - **Period summary strip** at the top: the entity + selected date range, then the key figures — **Sales · Expenses · Net result** (NOT COGS — inventory/cost-of-goods is out of scope).
   - **A grid of report cards**, grouped into business-meaningful **categories** (Business overview · Sales · Payables · Receivables · Tax · Banking & cash · Staff · Activity). Each card shows: an icon, the report **title**, a one-line **description**, a **period / date-range badge**, **Open + export** actions (**Excel-first**, PDF on the statements), a **favorite / pin** star, and respects **role-based access** (a cashier shouldn't see the P&L).
   - Every report we listed (Decisions §24) is a card here: P&L, Balance sheet, Sales, Daily expenses, Supplier ledger, Payables, Receivables, Bank transactions, Card transactions, KDV (input VAT from supplier invoices only — no declaration yet), Tax-department payments, Staff/salary, FX ledger, Partner reimbursements, Date-range summary, Needs-review, Full backup.
   - **Accounting corrections vs. the inspiration mockup:** no COGS; the KDV card is **input-VAT-only** (purchase VAT stays separate from tax-authority payments, no VAT declaration in v1); the supplier card is **"Payables — supplier balances"** (running balance, NOT invoice-by-invoice ageing).
   - Opening a card → the **individual report**: filters + a statement/table layout + export.
6. **Settings** — tabbed (users, roles, permissions, general, integrations, backup).

Reuse these for every remaining page (Banking, Cards, Cash & FX, Staff, Customers, Partner reimbursements, Needs-Review queue, manual-entry forms, Login) — no new styles per page.

---

## 8. Presets & layout controls (keep it flexible)

Build on shadcn/ui tokens so the whole app re-skins from **one token file**, and ship the optional theme presets + layout controls (collapsible sidebar, content width, light/dark) — without ever breaking consistency, because every preset shares the same component kit.

**Build the structure first, refine the theme later — fully supported.** Develop all the real pages with the current default theme; the look (colors, fonts, spacing, radius) can be **changed or fully replaced any time afterward by editing the one token file (or pasting a polished one from tweakcn.com)** — with **zero page rework**. The *structure/layout* is the stable part (locked); the *paint* is swappable forever. **This only holds if pages never hardcode colors/styles** — everything must go through the shared components + token file (enforced by `CURSOR_RULES.md`).

---

## 9. The consistency contract

One component library · one token file · one app shell · the fixed page archetypes above. No page is styled ad hoc. The app must read as a single product — never like different pages were designed by different people. (Enforced by `CURSOR_RULES.md` §10.)

---

## 10. Interaction & UX — make it feel like a modern app (LOCKED)

The app must feel fast, keyboard-friendly, and effortless — like a modern product (Stripe / Linear / Notion), never a clunky form you have to click through. These behaviors are **part of the product, not optional polish**, and they're built into the shared components (one date picker, one form, one combobox) so **every screen gets them for free**.

**Keyboard-first (don't make me click everything):**
- **Enter submits** the form / logs you in / saves the entry — fill it out and press Enter, no reaching for the mouse.
- **Tab / Shift-Tab** move between fields in a sensible order; **Esc** closes any dialog or menu.
- **Cmd/Ctrl-K** opens global search / command palette from anywhere.
- The **first field is auto-focused** when a form or the login opens, so you can type immediately.

**Date pickers that actually work:**
- You can **type the date** (`DD.MM.YYYY`) **or** pick it from the calendar — both work.
- **Click or focus the date field** (or the trailing calendar icon) to open the popover; typing still works while it is open.
- Sensible **default** (today, or the document's date); arrow keys move days; **Enter confirms**. Never force a slow click-through-the-months just to enter today.

**Fewer clicks, smart defaults:**
- Pre-fill the obvious: today's date, the current restaurant, last-used account/category, the supplier read from the invoice.
- **Type-to-filter** in every picker (combobox): type "Met" → Metro. No scrolling long lists.
- One-screen flows for simple entries — no needless multi-step wizards.

**Instant, reassuring feedback:**
- **Inline validation as you go** (e.g. "cash + card ≠ total"), in plain language — not a wall of errors after submit.
- **Toasts** confirm saves ("Expense saved"); **loading states / skeletons** show progress; nothing freezes.
- **Don't lose my work:** drafts autosave; confirm before discarding unsaved changes.

**Tables & navigation:**
- **Clickable rows** open the record; keyboard up/down navigates; sortable columns; sticky header; the **top bar stays fixed** and the primary action ("New") is always reachable.

**Touch & accessibility:**
- Works with touch on mobile (upload/review); visible focus rings; proper labels; good contrast.

---

## 11. Reminder

Take the **look, structure, and components** from the approved design sheet. Take the **content, data model, and accounting rules** from `Restaurant_Bookkeeping_App_Decisions.md`. Don't copy placeholder accounting (VAT declaration, aging buckets, generic roles) from the mockups — wire the real behaviour from the Decisions doc instead.
