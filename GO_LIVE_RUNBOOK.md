# Mizan Go-Live Runbook

Ordered, tick-off checklist for taking Mizan to production. Derived from `DEPLOY.md` (the source of truth) — this just sequences it.

**Golden rules**
- **Staging first.** Run the entire path on a prod-like staging stack before touching production.
- **Secrets live only in host secret stores** (Render / Netlify) — never commit real `.env`.
- **Schema is built only by Alembic** (`migrate_production.sh`) — never `init_database` / `create_all`.
- Legend: 🧑 = owner action (accounts/credentials/UI) · 💻 = run a command · ✅ = success check.

---

## Phase 0 — Accounts (🧑 one-time)

- [ ] Netlify (frontend)
- [ ] Render or Railway (API + Celery worker + beat)
- [ ] Managed Postgres with **encryption at rest** (Neon / Supabase / Render Postgres)
- [ ] Redis (Upstash works for staging)
- [ ] S3-compatible bucket, **private + SSE** (Cloudflare R2 or S3) — separate/restricted credentials
- [ ] Clerk (auth)

---

## Phase 1 — Provision STAGING infra (🧑)

### 1a. Postgres
- [ ] Create cluster; create roles `mizan` (schema owner) and `mizan_app` (runtime, RLS); create DB `mizan`
- [ ] Capture connection strings (SSL required):
  - `DATABASE_URL = postgresql+psycopg://mizan_app:…@host:5432/mizan?sslmode=require`
  - `DATABASE_ADMIN_URL = postgresql+psycopg://mizan:…@host:5432/postgres?sslmode=require`

### 1b. Redis
- [ ] Create instance; set `REDIS_URL`, `CELERY_BROKER_URL` (db 0), `CELERY_RESULT_BACKEND` (db 1) — `rediss://` if TLS required

### 1c. Clerk (staging)
- [ ] JWT template includes `email` **and** `email_verified` claims (without both, API auth fails)
- [ ] Test keys OK on staging as long as `APP_ENV` ≠ `production`

### 1d. Backup bucket
- [ ] Private bucket + SSE; write-scoped access keys; set `BACKUP_S3_*` (worker + beat only)

---

## Phase 2 — Migrate + verify STAGING DB (💻)

```bash
cd backend
export DATABASE_URL='postgresql+psycopg://mizan_app:…@host:5432/mizan?sslmode=require'
export DATABASE_ADMIN_URL='postgresql+psycopg://mizan:…@host:5432/postgres?sslmode=require'
bash scripts/migrate_production.sh      # alembic upgrade head (applies 052–055), no drop + grants
bash scripts/verify_production_db.sh    # confirms head, RLS on every entity table, immutability triggers
```
- [ ] `migrate_production.sh` prints `migrate ok`
- [ ] ✅ `verify_production_db.sh` passes (head + RLS + triggers)

---

## Phase 3 — Deploy STAGING services (🧑)

### 3a. Backend (Render)
- [ ] Connect repo; apply `render.yaml` (api + celery-worker + celery-beat)
- [ ] Attach persistent disk ≥10 GB at `/app/data` on **api** and **worker**
- [ ] Paste env from `.env.production.example`; secrets `sync: false`
- [ ] Set `CORS_ORIGINS` to the Netlify URL(s) — **not** the localhost default
- [ ] Deploy; note the API URL (e.g. `https://mizan-api.onrender.com`)

### 3b. Frontend (Netlify)
- [ ] Import repo (`netlify.toml` handles build); set `NEXT_PUBLIC_API_URL` + `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
- [ ] Deploy; confirm HTTPS on the `*.netlify.app` URL

---

## Phase 4 — Validate STAGING (💻)

### 4a. Health + CORS smoke
```bash
export API_URL='https://your-staging-api.onrender.com'
export FRONTEND_ORIGIN='https://your-staging.netlify.app'
./scripts/smoke_staging.sh
```
- [ ] ✅ `/health` ok · `/health/ready` 200 + `"db":"up"` · CORS preflight passes

### 4b. Automated onboarding smoke (creates real rows — staging only)
```bash
export API_URL='https://your-staging-api.onrender.com'
export SMOKE_AUTH=enforced
./scripts/smoke_onboarding.sh
```
- [ ] ✅ Exits 0 (entity → opening balances → member → expense → P&L)

### 4c. Backup restore drill
```bash
cd backend
./scripts/run_backup_drill.sh           # backup → upload → restore into scratch DB → integrity checks
```
- [ ] ✅ Prints `PASS` (debits=credits, control accounts tie, upload paths resolve)

### 4d. Security pass
```bash
cd backend
bash scripts/security_dependency_scan.sh      # pip-audit on prod deps
bash scripts/security_secrets_audit.sh        # tracked-source secret scan
bash scripts/security_production_pytest.sh    # guard tests under production-like auth env
```
- [ ] ✅ All three green

### 4e. Observability wired
- [ ] `SENTRY_DSN` set on `mizan-api` (optional but recommended); test error appears in Sentry
- [ ] External uptime monitor on `/health/ready` (UptimeRobot/Better Stack)
- [ ] Render alerts on deploy-failure + service-unhealthy; worker alert on `daily backup task failed`

### 4f. Owner walkthrough on staging (🧑, DEPLOY.md §15)
- [ ] Your email provisioned (invite-only) → sign in via Clerk
- [ ] Create restaurant (chart + Main Drawer auto-seed) → post opening balances → invite staff → record a day → run P&L/Balance Sheet without 403

---

## Phase 5 — KVKK / data-protection sign-off (🧑 — required before real people's data)

- [ ] Encryption at rest enabled on Postgres; TLS via `sslmode=require`
- [ ] Backup bucket private + SSE; credentials on worker only; separate/restricted account
- [ ] Data-deletion path documented (who can request erasure + timeline)
- [ ] **Conscious go/no-go** recorded as data controller

---

## Phase 6 — PRODUCTION cutover (DEPLOY.md §13)

- [ ] Staging fully green (Phases 2–5)
- [ ] 🧑 Provision production Postgres / Redis / bucket (repeat Phase 1 for prod)
- [ ] 🧑 Flip Clerk to **live** keys (`sk_live_` / `pk_live_`); set `CLERK_JWKS_URL`, `CLERK_ISSUER`, `CLERK_AUDIENCE`
- [ ] 🧑 Set production `CORS_ORIGINS` + `NEXT_PUBLIC_API_URL` to final HTTPS URLs
- [ ] 💻 Production DB: `migrate_production.sh` + `verify_production_db.sh` (runs auto as Render preDeploy when env set)
- [ ] 🧑 Deploy API + frontend
- [ ] 💻 `./scripts/smoke_staging.sh` against **production** URLs → green
- [ ] 💻 Production backup drill: `./scripts/run_backup_drill.sh` → PASS

---

## Phase 7 — First real data + sign-off (🧑)

- [ ] Record first real restaurant; confirm Celery worker + beat logs show Redis connected
- [ ] Morning after first beat run: worker logs show `daily backup completed`
- [ ] **Owner sign-off:** app is live, backed up, monitored, real data recorded successfully → **Phase 12 COMPLETE**

---

## After go-live → Phase 13 (post-launch parking lot)
- Legacy cash-drawer backfill (deferred; moot for fresh prod entities)
- `verify_fresh_install.sh` / script-hardening type cleanups
- Generic global "starter phrasebook" of non-private TR type-patterns
- Document archive UI, manual journal composer, period-locks admin, credit-card statement import, bank feeds
