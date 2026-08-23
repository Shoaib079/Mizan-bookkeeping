# Start here — Mizan bookkeeping

Single map for a fresh agent or human after `v0.docs-archive-cleanup`. This file is a **map**, not a manual — open the linked doc for the real content.

## 1. Start here

**Every session:** run the Recovery Protocol in `CURSOR_RULES.md` §5 before any code change. Agents do not keep chat memory. **Git commits/tags win** if docs disagree with git — then fix the docs.

## 2. Canon (read every session)

1. **`Restaurant_Bookkeeping_App_Decisions.md`** — WHAT to build (requirements; single source of truth).
2. **`CURSOR_RULES.md`** — HOW to build (slices, completion gate, git, recovery, bugs, tests).
3. **`ROADMAP.md`** — WHERE we are (phase/slice status + “Do not rebuild” table).
4. **`PROGRESS.md`** — exact resume point (last tag, next up); primary handoff file.
5. **`CHANGELOG.md`** — every change, plain English, dated (newest first).

## 3. Structure & look

- **`ARCHITECTURE.md`** — feature modules, one posting boundary, anti-monolith rules.
- **`DESIGN_SYSTEM.md`** — locked visual language (white canvas, blue accent, components); §0 theme prompts.
- **`DESIGN_ARCHETYPES.md`** — page-shape contract (overview, hub, list, detail, report, …).

## 4. Guards

- **`AGENT_GUARDRAILS.md`** — full green-light commands, file-size ratchet, expensive lessons.
- **`HARDENING_PLAN.md`** — 12 bug classes, scoreboard, owed items; read before fixing bugs.
- **`FILE_SIZE_BASELINE.json`** — ratchet baseline (do not grow oversized files).
- **`TESTS.md`** — what each suite guards; registry-completeness rules.
- **`BUGLOG.md`** — real bugs: symptom → root cause → fix → guarding test.
- **`REVIEWER_BRIEF.md`** — brief for an independent reviewer (not day-to-day build).

## 5. Money & audit

- **`FINANCIAL_AUDIT.md`** — engine findings; **F2 (no output VAT) deliberately open** (management books, not tax basis).
- **`STAFF_ONE_ACCOUNT_PLAN.md`** — parked money plan; **never delete**.
- **`MENU_PLAN.md`** — menu/costing plan referenced by app code; keep at root.
- **`docs/OPENING_BALANCES.md`** — opening-balance rules and flows.

## 6. Queue

- **`POST_LAUNCH_PLAN.md`** — active post-launch build queue (master order + invoice classification).
- **`FUTURE_IDEAS.md`** — parked ideas until promoted into the Decisions doc.

## 7. Ops

- **`DEV.md`** — local machine (Homebrew Postgres, venv pytest; never Docker for tests).
- **`SANDBOX.md`** — owner A/B preview + v2 theme harness (**sandbox-only**; production stays v1 until owner-approved rollout).
- **`DEPLOY.md`** — production stack: Neon + Railway + Vercel (+ R2 backups).
- **`OPS_RESTORE.md`** — backup/restore runbook and drill.

## 8. Archive

- **`docs/archive/INDEX.md`** — map of historical plans, audits, theme briefs, and archived `docs/archive/design/app_preview.html`.
- Read archived files for context only. **Never rebuild from them.** Living truth: `ROADMAP.md` “Do not rebuild”, `CHANGELOG.md`, and **git**.

## 9. How work happens

- **One agent, one slice, one repo** at a time — no concurrent agents on the same tree.
- Finish the **completion gate** (Characterize → … → ROADMAP → commit/tag) before the next slice.
- **Owner sign-off** on money-critical work before merge/push when required.
- Every finished slice updates **`ROADMAP.md`** and **`CHANGELOG.md`** (and **`PROGRESS.md`** for handoff).

*If the map and the files drift, fix the map — or the file it points to — in the same change.*
