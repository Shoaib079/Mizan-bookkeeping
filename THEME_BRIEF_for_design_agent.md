# Brief: full design system for a restaurant bookkeeping app

*(Paste this whole brief into a design-focused AI agent — v0, Lovable, or a Cursor/Claude design pass. Attach `Restaurant_Bookkeeping_App_Decisions.md` and `DESIGN_SYSTEM.md` if you have them, for full context.)*

---

You are a senior product designer and front-end engineer. Design a **complete, consistent design system for an entire web application** — not a single dashboard. Apply it across every page type so the whole app reads as one product. Do **not** just design the home/dashboard.

## The product
- A **bilingual (Turkish + English)** bookkeeping/accounting web app for a restaurant business that owns **several separate legal entities** (restaurants), each with completely separate books.
- **Desktop-first** (used for reconciliation), responsive enough for basic upload/review on mobile.
- Tech stack: **Next.js (App Router) + TypeScript + Tailwind CSS + shadcn/ui.** Vendor (own) the components; theme via **design tokens / CSS variables**.
- Study these for layout, flexibility, and tokens: `github.com/arhamkhnz/next-shadcn-admin-dashboard` (Studio Admin), `ui.shadcn.com`, and `tweakcn.com`.

## Look and feel (hard direction)
- Clean, modern, professional — **calm but NOT dull**.
- **Background: PLAIN WHITE. No grey page backgrounds anywhere.** White panels, hairline borders, generous whitespace.
- **One restrained accent colour** (propose 2–3 options; default a refined indigo) used for active nav, primary buttons, charts, and links.
- **Colour carries meaning:** green = confirmed/positive, amber = needs-review/warning, red = negative/danger — mostly as small pills/badges, not big fills.
- **Numbers:** monospaced, tabular figures, **right-aligned**, Turkish format (`1.234,56 ₺`).
- Two font weights only, sentence case (no ALL CAPS).
- Support **dark mode**, plus **theme presets** and **layout controls** (collapsible sidebar, content width) like the reference template.

## Deliver a FULL system (not one page)
1. **Design tokens in one file** — colour palette (incl. semantic colours), typography scale, spacing scale, radius, borders, minimal/flat shadows — delivered as a Tailwind/shadcn theme config and/or CSS variables.
2. **The app shell** — left **sidebar** (grouped nav: Overview · Books · Reports · Settings, plus an **entity/restaurant switcher**, collapsible to icons) + **top bar** (page title/breadcrumb, period selector, global **search / Cmd+K**, primary action button, user avatar).
3. **A reusable component kit**, each with all states (default / hover / focus / disabled / error): button (variants), input, search, **select/combobox picker**, **date picker**, **data table** (sortable, filterable, paginated, dense), form fields + validation, modal/dialog, tabs, **status & confidence badges**, toast/notification, command palette, empty states, loading skeletons.
4. **Example layouts for EVERY page archetype** — all visibly consistent with each other:
   - **Login / auth** (+ 404 / error)
   - **Dashboard / overview** (KPI cards + chart + side panel + table)
   - **List / ledger page** (filters + search + dense table + export) — e.g. payables, suppliers, transactions
   - **Detail / ledger page** (entity header + running ledger table + linked files) — e.g. a supplier
   - **Form / entry page or modal** (manual entry, edit)
   - **Document review screen** (original document preview on one side; extracted fields + confidence indicators + warnings + actions on the other)
   - **Report / financial statement page** (filters + statement layout + export) — e.g. Profit & Loss, Balance Sheet, VAT/KDV
   - **Settings** (profile, users/roles, preferences)
5. **Cross-cutting specs:** the spacing/grid system; responsive behaviour (desktop-first → mobile); accessibility (contrast, visible focus rings, keyboard navigation, ARIA); bilingual layout (Turkish/English text expansion); and **how Turkish number/date formatting lives inside the shared number and date components** so every screen formats money identically.
6. **A short "consistency contract":** one component library, one token file, one app shell, fixed page archetypes — so no page is styled ad hoc and the whole app reads as one product.

## Output format
- A written **design-system spec** (markdown).
- The **theme token file** (Tailwind/shadcn config or CSS variables).
- **Annotated mockups/screens for each archetype** (React/HTML or images).
- Notes on **how to apply it so every future page inherits the system automatically**.

## Hard constraints (do not violate)
- **White background, never grey pages.**
- **Total visual consistency across all pages** — same buttons, tables, pickers, date pickers, spacing, and validation everywhere. It must NOT look like different pages were designed by different people.
- **Design the whole app, not just the dashboard.**
- Keep it flat and clean — no heavy gradients, no drop shadows beyond subtle functional ones.
