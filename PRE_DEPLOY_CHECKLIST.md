# Deploy Checklist — Railway API + Neon DB + Vercel Frontend

One-time checklist to get local work live safely. Work top to bottom. The
items marked **BLOCKER** will break the live site if skipped.

**CURRENT STACK (2026-07 — authoritative; ignore any "Render" references below/in other docs):**
- **Database:** Neon (managed Postgres).
- **Backend API + worker:** Railway (`mizan-api` service). Auto-deploys from GitHub `main`; runs Alembic migrations as its **pre-deploy command** (so a deploy migrates Neon automatically).
- **Frontend:** Vercel (Next.js). Auto-deploys from `main` once the build compiles. (Was Render, was Netlify — both retired.)
- **Auth:** Clerk. **Backups:** Cloudflare R2 (nightly `pg_dump`).

**STATUS (2026-07):** Production DB is at migration `072` (head) — backend + Neon fully current; all backend fixes are live. Frontend on Vercel builds green again (was frozen at `b259d22` on a failed build). Remaining items below are per-deploy hygiene, not a backlog.

---

## 0. Know what's unshipped

Everything since the IE invoice slices is **committed locally only** — production
still runs the old code. This deploy ships, at minimum:
- SEC-1→4 security fixes (POS route guards, /users auth, actor_id from token,
  entity-switch reset, FX parser, idempotency, prod API-URL guard).
- Telecom/ÖİV invoice extraction + migrations 068/069.
- Invoice learning-pipeline slice (one-click, commission one-click, rule keying).

Confirm nothing is stranded: `git status` clean, `git log` shows the slices.

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

## 3. Vercel config — the header gap (BLOCKER for security parity)

Vercel does **not** read `netlify.toml`. Until the cleanup slice merges, the
site has NO security headers live.

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

- [x] Railway `mizan-api` runs `alembic upgrade head` (via
      `scripts/migrate_production.sh`) as its **pre-deploy command** — confirmed;
      migrations apply to Neon automatically on each deploy.
- [x] `alembic current` against Neon shows `072_statement_rule_delivery_platform (head)` — prod is fully migrated.
- [ ] Before any future in-place data migration (like 071), take a fresh R2 backup first.
- Note: the container entrypoint (`docker-entrypoint.sh`) runs uvicorn only — migrations are the Railway pre-deploy step, NOT the entrypoint. Keep it that way (single migration path).

---

## 6. Infra decision still open (decide before real invoice volume)

- [ ] **H3 — uploaded files persistence.** On Railway, uploaded receipt/invoice
      files stored on the API's local/ephemeral filesystem can be lost on redeploy
      and aren't in the nightly DB backup. Decide: mirror `UPLOAD_DIR` to R2 (vars
      exist) so uploads survive redeploys and are backed up. (This is the old "H3
      shared disk" concern, restated for Railway; `render.yaml` is stale — ignore it.)

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
