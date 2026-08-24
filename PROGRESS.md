# PROGRESS

**Handoff:** Read the **Current** table below only for active work. Older sections are history. **Git + last tag win** over uncommitted doc edits. **One agent per active slice.**

**Full queue:** `POST_LAUNCH_PLAN.md` **Master build order** + **§ IC** (invoice classification). **ROADMAP.md** **Current status** + **Next plan**.
**Companions:** `ROADMAP.md` (phase/slice + Companion files table) · `CHANGELOG.md` (every change, dated) · `HARDENING_PLAN.md` (bug classes + owed items) · `BUGLOG.md` (bug history) · `FINANCIAL_AUDIT.md` (engine review, F2 still open)

### Companion files

| File | Role |
|------|------|
| `ROADMAP.md` | Phase / slice status, Companion files table |
| `CHANGELOG.md` | Every change, dated |
| `HARDENING_PLAN.md` | Bug classes and fixes (Phases 1–4, owed items) |
| `POST_LAUNCH_PLAN.md` | What's next after launch |
| `FINANCIAL_AUDIT.md` | Accounting engine review |
| `docs/archive/INDEX.md` | Historical plans/audits — do not rebuild from |

## Current

- **Sales summary (`v0.sales-summary`):** In-app cash/card/delivery totals on `/sales` — selected period vs **full** prior calendar month. Read-only; period comparison unchanged. **Awaiting owner review — do not push.**
| Field | Value |
|-------|-------|
| **Phase** | Phase 13 — Post-launch UX & insights (app is LIVE) |
| **Active slice** | Sales summary — awaiting review |
| **Last completed slice** | Sales summary (commit/tag pending owner review) |
| **Last tag** | `v0.sales-summary` (after commit) |
| **Unpushed** | yes — do not push until owner review + sign-off |
| **Next up** | Per-menu period report for group/agency sales (deferred) |
| **Gate step** | Commit + tag done locally; awaiting review; do not push |
| **Exact next action** | Owner reviews `/sales` Sales summary (This month / Last month mid-month prior = full month); then push if signed off |
