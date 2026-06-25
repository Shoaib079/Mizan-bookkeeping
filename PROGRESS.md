# PROGRESS

## Current

| Field | Value |
|-------|-------|
| **Phase** | Phase 10 — pre-launch UX & FX wiring |
| **Active slice** | 10.6 — Inline validation (`DESIGN_SYSTEM.md` §10) |
| **Last completed slice** | Phase 10 Slice 5 — Shared Combobox (`v0.66.4-combobox`) |
| **Branch** | `main` |
| **Last tag** | `v0.66.4-combobox` |

## Resume point

**Phase 9 Slice 8 complete** — Dashboard + reports (frontend only):
- `/` — live dashboard from `GET .../dashboard` (current-month default, date range picker)
- `/reports` — card library with period summary strip
- `/reports/profit-and-loss`, `/reports/balance-sheet`, `/reports/cash-flow`, `/reports/kdv-input`, `/reports/delivery-sales`, `/reports/period-comparison` — read views + single Download dropdown (Excel; PDF on P&L/BS/cash flow)
- `ReportDownloadMenu` — authenticated blob download via `apiDownload` + `Content-Disposition` filename
- 403 → friendly access-restricted message (cashier can't see financials)

**Phase 9 Slice 9 complete** — Settings & onboarding (frontend only):
- `/settings` — hub with cards + informational backup panel (no backup status API)
- `/settings/entity` — create restaurant (`POST /entities`), seed chart, feature toggles (`delivery_enabled`, `card_tips_z_report_enabled`)
- `/settings/opening-balances` — wizard: go-live date, lines (account / bank / supplier / partner / customer), validate → preview journal → post
- `/settings/members` — list/add/change roles (`owner`/`partner`/`cashier`/`partner_view_only`); 403 friendly message
- Link to `/delivery/platforms` from settings hub
- Entity list refreshes after create

**Phase 10 Slice 4 complete** — Focus + Enter-submit audit (frontend only):
- Audited all 31 `components/forms/*`: `<form onSubmit>` + `type="submit"` — no outliers
- Dialog first-field focus via existing `dialog.tsx` (verified)
- Full-page focus: opening balances (go-live on load, amount on Add line), entity create name, receipt/POS/delivery review, statement classify
- Tab order clean — only intentional `tabIndex={-1}` on DateInput calendar button

**Phase 10 Slice 5 complete** — Shared Combobox (frontend only):
- New `combobox.tsx` — type-to-filter, ↑↓ navigate, Enter select, Esc close; token-styled like existing inputs
- Migrated 34 dynamic/long pickers across forms, review screens, opening balances, app-shell entity switcher
- Short static enums kept as native `<Select>` (Dr/Cr, direction, classification, roles, currency, ≤8 expense accounts)

**Next:** Phase 10.6 → 10.8 per `ROADMAP.md`.

**Owner decisions locked in ROADMAP:**
- Dates: typable + **small** calendar (no toggle) — `DESIGN_SYSTEM.md` §10.
- Complete remaining §10: toasts everywhere, combobox pickers, focus/Enter audit, inline validation, autosave/discard confirm.
- FX buy: **cash drawer only** (not bank — bank via statements; not credit card); UI fix + cash movement in **10.8**.
- Delivery nav: **nested under Delivery** (confirmed).

**Do not start Phase 11 (deployment)** until Phase **10.8** complete + owner sign-off on 10.8.

**Phase 9 Slice 10 complete** — Theme refinement + UX polish (frontend only):
- Refined `globals.css` tokens (radius, spacing, focus ring, skeleton animation)
- Custom toast system (`ToastProvider` + `useToast`) — wired on key form POST successes
- `TableSkeleton` / `PageSkeleton` on all `useEntityList` list pages
- Shared `EmptyState` component on list pages
- Cmd/Ctrl-K command palette in app shell (sidebar + New menu routes)
- Dialog: Esc close, focus first field, focus trap; token-based focus rings on Button/Input/Select
- Sticky table headers in `DataTable`

**Phase 9 complete** — owner sign-off pending. **Next:** Phase 10 (pre-launch), then Phase 11 (deployment).

## Verification (2026-06-24)

| Check | Result |
|-------|--------|
| Full pytest | **545 passed**, 2 skipped |
| `npm run build` | **GREEN** |

## Recent

- 2026-06-25 — Phase 10 Slice 4 — focus + Enter-submit audit (`v0.66.3-focus-enter`)
- 2026-06-25 — Phase 10 Slice 3 — shell feedback toasts (`v0.66.2-shell-feedback`)
- 2026-06-25 — Phase 10 Slice 2 — delivery nav nesting (`v0.66.1-delivery-nav`)
- 2026-06-24 — Phase 10 Slice 1 — shared DateInput (`v0.66.0-date-picker`)
- 2026-06-24 — Phase 9 Slice 8 — dashboard + reports UI (`v0.63.0-phase9-dashboard-reports`)
- 2026-06-21 — Phase 9 Slice 6 — staff/partners/receivables/tips UI (`v0.62.0-phase9-staff-partners-receivables`)
- 2026-06-21 — Phase 9 Slice 2d — money-entry UX gaps (`v0.60.1-phase9-slice-2d-money-entry-ux`)
- 2026-06-24 — Phase 9 Slice 5 — POS & delivery sales (`v0.61.0-phase9-pos-delivery-sales`)
- 2026-06-24 — Phase 9 Slice 4 — Banking & cash (`v0.60.0-phase9-banking-cash`)
