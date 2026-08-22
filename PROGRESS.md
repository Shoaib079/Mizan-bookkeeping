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

## Current

- **Sandbox-wide v2 look:** local `.env.local` sets `NEXT_PUBLIC_DEFAULT_THEME=v2` + `NEXT_PUBLIC_THEME_TOGGLE=true` so the real app renders in the new look for owner A/B; production leaves both unset (v1). Tag `v0.sandbox-wide-v2`. **Awaiting owner review — do not push. Do not roll out to production.**
| Field | Value |
|-------|-------|
| **Phase** | Phase 13 — Post-launch UX & insights (app is LIVE) |
| **Active slice** | *(none — sandbox-wide v2 testing; awaiting review)* |
| **Last completed slice** | Sandbox-wide v2 look |
| **Last tag** | `v0.sandbox-wide-v2` |
| **Unpushed** | yes — do not push until owner review + sign-off |
| **Next up** | Owner A/B on sandbox → approve rollout or iterate |

