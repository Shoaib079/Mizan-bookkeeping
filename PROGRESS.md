# PROGRESS

**Handoff:** Read the **Current** table below only for active work. Older sections are history. **Git + last tag win** over uncommitted doc edits. **One agent per active slice.**

## Current

| Field | Value |
|-------|-------|
| **Phase** | Phase 11 — Pre-go-live product fixes |
| **Active slice** | **11.10** — Posted expense correction |
| **Last completed slice** | Phase 11 Slice 11.9 — correct posted daily sales (`v0.69.0-correct-daily-sales`) |
| **Branch** | `main` |
| **Last tag** | `v0.69.0-correct-daily-sales` |

## Resume point

**Phase 11 Slice 11.9 complete** — correct posted daily sales (`v0.69.0-correct-daily-sales`):
- `correct_pos_daily_summary()` — voids linked card batch JE + cash movement JE (with cash reversal), reposts via shared confirm path
- `POST .../pos/daily-summaries/{id}/correct` + `CorrectPosDailySummaryRequest` (confirm shape + reason/period_unlock_reason)
- Frontend: `correct-daily-sales-form.tsx`; `/sales` posted rows → **Correct** dialog (pre-filled, idempotency key)
- Tests: `test_pos_daily_summary_correct.py` (5 tests — amounts, date, non-posted 409, duplicate date 422, period lock)
- **568 pytest green**; frontend build green
- **Owner sign-off: PENDING** (money-critical)

**Next:** Phase 11 Slice 11.10 — expense correction HTTP + UI.

**Phase 10 complete** — all slices 10.1–10.8 done (`v0.67.0`). **Slice 10.8 owner sign-off: APPROVED (2026-06-25).**

**Phase 11 Slice 11.1 complete** — default cash drawer on chart seed (`v0.68.0-default-money-accounts`):
- `ensure_default_cash_drawer()` after `seed_chart_for_entity()` — one TRY `"Main Drawer"` unless CASH exists
- Banking page hint when cash branch empty; opening balances default bank/cash line to main drawer
- Tests: `test_default_cash_drawer_onboarding.py` (4 tests)

**Phase 11 Slice 11.2 complete** — editable feature toggles (`v0.68.1-entity-settings-editable`):
- `PATCH /entities/{id}/settings/{key}` + duplicate POST → 409
- Frontend post-create wizard step 2 (toggles + Save & continue); settings page toggles always editable
- Tests: `test_entity_settings.py` (6 tests)

**Phase 11 Slice 11.3 complete** — numeric-only money inputs (`v0.68.2-money-input`):
- `MoneyInput` component — `inputMode="decimal"`, sanitizes keystrokes/paste, optional TRY preview
- Strict `parseTryToKurus` + `sanitizeTryInput` — integer kuruş, rejects garbage (no parseFloat corruption)
- Migrated all TRY amount fields: manual expense/sales, POS/delivery/receipt review, payments, transfers, cash movement, opening balances, FX, delivery amounts, and related forms
- Vitest: `money.test.ts` (7 tests)

**Phase 11 Slice 11.19 complete** — stable idempotency keys (`v0.69.10-stable-idempotency-key`):
- `useSubmitIdempotency()` — `beginSubmit()` stable per intent, `completeSubmit()` after success, `resetSubmit()` on dialog open
- Removed `api.ts` per-call `randomUUID()` auto-gen; callers pass explicit `idempotencyKey`
- Wired 39 mutation surfaces (all money forms + review confirms + statement classify + opening balances)
- Vitest: `use-submit-idempotency.test.ts` (3 tests); backend: `test_client_retry_contract_reuses_one_key_not_two`
- **Owner sign-off: PENDING** (money-critical)

**Next:** Phase 11 Slice 11.20 — see `ROADMAP.md` Phase 11. Full plan in `ROADMAP.md` Phase 11 (slices 11.4–11.12, 11.20). Deployment is **Phase 12**.

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

**Phase 10 Slice 6 complete** — Inline validation (frontend only):
- New `validation-hint.tsx` — shared `error` / `hint` / `warning` tones per `DESIGN_SYSTEM.md` §10
- Live hints + submit guard on money-critical forms: manual daily sales, POS summary review, delivery report, opening balances, transfer, cash movement, supplier/customer payment
- Server `setError` on submit unchanged; obvious invalid states disable submit while editing

**Phase 10 Slice 7 complete** — Autosave + discard confirm (frontend only):
- New `form-draft.ts` — `useFormDraft` hook with entity-scoped localStorage keys (`mizan:draft:{entityId}:{formKey}`), debounced autosave, resume prompt
- `Dialog` extended with `dirty` + `onDiscard` — Esc/backdrop/X confirm before closing
- `ResumeDraftBanner` — one-time “Resume draft?” on reopen
- Wired: `manual-expense-form` (dirty confirm + draft), `opening-balances` (wizard lines draft), `receipt-review` (line edits draft, cleared on confirm POST)

**Phase 10 Slice 8 complete** — FX purchase cash drawer only (money-critical):
- `post_fx_purchase()` records `CashMovement` OUT on same `journal_entry_id` (drawer session auto-opens)
- `correct_fx_purchase()` voids/reposts linked cash movements (IN reversal + OUT on corrected entry)
- `fx-purchase-form.tsx` — cash accounts only; label “Pay from cash drawer”; bank fetch removed
- Tests: extended `test_fx_purchase_posts_dr_fx_cr_try_cash`; `test_fx_purchase_cash_movement_visible_on_drawer_session`; `test_fx_purchase_correct_voids_and_reposts_cash_movement`; bank rejection kept
- **Owner sign-off on 10.8: APPROVED (2026-06-25)** (money-critical gate)

**Owner decisions locked in ROADMAP:**
- Dates: typable + **small** calendar (no toggle) — `DESIGN_SYSTEM.md` §10.
- Complete remaining §10: toasts everywhere, combobox pickers, focus/Enter audit, inline validation, autosave/discard confirm.
- FX buy: **cash drawer only** (not bank — bank via statements; not credit card); UI fix + cash movement in **10.8**.
- Delivery nav: **nested under Delivery** (confirmed).

**Do not start Phase 12 (deployment)** until Phase 11 pre-go-live slices are complete per `ROADMAP.md`.

**Phase 9 Slice 10 complete** — Theme refinement + UX polish (frontend only):
- Refined `globals.css` tokens (radius, spacing, focus ring, skeleton animation)
- Custom toast system (`ToastProvider` + `useToast`) — wired on key form POST successes
- `TableSkeleton` / `PageSkeleton` on all `useEntityList` list pages
- Shared `EmptyState` component on list pages
- Cmd/Ctrl-K command palette in app shell (sidebar + New menu routes)
- Dialog: Esc close, focus first field, focus trap; token-based focus rings on Button/Input/Select
- Sticky table headers in `DataTable`

## Verification (2026-06-25)

| Check | Result |
|-------|--------|
| Slice 11.1 tests | **4 passed** (`test_default_cash_drawer_onboarding.py`) |
| Chart + seed API tests | **6 passed** (`test_chart_of_accounts.py`) |
| Full pytest | **549 passed**, 2 skipped (545 baseline + 4 new) |
| `npm run build` | **GREEN** |

## Recent

- 2026-06-25 — Phase 11 Slice 11.1 — default cash drawer on chart seed (`v0.68.0-default-money-accounts`)
- 2026-06-25 — Phase 10 Slice 10.8 owner sign-off APPROVED
- 2026-06-25 — Phase 10 Slice 3 — shell feedback toasts (`v0.66.2-shell-feedback`)
- 2026-06-25 — Phase 10 Slice 2 — delivery nav nesting (`v0.66.1-delivery-nav`)
- 2026-06-24 — Phase 10 Slice 1 — shared DateInput (`v0.66.0-date-picker`)
- 2026-06-24 — Phase 9 Slice 8 — dashboard + reports UI (`v0.63.0-phase9-dashboard-reports`)
- 2026-06-21 — Phase 9 Slice 6 — staff/partners/receivables/tips UI (`v0.62.0-phase9-staff-partners-receivables`)
- 2026-06-21 — Phase 9 Slice 2d — money-entry UX gaps (`v0.60.1-phase9-slice-2d-money-entry-ux`)
- 2026-06-24 — Phase 9 Slice 5 — POS & delivery sales (`v0.61.0-phase9-pos-delivery-sales`)
- 2026-06-24 — Phase 9 Slice 4 — Banking & cash (`v0.60.0-phase9-banking-cash`)
