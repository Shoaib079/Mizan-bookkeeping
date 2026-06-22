# PROGRESS

## Current

| Field | Value |
|-------|-------|
| **Phase** | 8 — Roles & permissions, backups, security hardening, launch |
| **Last completed slice** | Launch readiness (Phase 8 Slice 4) |
| **Next slice** | Owner sign-off on Phase 8 |
| **Branch** | `main` |
| **Last tag** | `v0.47.0-phase8-launch-readiness` |

## Resume point

**Phase 8 Slice 4 done.** Clerk session JWT verified via JWKS (signature, issuer, audience, expiry); `get_current_user` from Bearer token (not `X-User-Id`); invite-only provisioning by verified email; `users.external_auth_id` + Alembic `037`; `auth_audit_events`; `AUTH_ENFORCEMENT` default `true`; production refuses boot if enforcement off or Clerk keys missing; `POST /entities` requires auth when enforced. **Phase 8 COMPLETE — pending owner sign-off.**

## Recent

- 2026-06-22 — Launch readiness / Clerk auth (`v0.47.0-phase8-launch-readiness`, 412 pytest)
- 2026-06-22 — Roles & permissions (`v0.44.0-phase8-roles-permissions`, 389 pytest)
- 2026-06-22 — Excel export (`v0.43.0-phase7-excel-export`, 378 pytest)
- 2026-06-22 — Period comparison (`v0.42.0-phase7-period-comparison`, 371 pytest)
- 2026-06-22 — Per-rate KDV report (`v0.41.0-phase7-kdv-input-report`, 363 pytest)
- 2026-06-22 — Cash flow statement (`v0.40.0-phase7-cash-flow`, 354 pytest)
- 2026-06-22 — P&L & Balance Sheet (`v0.39.0-phase7-pl-balance-sheet`, 347 pytest)
