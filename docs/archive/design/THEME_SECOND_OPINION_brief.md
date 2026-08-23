# Brief: independent design direction for a bookkeeping app (second opinion)

*(Paste this into a design-focused AI agent. The point is a FRESH, INDEPENDENT design opinion — we are deliberately giving NO guidance on colour, layout, typography, or visual style. Propose your own.)*

---

You are a senior product designer. Propose a **complete, original design system** for the web application described below. **Make your own creative decisions** on colour, typography, layout, visual style, density, shape, and patterns — we are intentionally giving you no aesthetic direction and no reference. Treat this as a blank-canvas second opinion. If useful, present **2–3 distinct directions** with a short rationale for each, then recommend one.

Design the **whole application** — every page type — not just a dashboard. It must read as one coherent product.

## What the product is (context only — not styling guidance)
- A **bilingual (Turkish + English)** bookkeeping / accounting web app for a restaurant business that owns **several completely separate legal entities** (restaurants), each with its own books.
- Used **daily for data entry and reconciliation** by a **non-technical owner**, business partners, and a cashier (limited access). It is an internal tool, not a public marketing site.
- **Desktop-first** (reconciliation needs a large screen); basic upload/review should also work on mobile.
- It handles uploaded documents (invoices, bank/card statements, receipts, handwritten daily sheets), extracts data with AI/OCR, and routes anything uncertain to a human review queue.
- Built on **Next.js + Tailwind + shadcn/ui** (so the theme is token-driven and themeable) — but you are free to define the entire visual direction.

## Cover the full system
1. **Design rationale** — the idea behind your direction and why it suits a finance tool used for hours a day.
2. **Design tokens** — your colour system, typography, spacing, radius, etc., in one place.
3. **App shell** — navigation for many sections, plus a switcher for the separate entities/restaurants.
4. **Component kit** — buttons, inputs, search, pickers/dropdowns, date picker, data tables, badges/status indicators, modals, tabs, toasts, command palette, empty states, loading states (with all interaction states).
5. **Every page archetype**, shown and visibly consistent:
   - Login / auth (+ error)
   - Dashboard / overview
   - List page (filters + search + data table) — e.g. a list of supplier balances or transactions
   - Detail / ledger page (entity header + a running ledger table + linked documents) — e.g. one supplier
   - Form / data-entry page or modal
   - Document review screen (original document on one side; extracted fields, confidence, warnings, and actions on the other)
   - Report / financial statement page (with export)
   - Settings (users, roles, preferences)
6. **Dark mode**, **accessibility** (contrast, focus, keyboard, ARIA), and **responsive** behaviour.

## Functional needs (these are about usability, not look — honour them however you choose)
- **Total visual consistency across every page** — it must not look like different pages were designed by different people.
- **Dense, highly scannable tables** — this is an accounting tool; people compare many rows and amounts quickly.
- **Money and numbers must be easy to read and compare**, and must display in **Turkish format** (e.g. `1.234,56 ₺`).
- **Clear, distinct states** for records that are confirmed, need review, are warnings, or are errors.
- **Bilingual** Turkish/English labels.
- Forms should be simple and hard to misuse.

## Deliverables
- A written design-system spec, your token file, and annotated mockups for **every page archetype** above.
- A short explanation of how the system keeps every future page automatically consistent.

Surprise us with a strong, professional point of view. Don't ask us for colour or style preferences — decide, and justify your decisions.
