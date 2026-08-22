# Local preview sandbox

Owner review on this Mac — **local Postgres + local API only**. No production DB, no push.

See also `DEV.md` (Homebrew Postgres on `localhost:5432`; do **not** start Docker Postgres if brew already owns 5432).

## Safety

Before starting, confirm `.env` / `backend/.env` use `localhost` (or `127.0.0.1`) for `DATABASE_URL` / `DATABASE_ADMIN_URL`, and `AUTH_ENFORCEMENT=false`. Never point Alembic or seeds at Neon/Railway.

## Start the sandbox (2–3 commands)

Use three terminals from the repo root (or background the API/UI).

```bash
# 1 — DB already running via Homebrew (check only)
pg_isready -h localhost -p 5432

# 2 — API (binds all interfaces so LAN clients can reach /docs if needed)
cd backend && source .venv/bin/activate && alembic upgrade head && \
  uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# 3 — UI (phone on same Wi‑Fi)
cd frontend && npm run dev -- --hostname 0.0.0.0 --port 3000
```

Optional one-shot demo restaurant (local API only):

```bash
API_URL=http://127.0.0.1:8000 SMOKE_ENTITY_NAME='Sandbox Demo Restaurant' \
  ./scripts/smoke_onboarding.sh
```

## Stop

- Stop frontend: `Ctrl+C` in the Next terminal (or kill the `next`/`node` process on port 3000).
- Stop backend: `Ctrl+C` in the uvicorn terminal (or kill the process on port 8000).
- Leave Homebrew Postgres running (normal). Do not stop production services.

## URLs / login

| Surface | URL |
|---------|-----|
| Mac app | http://localhost:3000 |
| Phone (same Wi‑Fi) | http://\<this-Mac-LAN-IP\>:3000 |
| API docs | http://localhost:8000/docs |

With `AUTH_ENFORCEMENT=false` and no `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, there is **no Clerk sign-in** — the app runs as the local **dev owner** actor. Pick the demo entity in the entity switcher (e.g. **Sandbox Demo Restaurant**).

### Phone firewall

macOS may block inbound connections the first time. If the phone cannot load the app: **System Settings → Network → Firewall** (or Security) — allow Node / Python, or temporarily turn the firewall off for the review. Phone and Mac must be on the same Wi‑Fi; guest/client isolation networks will not work. Find the Mac IP with: `ipconfig getifaddr en0` (or `ifconfig en0`).

## Notes

- Frontend uses `NEXT_PUBLIC_API_URL=/backend-api` (same-origin proxy to `127.0.0.1:8000`). Prefer http://\<LAN-IP\>:3000 on the phone — not `:8000`.
- If you add `CORS_ORIGINS` for `http://\<LAN-IP\>:3000`, restart uvicorn after editing `backend/.env`.

## Visual refresh (sandbox)

In `frontend/.env.local` (not committed):

```
NEXT_PUBLIC_DEFAULT_THEME=v2
NEXT_PUBLIC_THEME_TOGGLE=true
```

Restart `npm run dev` after changing. Production leaves both unset → v1. Use **New look on/off** in the shell to A/B.
