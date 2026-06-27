# Deploy Mizan — owner guide

Plain-English steps to provision hosting for Mizan. This slice (**12.1**) delivers scaffolding and config only — **do not** run production migrations, flip Clerk to live keys, or go live until **Slice 12.2** (staging first).

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

1. **Staging dry-run first.** Deploy a prod-like **staging** environment and run the full smoke test there before touching production (ROADMAP senior-dev must-do).
2. Copy `.env.production.example` into your host secret stores — never commit real secrets.
3. You need accounts on: Netlify, Render (or Railway), a Postgres host, Redis host, S3-compatible storage, and Clerk (production keys wait until 12.2).

---

## 1. Managed Postgres

1. Create a Postgres cluster (Neon/Supabase recommended).
2. Create two roles:
   - **Schema owner** (`mizan`) — runs Alembic migrations (Slice 12.2).
   - **App role** (`mizan_app`) — runtime queries with RLS (grants applied by migrations).
3. Create database `mizan`.
4. Set connection strings (SSL required in production):
   - `DATABASE_URL` → `postgresql+psycopg://mizan_app:…@host:5432/mizan?sslmode=require`
   - `DATABASE_ADMIN_URL` → `postgresql+psycopg://mizan:…@host:5432/postgres?sslmode=require`

**Do not run `alembic upgrade head` yet** — that is Slice 12.2.

---

## 2. Redis

1. Create a Redis instance (Upstash free tier works for staging).
2. Set:
   - `REDIS_URL`
   - `CELERY_BROKER_URL` (same URL, db `0`)
   - `CELERY_RESULT_BACKEND` (same host, db `1`)

Use `rediss://` if your provider requires TLS.

---

## 3. Backend (Render)

1. Connect this GitHub repo to Render.
2. Apply the blueprint from `render.yaml` (or create three services manually from `backend/Dockerfile`):
   - **mizan-api** — web service, health check `/health`
   - **mizan-celery-worker** — `celery -A app.workers.celery_app worker --loglevel=info`
   - **mizan-celery-beat** — `celery -A app.workers.celery_app beat --loglevel=info`
3. Attach a **persistent disk** (10 GB+) mounted at `/app/data` on **api** and **worker** (uploads + local backup cache).
4. Paste env vars from `.env.production.example`. Mark secrets as **sync: false** in Render.
5. Set `CORS_ORIGINS` to your Netlify URL(s), comma-separated, e.g.  
   `https://app.example.com,https://staging--mizan.netlify.app`
6. Deploy staging first; note the public API URL (e.g. `https://mizan-api.onrender.com`).

**Uploads:** Files stay on the API host disk (`UPLOAD_DIR=/app/data/uploads`). If the disk is lost, uploads are lost — off-site backups (below) cover DB + upload archive bundles.

**Railway alternative:** Same Dockerfile; run three processes (web, worker, beat) with a volume on `/app/data`.

---

## 4. Frontend (Netlify)

1. Import the repo in Netlify.
2. Build settings are in `netlify.toml`:
   - Base directory: `frontend`
   - Build: `npm run build`
   - Publish: `.next` (Netlify Next.js runtime handles SSR)
3. Set environment variables:
   - `NEXT_PUBLIC_API_URL` → your Render API URL (HTTPS)
   - `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` → Clerk publishable key (test for staging, live in 12.2)
4. Deploy staging; confirm HTTPS on the `*.netlify.app` URL.

**Optional same-origin API proxy:** Uncomment the `[[redirects]]` block in `netlify.toml` and set `BACKEND_URL` in Netlify if you prefer `/api/*` on the frontend domain. Default is direct `NEXT_PUBLIC_API_URL` calls (requires correct `CORS_ORIGINS` on the API).

---

## 5. S3-compatible backup bucket

1. Create a private bucket (R2 or S3).
2. Create access keys with write-only scope to that bucket.
3. Set `BACKUP_S3_*` vars on **api** and **celery-worker** (see `.env.production.example`).
4. Scheduled backups run via Celery beat (default 03:00 UTC). Full restore drill is Slice 12.3.

---

## 6. Custom domain + HTTPS

**Netlify (frontend)**

1. Domain → Add custom domain → follow DNS instructions.
2. Netlify provisions SSL automatically (Let's Encrypt).

**Render (API)**

1. Settings → Custom Domain → add `api.example.com`.
2. Render provisions SSL; point CNAME to Render.

Update `CORS_ORIGINS` and `NEXT_PUBLIC_API_URL` to the final HTTPS URLs before production cutover.

---

## 7. Clerk (staging vs production)

- **Staging:** use Clerk **test** keys; set `AUTH_ENFORCEMENT=true`, `CLERK_TEST_MODE=false`, and JWT vars (`CLERK_JWKS_URL`, `CLERK_ISSUER`, `CLERK_AUDIENCE`).
- **Production keys:** Slice **12.2** only — after DB migrate + RLS verify on staging.

---

## 8. Verify scaffolding (no live data yet)

| Check | How |
|-------|-----|
| API health | `curl https://your-api.onrender.com/health` → `{"status":"ok","service":"mizan-api"}` |
| CORS | Browser devtools: frontend origin allowed in preflight |
| Frontend build | Netlify deploy log green |
| Workers | Render logs show Celery worker + beat connected to Redis |

Local dev unchanged: `docker compose up -d` (Postgres + Redis only), backend on `:8000`, frontend on `:3000`.

---

## 9. What comes next (Slice 12.2 — do not skip)

1. Staging: `alembic upgrade head` with `DATABASE_ADMIN_URL`
2. Confirm RLS + immutability triggers
3. Clerk production keys
4. End-to-end smoke on staging, then production

---

## Files in this slice

| File | Purpose |
|------|---------|
| `netlify.toml` | Next.js build, security headers, optional API proxy |
| `backend/Dockerfile` | Production uvicorn image (+ `postgresql-client` for backups) |
| `render.yaml` | Web + Celery worker + beat blueprint |
| `.env.production.example` | Full env catalog |
| `backend/app/config.py` | `CORS_ORIGINS` env (comma-separated) |

Questions or blockers: note them in `PROGRESS.md` before starting 12.2.
