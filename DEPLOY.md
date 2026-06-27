# Deploy Mizan — owner guide

Plain-English steps to provision and go live with Mizan. **Staging first** — run the full migrate + verify + smoke path on staging before production.

**Recommended stack**

| Layer | Provider | Notes |
|-------|----------|-------|
| Frontend | **Netlify** | Next.js 15 in `frontend/` — see `netlify.toml` |
| API + workers | **Render** (or Railway) | FastAPI web + Celery worker + Celery beat — see `render.yaml` |
| Postgres | **Neon**, Supabase, or managed Postgres | `DATABASE_URL` + `DATABASE_ADMIN_URL` |
| Redis | **Upstash** or managed Redis | Celery broker + result backend |
| Off-site backups | **Cloudflare R2** or S3 | `BACKUP_S3_*` env vars |
| Uploads | **Persistent disk** on API host | `/app/data/uploads` — not Netlify |

---

## Before you start

1. **Staging dry-run first.** Deploy a prod-like **staging** environment and run migrate + verify + smoke there before touching production.
2. Copy `.env.production.example` into your host secret stores — **never commit real secrets**.
3. Accounts needed: Netlify, Render (or Railway), managed Postgres, Redis, S3-compatible storage, Clerk.

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
5. Set `CORS_ORIGINS` to your Netlify URL(s), comma-separated — **not** the localhost default, e.g.  
   `https://app.example.com,https://staging--mizan.netlify.app`
6. Deploy **staging** first; note the public API URL (e.g. `https://mizan-api.onrender.com`).

**Production boot guards (fail fast):**

- `APP_ENV=production` requires `AUTH_ENFORCEMENT=true`, `CLERK_TEST_MODE=false`
- Clerk **live** keys only (`sk_live_` / `pk_live_`) — test keys rejected
- `CLERK_JWKS_URL`, `CLERK_ISSUER`, `CLERK_AUDIENCE` required when auth is on
- `CORS_ORIGINS` must not be the localhost default

**Uploads:** Files stay on the API host disk (`UPLOAD_DIR=/app/data/uploads`). Off-site backups (below) cover DB + upload archive bundles.

**Railway alternative:** Same Dockerfile; run three processes (web, worker, beat) with a volume on `/app/data`.

---

## 5. Frontend (Netlify)

1. Import the repo in Netlify.
2. Build settings are in `netlify.toml`:
   - Base directory: `frontend`
   - Build: `npm run build`
   - Publish: `.next` (Netlify Next.js runtime handles SSR)
3. Set environment variables:
   - `NEXT_PUBLIC_API_URL` → your Render API URL (HTTPS)
   - `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` → Clerk publishable key (**live** for production)
4. Deploy staging; confirm HTTPS on the `*.netlify.app` URL.

**Optional same-origin API proxy:** Uncomment the `[[redirects]]` block in `netlify.toml` and set `BACKEND_URL` in Netlify if you prefer `/api/*` on the frontend domain. Default is direct `NEXT_PUBLIC_API_URL` calls (requires correct `CORS_ORIGINS` on the API).

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

**Netlify (frontend)**

1. Domain → Add custom domain → follow DNS instructions.
2. Netlify provisions SSL automatically (Let's Encrypt).

**Render (API)**

1. Settings → Custom Domain → add `api.example.com`.
2. Render provisions SSL; point CNAME to Render.

Update `CORS_ORIGINS` and `NEXT_PUBLIC_API_URL` to the final HTTPS URLs before production cutover.

---

## 9. Staging smoke test

After migrate + verify + deploy:

```bash
export API_URL='https://your-staging-api.onrender.com'
export FRONTEND_ORIGIN='https://your-staging.netlify.app'
./scripts/smoke_staging.sh
```

Checks:

| Check | Endpoint / script |
|-------|-------------------|
| Liveness | `GET /health` → `{"status":"ok"…}` |
| Readiness (DB) | `GET /health/ready` → `200` + `"db":"up"` |
| CORS | OPTIONS preflight from `FRONTEND_ORIGIN` |

Then walk through: sign up → create restaurant → seed chart → one expense → one report.

---

## 10. Production cutover checklist

1. Staging smoke green (migrate, verify, `/health/ready`, CORS, Clerk JWT template).
2. Production Postgres: `migrate_production.sh` + `verify_production_db.sh`.
3. Flip Clerk to **live** keys on production API + Netlify.
4. Set production `CORS_ORIGINS` and `NEXT_PUBLIC_API_URL`.
5. Deploy API (pre-deploy migrate runs automatically on Render).
6. Run `./scripts/smoke_staging.sh` against production URLs.
7. Record first real entity data; confirm Celery worker + beat logs show Redis connected.

---

## Files in this phase

| File | Purpose |
|------|---------|
| `netlify.toml` | Next.js build, security headers, optional API proxy |
| `backend/Dockerfile` | Production uvicorn image; non-root `app` user; `postgresql-client` |
| `render.yaml` | Web + Celery worker + beat; pre-deploy migrate + verify |
| `.env.production.example` | Full env catalog |
| `backend/scripts/migrate_production.sh` | `alembic upgrade head` (no drop) |
| `backend/scripts/verify_production_db.sh` | RLS + trigger integrity check |
| `backend/scripts/verify_backup_restore.sh` | Latest backup → scratch DB → integrity verify |
| `backend/scripts/run_backup_drill.sh` | Backup + restore-verify one-liner (staging drill) |
| `scripts/smoke_staging.sh` | Post-deploy health + CORS smoke |
| `backend/app/db/provisioning.py` | `run_production_migrations()`, `verify_production_database()` |
| `backend/app/launch.py` | Production auth/CORS/key guards |

Questions or blockers: note them in `PROGRESS.md`.
