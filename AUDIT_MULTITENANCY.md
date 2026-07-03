# Multi-Tenancy Audit — Mizan

**Date:** 2026-07-03
**Method:** Two independent audit agents (backend; frontend + config) performed the audit. Findings were then independently reviewed — every HIGH/CRITICAL claim was re-verified against the actual code before inclusion. False positives were discarded.
**Question audited:** Is anything specific to one company? Will a newly created company work identically, with no clashes and no data leakage?

---

## Verdict

**The architecture is genuinely multi-tenant.** No hardcoded company names, emails, tenant UUIDs, or single-company seed data exist anywhere. New-company creation provisions everything (chart of accounts, cash drawer, owner membership) atomically per entity — company #2, #10, #100 get identical treatment. Tenant isolation is enforced at three layers: Postgres Row-Level Security with a non-bypass DB role, a mandatory `entity_context()` session guard, and per-route membership guards.

**But the audit found real holes**, one of which is a live cross-tenant data exposure. Fix the two CRITICAL/HIGH groups below before adding another company or going live.

---

## CRITICAL

### C1. Five POS read endpoints have NO auth guard — cross-tenant read of financial data (verified)
`backend/app/features/pos/api.py`

| Line | Route |
|---|---|
| 69 | `GET /entities/{id}/pos/settlements` |
| 103 | `GET /entities/{id}/pos/settlements/{settlement_id}` |
| 130 | `GET /entities/{id}/pos/card-sales` |
| 162 | `GET /entities/{id}/pos/clearing-reconciliation` |
| 256 | `GET /entities/{id}/pos/daily-summaries/{summary_id}` |

Every sibling route declares `_: None = Depends(member_read_guard)` or `operations_write_guard` (e.g. line 230). These five declare nothing — no router-level `dependencies=`, no app-level guard (verified in `main.py:67`). RLS still scopes rows to the `entity_id` in the URL, but **nothing checks the caller belongs to that entity**. Anyone can read another company's POS settlements, card-sales batches, and reconciliation by changing the UUID in the URL.

**Fix:** add `_: None = Depends(member_read_guard)` to all five.

**Related — your guardrail has a blind spot:** `backend/tests/test_security_invariants.py:73` (`test_entity_routes_have_auth_guard`) is designed to catch exactly this and, by static analysis, must fail right now. Run:
```
pytest tests/test_security_invariants.py::test_entity_routes_have_auth_guard
```
If it *passes*, the test's route collection is broken — fix the test too. (Could not be executed in the audit sandbox: no PyPI access.)

### C2. `/users` endpoints are fully open (verified)
`backend/app/features/auth/api.py:35` (`POST /users` — anyone can create users) and `:72` (`GET /users/{user_id}` — returns any user's email + name, no token required). Not a tenant leak (users are global by design) but platform-wide PII enumeration + unauthenticated write.

**Fix:** require auth on both; restrict `create_user` to admin/invite flow.

---

## HIGH

### H1. Hardcoded fallback actor UUID sent in financial mutations (verified)
`frontend/src/lib/entity-context.tsx:18` — `DEFAULT_ACTOR = "00000000-0000-4000-8000-000000000001"`, used whenever `mizan.actorId` is unset (`:29-30`). Sent as `actor_id` in dozens of mutation bodies (day closeout, cash, invoice review, opening balances). Nothing clears `mizan.actorId`/`mizan.entityId` on sign-out, so on a shared machine the *previous user's* actor id persists. If the backend honors body `actor_id` for audit trails, entries in any company can be misattributed — the same dummy ID across all companies.

**Fix:** derive actor from the auth token server-side; stop sending `actor_id` from the client; clear all `mizan.*` keys on sign-out.

### H2. Company-switch race: Company A's data can stick on screen under Company B (verified)
Zero `AbortController` usage anywhere in `frontend/src` (verified by sweep). `apiFetch` (`lib/api.ts:74-121`) accepts no signal; page `reload()` callbacks (e.g. `app/page.tsx:55-77`) call `setData(res)` unconditionally. If the user switches restaurants mid-flight and the old entity's response resolves last (plausible with the 401 retry loop's 500 ms sleeps), the old company's numbers overwrite the new company's and stay until manual reload. Related: most pages don't clear state on switch — `useEntitySwitchReset` exists (`lib/use-entity-reset.ts`) but only 11 components use it; dashboard, reports, and sidebar badge counts don't.

**Fix:** capture `entityId` at request start and discard mismatched responses (or abort on switch) in a shared helper; apply `useEntitySwitchReset` or `key={entityId}` in `AppShell`.

### H3. render.yaml: web + worker declare the same disk, but Render disks are single-service (verified in file)
`render.yaml:15-17` and `:75-77` both declare disk `mizan-data`. Render persistent disks attach to one service — the worker gets a *separate* disk. Uploads written by the API (`UPLOAD_DIR=/app/data/uploads`) are invisible to Celery workers; backups land on the wrong disk. Affects every tenant.

**Fix:** move shared files to S3/R2 (`BACKUP_S3_*` vars already exist) or run file-touching tasks in the web service.

---

## MEDIUM

- **M1. Role gating fails open to "owner"** — `frontend/src/lib/use-entity-access.ts:21,39-41`: initial state and any error on `GET .../members/me` yields role `owner`. Backend still enforces, but UI shows owner-level financial data/buttons to lower roles. Fix: default to least privilege.
- **M2. FX amount parser 100× bug** — `frontend/src/lib/fx-money.ts:17` (verified): `"100.50"` → dots stripped → parsed as 10050 → 1,005,000 minor units. Uses `parseFloat` against the project's own rule (`money.ts:46`). Fix: reuse `parseTryParts` logic.
- **M3. Drawer reopen POST sends no Idempotency-Key** — `frontend/src/app/banking/cash/page.tsx:120-124` (verified); the only mutation without one, and `render.yaml` sets `IDEMPOTENCY_ENFORCEMENT: "true"` → will be rejected in production.
- **M4. Silent `localhost:8000` API fallback** — `frontend/src/lib/api.ts:1-2` (verified). If Netlify misses `NEXT_PUBLIC_API_URL`, the production site quietly points at localhost. Fix: fail the build.
- **M5. localStorage residue across users** — form drafts keyed by entity but not user (`lib/form-draft.ts:14`); combined with no sign-out cleanup (H1), user B can resume user A's unsaved financial drafts on a shared machine.
- **M6. `AUTH_ENFORCEMENT` flag is a single point of failure** — the whole authz model collapses if it's ever false in a real deployment. `app/launch.py:17-20` does enforce it in production; noted for awareness, no action strictly required.

## LOW

- `isoToday()` uses UTC (`frontend/src/lib/date-range.ts:3-5`) — "Today" is yesterday between 00:00–03:00 Turkey time.
- Entity picker capped at 50 (`lib/entity-context.tsx:93`) — a user with >50 restaurants can't select the rest; list fetches likewise capped with no pagination UI (`lib/use-entity-list.ts:44`).
- Error hint mentions "Railway CORS_ORIGINS" (`lib/api.ts:98`) but deploys are Render/Netlify.
- `render.yaml` omits `CLERK_PUBLISHABLE_KEY` for the API while `.env.production.example` and CI include it — verify the backend doesn't need it.
- In-memory rate limiter is per-process (`app/core/observability/rate_limit.py`) — limits multiply under horizontal scaling.
- **Turkey-market hardcoding (by design, sign off explicitly):** TRY-only money (`money.ts`), mandatory VKN, `tr-TR` dates, Getir/Yemeksepeti/Trendyol detection heuristics + VKNs (`backend/app/core/delivery/commission_detect.py:21-33`, `frontend/src/lib/statement-classification-options.ts:208+`). These apply *identically to every company*, so they don't break the "nothing company-specific" rule — but they lock the product to Turkey.

---

## Verified clean (checked, correct)

- **New-company onboarding:** `create_entity` (`backend/app/features/entities/service.py:46-88`) creates entity + OWNER membership + full chart seed + TRY cash drawer in one transaction; rollback on failure is tested. Seeding is per-entity and idempotent — company #2 gets an identical fresh setup. Feature toggles are per-entity settings that default to "off", never break.
- **Uniqueness scoping:** all business uniques correctly per-entity — account codes, supplier VKN, invoice fingerprints, statement dedup keys, invoice numbers per `(entity, supplier, number)`. Global uniques on UUID FKs are safe (UUIDs belong to one entity). No global constraint that a second company could clash with.
- **RLS coverage** matches the ORM's scoped tables and is validated by tests + deploy-time verification; DB role can't bypass RLS; ledger immutability enforced by triggers.
- **Multi-company scenarios are tested** — `tests/test_entity_isolation.py` and `restaurant_a`/`restaurant_b` fixtures across ~127 test references.
- **Frontend scoping:** all 201 data fetches are `/entities/{entityId}/...`; localStorage caches keyed by entity; zero-company first-run modal exists; no committed secrets (`.env` untracked, `.gitignore` covers it); no hardcoded URLs beyond the localhost fallback (M4).
- **File storage** namespaced per entity with path-escape protection.

---

## Fix order

1. C1 — guard the 5 POS routes, then run the invariant test and fix it if it didn't catch them.
2. C2 — lock down `/users`.
3. H1 — stop sending `actor_id`; clear `mizan.*` on sign-out.
4. H3 — Render disk architecture (before real uploads/backups matter).
5. H2, M1–M5.

*Caveat: the audit sandbox had no PyPI/DB access, so findings are from static analysis; the test suite could not be executed. Run `pytest backend/tests/test_security_invariants.py` locally to confirm C1 dynamically.*
