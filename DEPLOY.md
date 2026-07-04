# Deploy Mizan — owner guide

> **⚠️ STACK CORRECTION (2026-07):** This doc predates the current hosting and says
> "Render" in many places. The **actual production stack is Neon (DB) + Railway
> (backend API, `mizan-api`) + Vercel (frontend) + Cloudflare R2 (backups)** — see
> the authoritative entry in `DECISIONS.md` (2026-07) and `PRE_DEPLOY_CHECKLIST.md`.
> Wherever this doc says "Render (API)" read **Railway**; `render.yaml` is stale.
> Railway runs `alembic upgrade head` as its pre-deploy command; migrations reach
> Neon automatically on deploy.

Plain-English steps to provision and go live with Mizan. **Staging first** — run the full migrate + verify + smoke path on staging before production.

**Recommended stack**

| Layer | Provider | Notes |
|-------|----------|-------|
| Frontend | **Vercel** | Next.js 15 in `frontend/` — see `vercel.json` + `next.config.ts` |
| API + workers | **Render** (or Railway) | FastAPI web + Celery worker + Celery beat — see `render.yaml` |
| Postgres | **Neon**, Supabase, or managed Postgres | `DATABASE_URL` + `DATABASE_ADMIN_URL` |
| Redis | **Upstash** or managed Redis | Celery broker + result backend |
| Off-site backups | **Cloudflare R2** or S3 | `BACKUP_S3_*` env vars |
| Uploads | **Persistent disk** on API host | `/app/data/uploads` — API host only |

---

## Before you start

1. **Staging dry-run first.** Deploy a prod-like **staging** environment and run migrate + verify + smoke there before touching production.
2. Copy `.env.production.example` into your host secret stores — **never commit real secrets**.
3. Accounts needed: Vercel, Render (or Railway), managed Postgres, Redis, S3-compatible storage, Clerk.

---

## 1. Managed Postgres

1. Create a Postgres cluster (Neon/Supabase recommended).
2. Create two roles:
   - **Schema owner** (`mizan`) — runs Alembic migrations only.
   - **App role** (`mizan_app`) — runtime queries with RLS (grants applied automatically after migrate).
3. Create database `mizan`.
4. Set connection strings (SSL required in production):
   - `DATABASE_URL` → `postgresql+psycopg://mizan_app:…@host:5432/mizan?sslmode=require`
   - `DATABASE_ADMIN_URL` → `postgresql+psycopg://mizan:…@host:5432/postgres?sslmode=require`

---

## 2. Run migrations (Slice 12.2 — canonical path)

**Production schema is built only with Alembic — never `init_database` / `create_all`.**

From a machine or one-off shell with env vars loaded (or on Render pre-deploy):

```bash
cd backend
export DATABASE_URL='postgresql+psycopg://mizan_app:…@host:5432/mizan?sslmode=require'
export DATABASE_ADMIN_URL='postgresql+psycopg://mizan:…@host:5432/postgres?sslmode=require'
bash scripts/migrate_production.sh
bash scripts/verify_production_db.sh
```

What this does:

- `migrate_production.sh` → `alembic upgrade head` (no schema drop) + grant `mizan_app` DML on all objects.
- `verify_production_db.sh` → confirms Alembic head, RLS policy on every entity-scoped table, and ledger/audit/period-lock immutability triggers.

**Staging:** run the same two scripts against your staging database before pointing production traffic.

Render: `render.yaml` runs both scripts as `preDeployCommand` on the API service when env vars are set.

---

## 3. Redis

1. Create a Redis instance (Upstash free tier works for staging).
2. Set:
   - `REDIS_URL`
   - `CELERY_BROKER_URL` (same URL, db `0`)
   - `CELERY_RESULT_BACKEND` (same host, db `1`)

Use `rediss://` if your provider requires TLS.

---

## 4. Backend (Render)

1. Connect this GitHub repo to Render.
2. Apply the blueprint from `render.yaml` (or create three services manually from `backend/Dockerfile`):
   - **mizan-api** — web service; health check `/health`; readiness `/health/ready`
   - **mizan-celery-worker** — `celery -A app.workers.celery_app worker --loglevel=info`
   - **mizan-celery-beat** — `celery -A app.workers.celery_app beat --loglevel=info`
3. Attach a **persistent disk** (10 GB+) mounted at `/app/data` on **api** and **worker** (uploads + local backup cache).
4. Paste env vars from `.env.production.example`. Mark secrets as **sync: false** in Render.
5. Set `CORS_ORIGINS` to your Vercel URL(s), comma-separated — **not** the localhost default, e.g.  
   `https://app.example.com,https://mizan.vercel.app`
6. Deploy **staging** first; note the public API URL (e.g. `https://mizan-api.onrender.com`).

**Production boot guards (fail fast):**

- `APP_ENV=production` requires `AUTH_ENFORCEMENT=true`, `CLERK_TEST_MODE=false`
- Clerk **live** keys only (`sk_live_` / `pk_live_`) — test keys rejected
- `CLERK_JWKS_URL`, `CLERK_ISSUER`, `CLERK_AUDIENCE` required when auth is on
- `CORS_ORIGINS` must not be the localhost default

**Uploads:** Files stay on the API host disk (`UPLOAD_DIR=/app/data/uploads`). Off-site backups (below) cover DB + upload archive bundles.

**Railway alternative:** Same Dockerfile; run three processes (web, worker, beat) with a volume on `/app/data`.

---

## 5. Frontend (Vercel)

1. Import the repo in Vercel.
2. Set **Root Directory** to `frontend` in the Vercel dashboard (or via `vercel.json`).
3. Build command: `npm run build` (auto-detected from Next.js).
4. Set environment variables:
   - `NEXT_PUBLIC_API_URL` → your Render API URL (HTTPS)
   - `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` → Clerk publishable key (**live** for production)
5. Deploy staging; confirm HTTPS on the `*.vercel.app` URL.

**Security headers** are configured in `next.config.ts` `headers()` — X-Frame-Options DENY, X-Content-Type-Options nosniff, Referrer-Policy, Permissions-Policy, and immutable cache for `/_next/static/`. Verify after deploy: `curl -I https://<vercel-domain>` should show `x-frame-options: DENY`.

---

## 6. Clerk (staging vs production)

### JWT template (required)

Mizan rejects tokens missing verified email claims. In Clerk Dashboard → **JWT templates** (session token or custom API template used by the frontend):

- Include claim **`email`** (user's primary email)
- Include claim **`email_verified`** set to `true` when verified

Without both, sign-in succeeds in Clerk but API calls fail with auth errors.

### Keys

- **Staging:** Clerk **test** keys are OK on a staging stack if `APP_ENV` is not `production`.
- **Production:** use Clerk **live** keys (`sk_live_` / `pk_live_`); set `CLERK_JWKS_URL`, `CLERK_ISSUER`, `CLERK_AUDIENCE` (audience = your live publishable key).

---

## 7. S3-compatible backup bucket

1. Create a private bucket (R2 or S3).
2. Create access keys with write-only scope to that bucket.
3. Set `BACKUP_S3_*` vars on **celery-worker** and **celery-beat** (see `.env.production.example`). The API service does not need S3 backup vars unless you run manual backups from the API shell.
4. Scheduled backups run via Celery beat (default **03:00 UTC**): backup → restore-verify into scratch DB → retention prune.
5. **Staging-first:** run the full drill on staging (§11) before trusting production backups.

**Live checklist (Slice 12.3):**

| Item | How |
|------|-----|
| Off-site storage | `BACKUP_S3_*` on worker + beat; artifacts in private bucket with SSE |
| Verify after backup | Celery task calls `verify_latest_backup()` after each run; manual: `verify_backup_restore.sh` |
| Alert on failure | Celery logs `daily backup task failed` on worker; configure Render log drain / alert on ERROR (§11) |
| Owner drill | Staging: `run_backup_drill.sh` or wait for schedule + `verify_backup_restore.sh` |

---

## 11. Backup restore drill (Slice 12.3 — owner, staging first)

Prove backups are restorable **before** production cutover. Run on **staging** managed Postgres first; repeat on production after staging passes.

### Prerequisites

- `DATABASE_URL` and `DATABASE_ADMIN_URL` point at the target stack (admin URL can create/drop databases).
- `BACKUP_S3_*` configured on the Celery worker (same as scheduled backups).
- PostgreSQL client tools on the shell host (`postgresql-client` — already in `backend/Dockerfile` for Render worker).

### Option A — one-liner drill (recommended)

On the Render **celery-worker** shell (or any host with env vars loaded):

```bash
cd backend
./scripts/run_backup_drill.sh
```

This creates a fresh backup, uploads to S3/local storage, restores the latest artifact into a throwaway database, and runs ledger integrity checks (debits = credits, control accounts tie, upload paths resolve).

### Option B — verify an existing scheduled backup

After beat has run (or after `python -m app.features.backups.cli run`):

```bash
cd backend
./scripts/verify_backup_restore.sh
```

Scripts load `backend/.env` when present; otherwise export vars in the shell. Exit code **0** prints `PASS`; non-zero prints `FAIL`.

### Option C — manual restore from S3

Download the latest `mizan-backup-*.tar.gz` from the bucket and follow `OPS_RESTORE.md` for a full cutover restore (maintenance window required).

### Alert on backup failure

1. **Render:** enable log streaming or an alert on the worker service when logs contain `daily backup task failed`.
2. **Manual check:** after first deploy, confirm worker logs show `daily backup completed` the morning after beat runs.
3. Do **not** promote a restore to production if `verify_backup_restore.sh` fails — see `IntegrityCheckError` details in `OPS_RESTORE.md`.

---

## 8. Custom domain + HTTPS

**Vercel (frontend)**

1. Settings → Domains → add custom domain → follow DNS instructions.
2. Vercel provisions SSL automatically.

**Render (API)**

1. Settings → Custom Domain → add `api.example.com`.
2. Render provisions SSL; point CNAME to Render.

Update `CORS_ORIGINS` on Render and `NEXT_PUBLIC_API_URL` on Vercel to the final HTTPS URLs before production cutover.

---

## 9. Staging smoke test

After migrate + verify + deploy:

```bash
export API_URL='https://your-staging-api.onrender.com'
export FRONTEND_ORIGIN='https://your-staging.vercel.app'
./scripts/smoke_staging.sh
```

Checks:

| Check | Endpoint / script |
|-------|-------------------|
| Liveness | `GET /health` → `{"status":"ok"…}` |
| Readiness (DB) | `GET /health/ready` → `200` + `"db":"up"` |
| CORS | OPTIONS preflight from `FRONTEND_ORIGIN` |

Then walk through the owner checklist (§15): sign up → create restaurant → opening balances → invite staff → record a day → run a report.

Automated API smoke (no Clerk UI):

```bash
export API_URL='https://your-staging-api.onrender.com'
# Staging with AUTH_ENFORCEMENT=true and CLERK_TEST_MODE=true:
export SMOKE_AUTH=enforced
./scripts/smoke_onboarding.sh
```

Local dev (API running with `AUTH_ENFORCEMENT=false`):

```bash
export API_URL='http://127.0.0.1:8000'
./scripts/smoke_onboarding.sh
```

See §15 for the full owner walkthrough and auth options.

---

## 12. Observability (Slice 12.4)

Wire these **before production go-live** so the first real bug is visible.

### Sentry error tracking

1. Create a project at [sentry.io](https://sentry.io) (or your Sentry org) — platform **FastAPI**.
2. Copy the **DSN** from Project Settings → Client Keys.
3. On Render **mizan-api** → Environment → add `SENTRY_DSN` (secret, sync: false in `render.yaml`).
4. Redeploy the API. Trigger a test error in staging (optional) and confirm it appears in Sentry.
5. Enable Sentry **alert rules** (e.g. new issue → email/Slack) for production.

**Note:** The API boots without `SENTRY_DSN` — Sentry is optional until you set it.

### Structured logs

Production (`APP_ENV=production`) emits **JSON logs** on stderr (level, message, logger, request fields). Render → Logs shows one JSON object per line. No request bodies or secrets are logged.

### Uptime / health checks

| Layer | Check | Notes |
|-------|-------|-------|
| **Render (API)** | `GET /health/ready` | Already configured in `render.yaml` (`healthCheckPath`). Render restarts the service when readiness fails (DB down). |
| **External uptime** | `GET /health/ready` on your public API URL | Optional but recommended — UptimeRobot, Better Stack, Pingdom, etc. Alert when non-200 or timeout. Interval 1–5 min. |
| **Vercel (frontend)** | — | Next.js SSR — Vercel handles infrastructure monitoring. |

Liveness (`GET /health`) is for quick “process up” checks; **use `/health/ready` for deploy and uptime monitors** (includes DB ping).

### Rate limiting

The API applies an in-memory **60 requests/minute per IP** limit in production (`RATE_LIMIT_PER_MINUTE`, default 60). Skipped on `/health`, `/health/ready`, `/docs`, and OpenAPI routes.

**Limitation:** Each Render instance tracks limits separately — not a global cap across scaled instances. Sufficient for launch; revisit with Redis-backed limits if you scale out.

### Render alerts (recommended)

1. Render dashboard → **mizan-api** → Notifications — enable deploy failure + service unhealthy alerts.
2. Celery worker — alert on repeated task failures (backup failures log `daily backup task failed` in worker logs).
3. Combine with Sentry + external uptime on `/health/ready`.

---

## 14. Pre-launch security pass (Slice 12.5)

Run these **before storing real people's data** (staff, suppliers, customers). CI runs the same scripts on every push to `main`.

### Dependency CVE scan

```bash
cd backend
bash scripts/security_dependency_scan.sh
```

Uses `pip-audit` on **production** dependencies only (dev/test packages excluded). Fails on known CVEs. Wired in `.github/workflows/ci.yml`.

### Secrets audit

```bash
bash backend/scripts/security_secrets_audit.sh
```

Scans **git-tracked** files for likely hardcoded secrets (long Clerk keys, AWS `AKIA…`, PEM private keys). Skips `.env`, `node_modules`, `.venv`. Exits non-zero on hits.

**Owner checklist — secrets:**

| Check | Action |
|-------|--------|
| No secrets in git | Real keys only in Render / Vercel secret stores — never commit `.env` |
| Rotate if leaked | If a key ever appeared in git history, rotate in Clerk/AWS and update host env |
| Templates only in repo | `.env.example` / `.env.production.example` use placeholders only |
| Backup keys separate | S3/R2 backup credentials in worker env only — not in frontend |

### Production-settings guard pytest

```bash
cd backend
bash scripts/security_production_pytest.sh
```

Runs `test_launch_settings.py` + `test_security_invariants.py` with production-like auth/CORS env (`AUTH_ENFORCEMENT=true`, live Clerk placeholders, non-localhost `CORS_ORIGINS`). **Database stays on the test DB** — script sets `APP_ENV=test` so conftest provisions `mizan_test` (never point this at production Postgres).

Manual equivalent:

```bash
cd backend
APP_ENV=test AUTH_ENFORCEMENT=true CLERK_TEST_MODE=false \
  CORS_ORIGINS=https://app.example.com \
  CLERK_JWKS_URL=https://example.clerk.accounts.dev/.well-known/jwks.json \
  CLERK_ISSUER=https://example.clerk.accounts.dev \
  CLERK_AUDIENCE=pk_live_example \
  .venv/bin/pytest -q tests/test_launch_settings.py tests/test_security_invariants.py
```

**Pre-go-live gate:** full `pytest` green **and** `test_security_invariants.py` green under production-like env (above script or CI job).

### Data protection (KVKK) — conscious decision

Mizan stores **financial and personal data**: staff names, supplier/customer VKN, bank movements, audit history. Before onboarding real restaurants and people, confirm:

| Topic | Launch minimum |
|-------|----------------|
| **Encryption at rest** | Use a managed Postgres provider (Neon, Supabase, Render Postgres) with **encryption at rest enabled** on the cluster. TLS in transit via `sslmode=require` on `DATABASE_URL`. |
| **Backup bucket access** | Private S3/R2 bucket; SSE enabled; credentials on Celery worker only; **separate** cloud account or restricted IAM — not the same keys as public-facing services. |
| **Data deletion** | Per-entity data is partitioned by `entity_id` + RLS. **Owner process today:** contact operator to delete an entity and backups per retention policy; no self-service “delete my restaurant” UI in v1. Document who can request erasure and expected timeline before go-live. |
| **Conscious go/no-go** | Do **not** store real people's data until encryption, backup access, and deletion path above are acceptable to you as data controller under KVKK. |

This is an **owner sign-off item**, not fully automatable in CI.

---

## 13. Production cutover checklist

1. Staging smoke green (migrate, verify, `/health/ready`, CORS, Clerk JWT template).
2. **Security pass (§14):** `security_dependency_scan.sh`, `security_secrets_audit.sh`, `security_production_pytest.sh` all green.
3. **KVKK sign-off (§14):** encryption at rest, backup bucket access, data-deletion path accepted before real people's data.
4. Production Postgres: `migrate_production.sh` + `verify_production_db.sh`.
5. Flip Clerk to **live** keys on production API + Vercel.
6. Set production `CORS_ORIGINS` and `NEXT_PUBLIC_API_URL`.
7. Deploy API (pre-deploy migrate runs automatically on Render).
8. Run `./scripts/smoke_staging.sh` against production URLs.
9. Record first real entity data; confirm Celery worker + beat logs show Redis connected.

---

## 15. Owner first-restaurant walkthrough (Slice 12.6)

Use this on **staging first**, then repeat on production after cutover. Chart + Main Drawer are created automatically when you add a restaurant (no manual seed step).

### Before you sign in

| Step | Action |
|------|--------|
| API smoke | `./scripts/smoke_staging.sh` green; optional `./scripts/smoke_onboarding.sh` with `SMOKE_AUTH=enforced` on staging |
| Clerk JWT | Session token includes `email` + `email_verified` (§6) |
| Your user | Invite-only: your email must exist in Mizan **before** first Clerk sign-in (owner adds you under Members on an existing restaurant, or operator runs `POST /users`) |

### Walkthrough (first restaurant)

1. **Sign in** — open the Vercel URL in a private window; complete Clerk sign-up or sign-in. If API returns 403 “invited”, ask the operator to provision your email first.
2. **Create restaurant** — Settings → Restaurant & toggles → enter name → Create restaurant. Confirm chart count appears (auto-seeded). Save feature toggles → you land on the Dashboard setup checklist.
3. **Opening balances** — Dashboard checklist → Post opening balances (or Settings → Opening balances). Enter go-live date and at least one cash/bank line + balancing equity/AP line → Validate → Post.
4. **Invite staff** — Settings → Members → add by email (cashier or partner). They must be provisioned before they can sign in with Clerk.
5. **Record first day** — Sales → manual daily sales (cash + card) or record an expense via New menu. Checklist marks “first day” when a daily summary exists.
6. **Run a report** — Reports → Profit & Loss (or Balance Sheet) for the go-live month; confirm numbers load without 403.

### Automated onboarding smoke

Exercises the same API path without the Clerk UI:

```bash
export API_URL='http://127.0.0.1:8000'          # local API
./scripts/smoke_onboarding.sh
```

| Env var | Purpose |
|---------|---------|
| `API_URL` | Required — API base URL |
| `SMOKE_AUTH=enforced` | Provision test user + `test:…` bearer (staging with `CLERK_TEST_MODE=true`) |
| `SMOKE_BEARER_TOKEN` | Real Clerk session JWT (production-like staging) |
| `SMOKE_OWNER_EMAIL` | Owner email when using `SMOKE_AUTH=enforced` (default: random `@example.com`) |
| `SMOKE_MEMBER_EMAIL` | Staff invite target (default: `smoke-staff@example.com`) |
| `SMOKE_ENTITY_NAME` | Restaurant name (default: `Mizan Smoke Test Cafe`) |

Steps verified: `POST /entities` (chart + cash drawer) → opening balances validate/post → `POST …/members` by email → `POST …/expenses` → `GET …/reports/profit-and-loss` → exit 0.

**Note:** Smoke creates real rows on the target database — run against staging or a throwaway local DB, not production with live books.

---

## Files in this phase

| File | Purpose |
|------|---------|
| `frontend/vercel.json` | Vercel framework + build config |
| `frontend/next.config.ts` | Next.js config: security headers, redirects, cache rules |
| `backend/Dockerfile` | Production uvicorn image; non-root `app` user; `postgresql-client` |
| `render.yaml` | Web + Celery worker + beat; pre-deploy migrate + verify |
| `.env.production.example` | Full env catalog |
| `backend/scripts/migrate_production.sh` | `alembic upgrade head` (no drop) |
| `backend/scripts/verify_production_db.sh` | RLS + trigger integrity check |
| `backend/scripts/verify_backup_restore.sh` | Latest backup → scratch DB → integrity verify |
| `backend/scripts/run_backup_drill.sh` | Backup + restore-verify one-liner (staging drill) |
| `backend/scripts/security_dependency_scan.sh` | pip-audit CVE scan on production deps (Slice 12.5) |
| `backend/scripts/security_secrets_audit.sh` | Tracked-source secret pattern scan (Slice 12.5) |
| `backend/scripts/security_production_pytest.sh` | Guard tests under production-like auth env (Slice 12.5) |
| `scripts/smoke_staging.sh` | Post-deploy health + CORS smoke |
| `scripts/smoke_onboarding.sh` | Owner cold-start API smoke (Slice 12.6) |
| `backend/scripts/smoke_onboarding.py` | Onboarding smoke implementation |
| `backend/app/db/provisioning.py` | `run_production_migrations()`, `verify_production_database()` |
| `backend/app/launch.py` | Production auth/CORS/key guards |
| `backend/app/core/observability/` | Sentry init, JSON logging, request log + rate limit middleware |

Questions or blockers: note them in `PROGRESS.md`.
