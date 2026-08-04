# Deploy Checklist — Railway API + Neon DB + Vercel Frontend

One-time checklist to get local work live safely. Work top to bottom. The
items marked **BLOCKER** will break the live site if skipped.

**CURRENT STACK (2026-07 — authoritative; ignore any "Render" references below/in other docs):**
- **Database:** Neon (managed Postgres).
- **Backend API + worker:** Railway (`mizan-api` + `mizan-celery-worker` + `mizan-celery-beat` + Redis). Auto-deploys from GitHub `main`; runs Alembic migrations as its **pre-deploy command** (so a deploy migrates Neon automatically).
- **Frontend:** Vercel (Next.js). Auto-deploys from `main` once the build compiles. (Was Render, was Netlify — both retired.)
- **Auth:** Clerk. **Backups:** Cloudflare R2 (nightly `pg_dump`).

**STATUS (2026-07-27):** Alembic head is **`084_journal_cash_flow_category`**. The current push carries **`083`** (period close snapshots — `CREATE TABLE`, RLS-registered) and **`084`** (`journal_entries.cash_flow_category` — nullable `ADD COLUMN`). Both additive, no backfill, no changes to existing rows. Railway migrates Neon in its pre-deploy step, so pushing `main` is the whole deploy. Remaining items below are per-deploy hygiene, not a backlog.

**Before every commit that adds a migration:** confirm a **single Alembic head**. Two `077` heads once slipped through and had to be untangled by hand.

---

## 0. Know what's unshipped

The sandbox cannot reach GitHub, so **the owner pushes**. Check what's waiting:

```
git log --oneline origin/main..HEAD
git push origin main --follow-tags
```

`origin/main` in the working copy only moves when the owner pushes from their
machine — the folder is mounted, so the remote-tracking ref updates then.

As of 2026-07-27 this is 3 commits after `v0.month-close-snapshot`: year-end
close + cash-flow category override + late-night date hint, the fixed-assets
deferral note, and the `YEAR_END_CLOSE` registry registration.

---

## 1. Finish the two small open fixes FIRST (so they ship in this batch)

- [x] `/review` landing redirect — must land on a tab that HAS items, not always
      Bank. **Done** (`v0.review-smart-redirect`).
- [x] `test_period_locks::test_created_at_is_timezone_aware_utc` — env-sensitive
      timezone assertion fix + conftest UTC pin. **Done** (committed with learning pipeline).
- [x] Netlify→Vercel config cleanup slice (headers into next.config.ts, delete
      netlify.toml, docs). **Done** — security headers in `next.config.ts`, `netlify.toml` deleted,
      `vercel.json` added, `DEPLOY.md` updated.

> The New-menu / unified-upload slice is NOT a deploy blocker. Ship it in a later
> batch; don't hold this deploy for it.

---

## 2. Tests green locally (you run, not Cursor)

- [ ] Backend full suite: `cd backend && .venv/bin/pytest -q` — 0 failed.
- [ ] Frontend: `cd frontend && npm test` — all pass.
- [ ] Frontend production build actually compiles: `cd frontend && npm run build`.
- [ ] Lint (optional): `cd frontend && npm run lint`.

---

## 3. Vercel config — security headers (RESOLVED)

Netlify is fully retired; all headers live in `next.config.ts` and Vercel
serves them directly.

- [x] `next.config.ts` has an `async headers()` block with: X-Frame-Options
      DENY, X-Content-Type-Options nosniff, Referrer-Policy
      strict-origin-when-cross-origin, Permissions-Policy
      `camera=(), microphone=(), geolocation=()`; plus immutable cache on
      `/_next/static/(.*)`. **Done.**
- [x] `netlify.toml` deleted; `@netlify/plugin-nextjs` was never in package.json
      (it was a Netlify build plugin). **Done.**
- [x] Vercel project **Root Directory = `frontend`** — `frontend/vercel.json` created. **Done.**
- [ ] After deploy, verify headers: `curl -I https://<vercel-domain>` shows
      `x-frame-options: DENY` etc. *(owner — post-deploy)*

---

## 4. Environment variables (BLOCKERS — most common launch failure)

Backend (Railway dashboard → `mizan-api` → Variables):
- [ ] `CORS_ORIGINS` = exact Vercel production origin, e.g.
      `https://<your-app>.vercel.app` (add custom domain later if you buy one).
      Wrong/old value → browser blocks EVERY API call from the live site.
- [ ] `APP_ENV=production`, `AUTH_ENFORCEMENT=true` (the launch guard enforces
      this; also what makes the auth model real).
- [ ] Clerk live keys present (`CLERK_*`), R2 backup vars, `DATABASE_URL` (the Neon connection string).

Frontend (Vercel dashboard):
- [ ] `NEXT_PUBLIC_API_URL` = Railway API URL (e.g. `https://mizan-api-....up.railway.app`).
      ⚠️ The SEC-4 fix makes production **hard-fail** if this is unset — good,
      but it means a missing var = white-screen. Set it before promoting.
- [ ] `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` = live `pk_live_...`.

Cross-check: no env var referenced in code is missing from the dashboard
(compare against `.env.production.example`).

---

## 5. Database migrations

- [x] Railway `mizan-api` runs `scripts/migrate_production.sh` as its **pre-deploy
      command** (`alembic upgrade head` then pending ledger repairs) — confirmed;
      see Railway service Settings → Deploy. API startup re-runs repairs as fallback.
      migrations apply to Neon automatically on each deploy.
- [x] `alembic current` against Neon shows `072_statement_rule_delivery_platform (head)` — prod is fully migrated.
- [ ] Before any future in-place data migration (like 071), take a fresh R2 backup first.
- Note: the container entrypoint (`docker-entrypoint.sh`) runs uvicorn only — migrations are the Railway pre-deploy step, NOT the entrypoint. Keep it that way (single migration path).

---

## 6. Infra decision still open (decide before real invoice volume)

- [x] **H3 — uploaded files persistence.** Set `UPLOAD_STORAGE=s3` on Railway API + Celery worker (reuses `BACKUP_S3_*`). Uploads go to R2 under `{BACKUP_S3_PREFIX}/uploads/` and are bundled in nightly backups.

---

## 7. Deploy + smoke (in order)

- [ ] Push: `git push` (all local commits).
- [ ] Backend auto-deploys on Railway (migrations run in pre-deploy). Watch logs green.
- [ ] Frontend deploys on Vercel. Build succeeds (no missing-env hard-fail).
- [ ] Smoke on the LIVE site:
  - [ ] Sign in (Clerk live).
  - [ ] Load dashboard — no CORS errors in the browser Network tab.
  - [ ] Upload one real e-Fatura PDF → draft created (never a 422 rejection).
  - [ ] A supplier with history shows the one-click Post button.
  - [ ] Switch company → no stale data from the previous company (SEC-3).
  - [ ] Try a POS settlements URL for an entity you're NOT a member of → 403
        (SEC-1 guard live).
- [ ] `curl -I` the frontend → security headers present (step 3).

---

## 8. Rollback readiness

- [ ] Note the previous Railway deploy + Vercel deployment (both platforms keep
      instant-rollback). Know where the button is before you need it.
- [ ] Latest DB backup in R2 is recent (nightly cron) — or run one manually
      before migrating prod.
