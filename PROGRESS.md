# PROGRESS

## Current

| Field | Value |
|-------|-------|
| **Phase** | Phase 9 — frontend |
| **Active slice** | Slice 8 — Dashboard + reports |
| **Last completed slice** | Phase 9 Slice 6 — Staff, partners, receivables, tips (`v0.62.0-phase9-staff-partners-receivables`) |
| **Branch** | `main` |
| **Last tag** | `v0.62.0-phase9-staff-partners-receivables` |

## Resume point

**Phase 9 Slice 6 complete** — Staff, partners, receivables, tips (frontend only):
- `/staff`, `/staff/[id]` — employees, accrual/advance/payment, ledger
- `/partners`, `/partners/[id]` — expense fronted, reimbursement
- `/customers`, `/customers/[id]` — credit sale, payment
- `/receivables` — summary (like payables)
- Tips: **5700 cash expense only** — New → Cash tip, Expenses → Record cash tip (no tip pot / no POS tip UI)

**Next:** Phase 9 Slice 8 — Dashboard + reports (wire `GET .../dashboard`, report read views + export).

## Verification (2026-06-21)

| Check | Result |
|-------|--------|
| Full pytest | **545 passed**, 2 skipped |
| `npm run build` | **GREEN** |

## Recent

- 2026-06-21 — Phase 9 Slice 6 — staff/partners/receivables/tips UI (`v0.62.0-phase9-staff-partners-receivables`)
- 2026-06-21 — Phase 9 Slice 2d — money-entry UX gaps (`v0.60.1-phase9-slice-2d-money-entry-ux`)
- 2026-06-24 — Phase 9 Slice 5 — POS & delivery sales (`v0.61.0-phase9-pos-delivery-sales`)
- 2026-06-24 — Phase 9 Slice 4 — Banking & cash (`v0.60.0-phase9-banking-cash`)
