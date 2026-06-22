# PROGRESS

## Current

| Field | Value |
|-------|-------|
| **Phase** | 8 — Roles & permissions, backups, security hardening, launch |
| **Last completed slice** | Auth hardening + pre-sign-off verification (Phase 8 Slice 5) |
| **Next slice** | Owner sign-off on Phase 8 |
| **Branch** | `main` |
| **Last tag** | `v0.47.1-phase8-auth-hardening` |

## Resume point

**Phase 8 Slice 5 done.** Production refuses boot when `CLERK_TEST_MODE` is on; `CLERK_AUDIENCE` required when auth enforcement is on (non-test); Clerk `_extract_email` requires explicit `email_verified=true` (no primary-email fallback). Permanent guard tests: entity route inventory, single posting boundary, RLS registry + live policy check. Dashboard + receivables routes guarded. RLS registry completed (`customers`, `customer_ledger_entries`, `tip_*`, `delivery_platforms`); GUC re-sync after commit fixes delivery classify under RLS. **Phase 8 COMPLETE — pending owner sign-off.**

## Pre-sign-off verification (2026-06-22)

| Check | Result |
|-------|--------|
| Full pytest (`AUTH_ENFORCEMENT=false`, default test settings) | **420 passed**, 2 skipped |
| Full pytest (`AUTH_ENFORCEMENT=true`, `CLERK_TEST_MODE=true`) | **420 passed**, 2 skipped |
| Alembic `upgrade head` on empty DB | **FAIL (pre-existing)** — revision `006_ledger_immutability_bootstrap` (33 chars) exceeds `alembic_version.version_num` varchar(32); not introduced in this slice |
| Alembic `check` (model drift) | Not run — blocked by upgrade failure above; test DB uses `init_database()` bootstrap |
| Secrets in git | `.env` gitignored; no `.env` tracked; `.gitignore` covers `.env`, `backend/data/`, `backups/` |
| `.env.example` Clerk vars | `CLERK_JWKS_URL`, `CLERK_ISSUER`, `CLERK_AUDIENCE` documented |
| `pip-audit` (backend deps) | **No known high/critical CVEs** |

## Recent

- 2026-06-22 — Auth hardening + guard tests (`v0.47.1-phase8-auth-hardening`, 420 pytest)
- 2026-06-22 — Launch readiness / Clerk auth (`v0.47.0-phase8-launch-readiness`, 412 pytest)
- 2026-06-22 — Roles & permissions (`v0.44.0-phase8-roles-permissions`, 389 pytest)
- 2026-06-22 — Excel export (`v0.43.0-phase7-excel-export`, 378 pytest)
- 2026-06-22 — Period comparison (`v0.42.0-phase7-period-comparison`, 371 pytest)
- 2026-06-22 — Per-rate KDV report (`v0.41.0-phase7-kdv-input-report`, 363 pytest)
- 2026-06-22 — Cash flow statement (`v0.40.0-phase7-cash-flow`, 354 pytest)
- 2026-06-22 — P&L & Balance Sheet (`v0.39.0-phase7-pl-balance-sheet`, 347 pytest)
