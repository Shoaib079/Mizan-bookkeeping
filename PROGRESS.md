# PROGRESS

## Current

| Field | Value |
|-------|-------|
| **Phase** | Phase 9 — frontend |
| **Active slice** | Slice 5 — POS & delivery sales |
| **Last completed slice** | Phase 9 Slice 2d — money-entry UX gaps |
| **Branch** | `main` |
| **Last tag** | `v0.60.0-phase9-banking-cash` |

## Resume point

**Phase 9 Slice 2d complete** — money-entry UX gaps (uncommitted):
- Manual daily sales: optional Z when `card_tips_z_report_enabled`; `needs_review` keeps dialog open with backend `review_reason` + Sales link
- Manual expense: expense-account picker (5200 / 5700); cash drawer unchanged
- `frontend/src/lib/entity-settings.ts` — read boolean entity settings

Slices 3–4 already shipped (`v0.59.0`, `v0.60.0`). **Next:** Phase 9 Slice 5 — POS & delivery sales.

## Verification (2026-06-24)

| Check | Result |
|-------|--------|
| Full pytest | **543 passed**, 2 skipped |
| `npm run build` (frontend) | **GREEN** |

## Recent

- 2026-06-24 — Phase 9 Slice 4 — Banking & cash (`v0.60.0-phase9-banking-cash`)
- 2026-06-24 — Phase 9 Slice 3 — Suppliers & payables (`v0.59.0-phase9-suppliers-payables`)
- 2026-06-21 — Owner sign-off — Phase 8.8 H1–H2 (`v0.58.5-owner-sign-off`)
- 2026-06-24 — Phase 8.8 H5 docs dedup (`v0.58.4-phase8.8-complete`, 543 pytest)
