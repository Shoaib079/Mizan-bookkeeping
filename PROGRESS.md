# PROGRESS

**Handoff:** Read the **Current** table below only for active work. Older sections are history. **Git + last tag win** over uncommitted doc edits. **One agent per active slice.**

## Current

| Field | Value |
|-------|-------|
| **Phase** | Phase 12.5 — Nav cleanup, bank import (Turkish) & statement learning (owner-driven, pre-launch) |
| **Active slice** | — (Phase 12.5 arc complete; **owner sign-off ✓** on `v0.72.0-clearance-auto-pick`) |
| **Last completed slice** | Clearance auto-pick — POS/delivery settlement link-only auto-clear (`v0.72.0-clearance-auto-pick`) ✓ signed off |
| **Branch** | `main` |
| **Last tag** | `v0.72.0-clearance-auto-pick` |

## Owner blockers (12.5)

Owner must confirm before storing real people's data (not automatable in CI):

- Review `DEPLOY.md` §14 **KVKK conscious decision** — encryption at rest, backup bucket access, data-deletion path.
- Run `security_dependency_scan.sh`, `security_secrets_audit.sh`, `security_production_pytest.sh` locally if not relying on CI alone.

**Auto-seed chart on restaurant create complete** (`v0.71.6-auto-seed-chart`):

- `create_entity` atomically provisions default chart + Main Drawer; idempotent seed API kept without UI trigger
- Expense categories 5210–5270 added; 5200 = Genel Giderler; no 5700
- Seed buttons/hints removed; onboarding checklist → opening balances → invite staff → first day
- 615 pytest green; frontend build green

## Owner blockers (12.4)

Owner must wire on host dashboards (not automatable in CI):

- Create Sentry project; set `SENTRY_DSN` on Render **mizan-api** (see `DEPLOY.md` §12).
- Enable Render service unhealthy + deploy failure notifications.
- Optional external uptime monitor on `GET /health/ready`.

## Owner blockers (12.3)

Owner must run against their staging/prod hosts (not automatable in CI):

- Provision Postgres/Redis/Render/Netlify (Slice 12.1 scaffolding).
- Run `backend/scripts/migrate_production.sh` and `verify_production_db.sh` with real `DATABASE_URL` / `DATABASE_ADMIN_URL`.
- Run `scripts/smoke_staging.sh` against deployed staging API before production cutover.
- Flip Clerk live keys on Render + Netlify for production — API guard blocks `sk_test_` / `pk_test_` when `APP_ENV=production`.
- **Staging backup drill:** `backend/scripts/run_backup_drill.sh` (or verify after scheduled beat) per `DEPLOY.md` §11 before trusting prod backups.

## Resume point

**Owner sign-off ✓ (2026-06-28)** — clearance auto-pick (`v0.72.0-clearance-auto-pick`). **677 pytest green** at sign-off. **Next:** Phase 12 production go-live (migrations `052`–`055`, provision hosts, backup-restore drill, first real restaurant walkthrough).

**`v0.72.0-clearance-auto-pick` committed** — HIGH-confidence rules auto-**link** (never create) `pos_settlement` / `delivery_settlement` inflows when exactly one unused settlement record matches amount+date; zero or multiple → Needs Review; delivery platform resolved by unique match across entity platforms; `classification_source=rule_auto`. **677 pytest green** (+6); **144 vitest**.

**Phase 12.5 bank import + learning arc (`v0.71.9`–`v0.72.0`):**
- `v0.71.9` — nav consolidation (section tabs, reports/settings card hubs)
- `v0.71.10` — single-item sidebar groups → direct links
- `v0.71.11`–`v0.71.12.1` — Excel/.xls import, lira amount column, Turkish CSV encoding/delimiter
- `v0.71.13` — column-mapping profiles per bank account
- `v0.71.14` — per-entity classification learning (suggest + learn-on-confirm)
- `v0.71.15` — rule auto-apply at HIGH confidence (reversible, entity-isolated)
- `v0.71.16` — unified statement review hub (`/banking/review`)
- `v0.71.17` — `match_token` trim on classify/correct + gitignore `*.tsbuildinfo`
- `v0.72.0` — clearance auto-pick (POS/delivery settlement link-only, rule+unique-match gating)

**Phase 12 Slice 12.6 complete** — owner onboarding & smoke test (`v0.71.8-owner-onboarding-smoke`):
- `scripts/smoke_onboarding.sh` — entity → OB → member → expense → P&L
- `DEPLOY.md` §15 owner walkthrough; dashboard create-restaurant CTA
- **617 pytest green** (+2); frontend build green

**Phase 12 Slice 12.5 complete** — pre-launch security pass (`v0.71.4-prelaunch-security`):
- `security_dependency_scan.sh` (pip-audit prod deps), `security_secrets_audit.sh`, `security_production_pytest.sh`
- CI: dependency scan + secrets audit + production guard pytest before full pytest
- `DEPLOY.md` §14 — secrets checklist, KVKK conscious decision, pre-go-live gate
- **611 pytest green**

**Phase 12 Slice 12.4 complete** — observability (`v0.71.3-observability`):
- Optional Sentry (`SENTRY_DSN`), JSON production logs, request logging middleware
- In-memory rate limit 60/min per IP (production); health/docs exempt
- `DEPLOY.md` §12 — Sentry, uptime, Render alerts owner runbook
- **611 pytest green**

**Phase 12 Slice 12.3 complete** — backup restore drill (`v0.71.2-backup-restore-drill`):
- `backend/scripts/verify_backup_restore.sh`, `run_backup_drill.sh`
- CI `postgresql-client` so restore tests run in pipeline
- Celery `run_daily_backup` failure/success logging
- `DEPLOY.md` §11 + `OPS_RESTORE.md` owner drill runbook
- **605 pytest green**

**Next:** Phase 12 Slice 12.4 — observability (error monitoring before go-live).

**Phase 12 Slice 12.2 complete** — production provisioning (`v0.71.1-prod-provisioning`):
- `run_production_migrations()` + `verify_production_database()` in `provisioning.py`
- `backend/scripts/migrate_production.sh`, `verify_production_db.sh`
- `GET /health/ready`; `scripts/smoke_staging.sh`
- Render `preDeployCommand`; launch guards (Clerk live keys, CORS)
- `DEPLOY.md` Slice 12.2 runbook
- **605 pytest green** (+9)

**Phase 12 Slice 12.1 complete** — hosting & infrastructure scaffolding (`v0.71.0-hosting-infrastructure`):
- `netlify.toml` (frontend base, security headers, optional API proxy)
- `backend/Dockerfile` (multi-stage uvicorn + postgresql-client)
- `render.yaml` (web + Celery worker + beat; persistent disk; `/health`)
- `CORS_ORIGINS` env — comma-separated; default localhost; `test_cors_config.py` (4 tests)
- `.env.production.example`, `DEPLOY.md` (owner provisioning guide; staging-first)
- **596 pytest green**; frontend build green; **84 vitest**

**Next:** Phase 12 Slice 12.2 — production provisioning (alembic migrate, Clerk prod keys, staging smoke — do NOT skip staging).

**Phase 12 Slice 0c complete** — member add-by-email (`v0.70.3-member-add-by-email`):
**Phase 12 Slice 0c complete** — member add-by-email (`v0.70.3-member-add-by-email`):
- `POST /entities/{id}/members` accepts `email` (+ optional `display_name`) or legacy `user_id`; `invite_member_by_email` reuses existing user or creates one, then membership
- Friendly 409: "Already a member of this restaurant."
- `member-form.tsx`: single POST; toast "Added [email] as [role]"
- Tests: `test_add_member_by_email_*` (3) in `test_roles_permissions.py`

**Next:** Phase 12 Slice 12.1 — hosting & infrastructure.

**Phase 12 Slice 0b complete** — account menu + restaurant switch safeguards (`v0.70.2-restaurant-switcher-safeguards`):
- Top-right `AccountMenu` (avatar + active-restaurant badge trigger): display name + email from `/users/me`, role-gated settings links, Clerk sign-out
- Restaurant switching moved from sidebar combobox to account menu with confirm dialog + unsaved-work guard; always-visible entity badge in top bar
- `RecordingForBanner` on New-menu entry dialogs; toast after switch
- Vitest: `entity-visual.test.ts` (5), `account-menu-helpers.test.ts` (6), `unsaved-work.test.ts` (3), `app-routes.test.ts` (+6)

**Next:** Phase 12 Slice 12.1 — hosting & infrastructure.

**Phase 12 Slice 0a complete** — UX refinements (`v0.70.1-ux-refinements`):
- Top bar: removed Daily sales + Add expense quick-action buttons (Search/Cmd+K + UserButton only)
- New menu: removed Cash tip + Card sales batch; command palette entries trimmed
- Tips de-special-cased: dropped `5700` from default chart (migration `051`); expense pickers use full expense chart via `expense-accounts.ts`
- Vitest: `app-routes.test.ts` (+2), `expense-accounts.test.ts` (4)

**Next:** Phase 12 Slice 12.1 — hosting & infrastructure.

**Phase 12 Slice 12.0 complete** — pre-launch UX (`v0.70.0-prelaunch-ux`):
- Sidebar regrouped: Sales, Expenses & suppliers, People, Customers, Cash & bank, Reports (nested GL + manual journals), Settings (three sub-pages)
- Dashboard onboarding checklist — chart, OB, invite staff (admin), first day; dismissable; role-gated
- Vitest: `app-routes.test.ts` (8), `onboarding.test.ts` (9)
- **591 pytest green**; frontend build green; **54 vitest**

**Next:** Phase 12 Slice 12.1 — hosting & infrastructure.

- `DESIGN_SYSTEM.md` §5/§10 + ROADMAP 10.1 note updated (amends v0.66.0 icon-only)
- **588 pytest green**; frontend build green; **16 vitest**
- Frontend-only — no backend changes

**Phase 11 Slice 11.16 complete** — general ledger report (`v0.69.7-ledger-report`):
- Expanded `/reports/ledger` — date range, description search, source/status filters, pagination (50/page)
- Expandable row detail: GL lines with chart account labels, amend/void chain links, Correct for manual/bank_fee
- Reports landing card + sidebar: "General ledger (all entries)"; `ForbiddenMessage` on 403
- Distinct copy from deferred audit-events log; link to Manual journals for void
- **588 pytest green**; frontend build green; **16 vitest**
- Frontend-only — no backend changes

**Phase 11 Slice 11.15 complete** — day close-out screen (`v0.69.6-day-closeout`):
- Frontend `/close-day` — one date, sales (cash/card/Z/drawer), dynamic expense rows; period unlock + stable idempotency key
- Nav: Books sidebar, New → Operations, dashboard **Close day**
- Nested `entity_context` GUC restore fix; `confirm_pos_daily_summary(commit=False)`; expense `period_unlock_reason`
- **588 pytest green** (+6); frontend build green; **16 vitest**
- **Owner sign-off: APPROVED (2026-06-27)** (money-critical)

**Next:** Phase 11.16 — general ledger / all-entries report page (backend `GET .../ledger/entries` exists).

**Phase 11 Slice 11.14 complete** — new menu UX (`v0.69.5-new-menu-ux`):
- `QuickActionsProvider` — shared dialog state for New menu, top bar, dashboard
- Grouped New dropdown (Sales / Expenses / Suppliers); dismiss on outside click + Escape
- Top bar + dashboard **Daily sales** / **Add expense** one-click buttons
- Shared `useDismissOnOutsideClick`; command palette + Combobox refactored
- `delivery_enabled` gates delivery nav, command palette, and New menu item
- Manual daily sales uses `defaultMainDrawerId()`; entity toggles verified on settings page
- **582 pytest green**; frontend build green

**Next:** Phase 11.15 — day close-out screen (optional; owner confirms scope).

**Phase 11 Slice 11.13 complete** — cash drawer optional session + owner reopen (`v0.69.4-cash-drawer-optional-session`):
- Migration `050`: nullable `cash_movements.session_id`; drawer reopen fields; `cash_drawer_audit_events`
- Posting no longer auto-opens sessions; closed day uses period-lock pattern (`period_unlock_reason` / reopen endpoint)
- API: `POST .../drawer-sessions/close-day`, `POST .../{id}/reopen`
- Frontend: period unlock on cash movement; Reopen + Close drawer day on `/banking/cash`
- **582 pytest green** (+3); frontend build green
- **Owner sign-off: APPROVED (2026-06-27)** (money-critical)

**Phase 11 Slice 11.12 complete** — remaining dedicated correction HTTP APIs (`v0.69.3-correction-apis`):
- POST routes: supplier invoice, credit sale, staff/partner ledger, FX conversion/spend (`/fx/ledger/{id}/correct`)
- Tests: `test_correction_apis_phase11.py` (7 tests)
- Frontend Correct dialogs on supplier/customer/staff/partner/FX detail ledgers; period unlock via shared hook
- **579 pytest green** (+7); frontend build green
- **Owner sign-off: APPROVED (2026-06-27)** (money-critical)
- **Known gap:** staff payment with advance applied → 422 (needs dedicated flow)

**Phase 11 Slice 11.11 complete** — correction UI + period unlock retry (`v0.69.2-correction-ui`):
- Shared `period-unlock.ts` + `usePeriodUnlockSubmit()` — 422 period lock → owner unlock dialog → retry with `period_unlock_reason`
- Correction forms: supplier payment, customer payment, FX purchase, ledger entry (manual/bank_fee); void manual journal dialog
- Pages: `/accounting/manual-journals` (void), `/reports/ledger` (correct manual/bank_fee)
- Entry points: Correct on supplier/customer payment rows, FX purchase rows; 11.9/11.10 forms updated
- Vitest: `period-unlock.test.ts` (6 tests)
- **572 pytest green**; frontend build green; **16 vitest**

**Next:** Phase 11 Slice 11.12 — remaining dedicated correction APIs (invoice, staff, partner, credit sale, FX conversion/spend).

**Phase 11 Slice 11.10 complete** — correct posted expense (`v0.69.1-correct-expense`):
- `correct_expense_by_id()` wraps `correct_expense_entry()` — void GL + update expense row + repost
- `POST .../expenses/{id}/correct` + `ExpenseCorrect`/`ExpenseCorrectOut`
- Frontend: `correct-expense-form.tsx`; `/expenses` posted rows → **Correct** dialog (pre-filled, idempotency key)
- Tests: `test_expense_correct.py` (4 tests — amount, account/date, non-posted 409, period lock)
- **572 pytest green**; frontend build green
- **Owner sign-off: APPROVED (2026-06-27)** (money-critical)

**Next:** Phase 11 Slice 11.11 — wire correction UI for existing Phase 8.5 APIs + period unlock retry.

**Phase 11 Slice 11.9 complete** — correct posted daily sales (`v0.69.0-correct-daily-sales`):
- `correct_pos_daily_summary()` — voids linked card batch JE + cash movement JE (with cash reversal), reposts via shared confirm path
- `POST .../pos/daily-summaries/{id}/correct` + `CorrectPosDailySummaryRequest` (confirm shape + reason/period_unlock_reason)
- Frontend: `correct-daily-sales-form.tsx`; `/sales` posted rows → **Correct** dialog (pre-filled, idempotency key)
- Tests: `test_pos_daily_summary_correct.py` (5 tests — amounts, date, non-posted 409, duplicate date 422, period lock)
- **568 pytest green**; frontend build green
- **Owner sign-off: APPROVED (2026-06-27)** (money-critical)

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
- **Owner sign-off: APPROVED (2026-06-27)** (money-critical)

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

- 2026-06-27 — Owner sign-off APPROVED: Phase 11.15 day close-out (money-critical)
- 2026-06-27 — Owner sign-off APPROVED: Phase 11.12, 11.13 (money-critical)
- 2026-06-27 — Owner sign-off APPROVED: Phase 11.7, 11.9, 11.10, 11.19 (money-critical)
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
