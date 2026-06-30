# PROGRESS

**Handoff:** Read the **Current** table below only for active work. Older sections are history. **Git + last tag win** over uncommitted doc edits. **One agent per active slice.**

**Full queue:** `POST_LAUNCH_PLAN.md` **Master build order** + **§ IC** (invoice classification). **ROADMAP.md** **Current status** + **Next plan**.

## Current

| Field | Value |
|-------|-------|
| **Phase** | Post-launch — e-Fatura intake & invoice routing |
| **Active slice** | **IC-A** — Invoice unconfirm / redo (`POST_LAUNCH_PLAN.md` § IC-A) |
| **Last completed slice** | Supplier activity + inline preview (`v0.73.19-supplier-activity-invoice-preview`) |
| **Last tag** | `v0.73.19-supplier-activity-invoice-preview` |
| **Next up** | IC-A → IC-B → IC-C → FP → FS → P3/P5/P6 → IC-D (learning, deferred) → P8 design |

## Invoice classification — owner audit (Spice Corner May 2026)

Permanent fixture targets when building IC-B (copy to `backend/tests/fixtures/efatura/spice_corner/`):

| File | Expected kind |
|------|----------------|
| `24.pdf` (Trendyol) | `delivery_commission` |
| `54.pdf` (Yemeksepeti) | `delivery_commission` — **missed today** (no “komisyon” word) |
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

**`v0.73.19-supplier-activity-invoice-preview`** — supplier Activity timeline + Excel; inline PDF preview; partial commission draft fixes. Prior: **`v0.73.18`** delivery monthly gross; **`v0.73.7`** entity VKN + supplier auto-create.

**Deploy:** `alembic upgrade head` through **`059`** on Railway. Set entity VKN in Set up → Restaurant if legacy row.

**Next build:** **`POST_LAUNCH_PLAN.md` § IC-A** (unconfirm/redo), then IC-B (classification + Spice Corner fixtures), IC-C (review UX). **FP/FS after IC-A–IC-C.**

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
