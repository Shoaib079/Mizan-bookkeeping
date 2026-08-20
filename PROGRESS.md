# PROGRESS

**Handoff:** Read the **Current** table below only for active work. Older sections are history. **Git + last tag win** over uncommitted doc edits. **One agent per active slice.**

**Full queue:** `POST_LAUNCH_PLAN.md` **Master build order** + **§ IC** (invoice classification). **ROADMAP.md** **Current status** + **Next plan**.
**Companions:** `ROADMAP.md` (phase/slice + Companion files table) · `CHANGELOG.md` (every change, dated) · `HARDENING_PLAN.md` (bug classes + owed items) · `BUGLOG.md` (bug history) · `FINANCIAL_AUDIT.md` (engine review, F2 still open)

### Companion files

| File | Role |
|------|------|
| `ROADMAP.md` | Phase / slice status, do-not-rebuild, slice log |
| `CHANGELOG.md` | Every change, dated |
| `HARDENING_PLAN.md` | Bug classes and fixes (Phases 1–4, owed items) |
| `POST_LAUNCH_PLAN.md` | What's next after launch |
| `FINANCIAL_AUDIT.md` | Accounting engine review |

## Current

| Field | Value |
|-------|-------|
| **Phase** | Phase 13 — Post-launch UX & insights (app is LIVE) |
| **Active slice** | **S1** — staff sticker = ledger net |
| **Last completed slice** | Entity balance sticker (`v0.entity-balance-sticker`) |
| **Last tag** | `v0.entity-balance-sticker` |
| **Unpushed** | no — `origin/main` at `v0.entity-balance-sticker` (as of plan commit; S1 will be local until owner pushes) |
| **Next up** | S1 in progress → then S2 (supplier sticker refresh) |


## FINANCIAL_AUDIT status (2026-07-27)

| Finding | State |
|---------|-------|
| F1 — Turkish thousands-dot parser | ✅ resolved |
| F2 — no output VAT (P&L not tax-credible) | ⛔ **open, deliberate deferral** — the only substantive one left |
| F3 — voids rewrite historical reports | ✅ closed (close-time snapshot) |
| F4 — no year-end close | ✅ closed (year-end close) |
| F5 — coarse cash-flow classification | ✅ closed (override; picker has no UI home yet — deliberate) |
| F6 — UTC dates near midnight | ✅ mitigated (hint) |

Fixed assets / depreciation are **knowingly absent** — owner decision 2026-07-27, see DECISIONS.md. A capital purchase is expensed, so the month of a big purchase understates profit. Cash figures stay correct.

## Invoice classification — owner audit (Spice Corner May 2026)

Permanent fixture targets when building IC-B (copy to `backend/tests/fixtures/efatura/spice_corner/`):

| File | Expected kind |
|------|----------------|
| `24.pdf` (Trendyol) | `delivery_commission` |
| `54.pdf` (Yemeksepeti) | `delivery_commission` — fixed in IC-B (`v0.73.21`) |
| `57.pdf` (Migros Yemek) | `delivery_commission` |
| `58.pdf` (Getir) | `delivery_commission` |
| Getir supply PDF | `supplier` — same VKN as commission; use document shape (Depo, product lines) |

**Do not rebuild:** supplier activity, inline preview, delivery monthly gross (`v0.73.18`–`v0.73.19`) — extend via IC slices only.

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

- Create Sentry project; set `SENTRY_DSN` on Railway **mizan-api** (see `DEPLOY.md` §12).
- Enable Railway service unhealthy + deploy failure notifications.
- Optional external uptime monitor on `GET /health/ready`.

## Owner blockers (12.3)

Owner must run against their staging/prod hosts (not automatable in CI):

- Provision Postgres/Redis/Railway/Vercel (Slice 12.1 scaffolding).
- Run `backend/scripts/migrate_production.sh` and `verify_production_db.sh` with real `DATABASE_URL` / `DATABASE_ADMIN_URL`.
- Run `scripts/smoke_staging.sh` against deployed staging API before production cutover.
- Flip Clerk live keys on Railway + Vercel for production — API guard blocks `sk_test_` / `pk_test_` when `APP_ENV=production`.
- **Staging backup drill:** `backend/scripts/run_backup_drill.sh` (or verify after scheduled beat) per `DEPLOY.md` §11 before trusting prod backups.

## Resume point

**Current (git):** last tag **`v0.14.0-mobile-and-group-sale-total`**. HEAD is further ahead with untagged work — hardening Phase 1 (statement-line release, review date filter, assumed-VAT block), Phase 3 (production smoke, entity-switch remount, file-size ratchet), D10 `classify_statement_line` split (`fa18c03`), and partner balance/UI polish. See `HARDENING_PLAN.md` + `CHANGELOG.md` + `ROADMAP.md` slice log.

**Prior partner milestone:** **`v0.partner-record`** (settle-then-withdraw + profit/capital/return) and same-day **`v0.partner-splits`** — shipped; do not rebuild.

**Deploy:** `alembic upgrade head` through **089** (`088_membership_grants` 2026-08-03 + `089` ledger repairs / `profit_allocation_v3` 2026-08-04) — see `ROADMAP.md` Deploy reality.

**Next build:** **GS-FX** forex-only group sales (design locked) — see `ROADMAP.md` / `POST_LAUNCH_PLAN.md`. Phase 11 known gap remains: staff salary + advance correction (`BUGLOG.md` 2026-07-13).

**Owner sign-off ✓ (2026-06-28)** — clearance auto-pick (`v0.72.0-clearance-auto-pick`). Phase 12.5 statement-learning arc closed.

**Phase 12.5 bank import + learning arc (`v0.71.9`–`v0.72.0`):**
- `v0.71.9` — nav consolidation (section tabs, reports/settings card hubs)
- `v0.71.10` — single-item sidebar groups → direct links
- `v0.71.11`–`v0.71.12.1` — Excel/.xls import, lira amount column, Turkish CSV encoding/delimiter
- `v0.71.13` — column-mapping profiles per bank account
- `v0.71.14` — per-entity classification learning (suggest + learn-on-confirm)
- `v0.71.15` — rule auto-apply at HIGH confidence (reversible, entity-isolated)
- `v0.71.16` — unified statement review hub (`/banking/review`)
- `v0.71.17` — learned-token trim on classify/correct
- `v0.72.0-clearance-auto-pick` — POS/delivery settlement link-only auto-clear

**UX reorg (`v0.73.5`–`v0.73.7`):** UX6 collapse sidebar; UX7 unified record dialogs — **done, do not rebuild.**
