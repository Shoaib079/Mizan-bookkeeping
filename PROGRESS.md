# PROGRESS

## Current

| Field | Value |
|-------|-------|
| **Phase** | Phase 10 — pre-launch UX & FX wiring |
| **Active slice** | 10.2 — Delivery nav nested under Delivery |
| **Last completed slice** | Phase 10 Slice 1 — Shared `DateInput` (`v0.66.0`) |
| **Branch** | `main` |
| **Last tag** | `v0.66.0-date-picker` |

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

**Phase 10 Slice 1 complete** — Shared `DateInput` (frontend only):
- `components/ui/date-input.tsx` — typable `DD.MM.YYYY` + compact calendar popover (no new npm deps)
- `lib/dates.ts` — calendar helpers + `todayTrDate()`
- Migrated **22** date fields (forms, report range/as-of, opening balances, POS review)
- Default **today** when dialog forms open; POS review pre-fills document date from API

**Next:** Phase 10.2 → 10.8 per `ROADMAP.md` (full `DESIGN_SYSTEM.md` §10 + FX; code audit in ROADMAP).

**Owner decisions locked in ROADMAP:**
- Dates: typable + **small** calendar (no toggle) — `DESIGN_SYSTEM.md` §10.
- Complete remaining §10: toasts everywhere, combobox pickers, focus/Enter audit, inline validation, autosave/discard confirm.
- FX buy: **cash drawer + bank** (not credit card); backend + cash movement fix in **10.8**.
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

- 2026-06-24 — Phase 10 Slice 1 — shared DateInput (`v0.66.0-date-picker`)
- 2026-06-24 — Phase 9 Slice 8 — dashboard + reports UI (`v0.63.0-phase9-dashboard-reports`)
- 2026-06-21 — Phase 9 Slice 6 — staff/partners/receivables/tips UI (`v0.62.0-phase9-staff-partners-receivables`)
- 2026-06-21 — Phase 9 Slice 2d — money-entry UX gaps (`v0.60.1-phase9-slice-2d-money-entry-ux`)
- 2026-06-24 — Phase 9 Slice 5 — POS & delivery sales (`v0.61.0-phase9-pos-delivery-sales`)
- 2026-06-24 — Phase 9 Slice 4 — Banking & cash (`v0.60.0-phase9-banking-cash`)
