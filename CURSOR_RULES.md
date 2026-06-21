# CURSOR RULES — Restaurant Bookkeeping App

**These are hard rules. They are not suggestions. Follow them on every task, in every session, without exception.**

This file governs HOW the app is built. WHAT the app must do lives in `Restaurant_Bookkeeping_App_Decisions.md` — that document is the single source of truth for requirements. If these two ever disagree, STOP and ask the owner; do not guess.

**Companion files:** `ARCHITECTURE.md` = how the code is *structured* (feature modules, single posting boundary, adapters — follow it to avoid a monolith); `DESIGN_SYSTEM.md` = how it *looks and behaves* (including the modern-UX rules: Enter submits, type-or-pick dates, type-to-filter pickers, autosave); `ROADMAP.md` = where we are in the build (phase, slice, status — updated after every slice).

---

## 0. How to use this file (note for the owner)

- Put this file in the project so Cursor always reads it (e.g. as `.cursorrules` at the project root, or `AGENTS.md`, or `.cursor/rules/`).
- Fill in the project facts below before starting:
  - **Git remote (owner's repo address):** `https://github.com/Shoaib079/Mizan-bookkeeping`
  - **Main branch:** `main`
  - **Owner name for audit/commits:** `__________________________`
- At the start of EVERY working session, the first instruction to Cursor is: **"Follow the Recovery Protocol in CURSOR_RULES.md before doing anything."** This is mandatory — not optional.

---

## 1. Golden non-negotiables (never break these)

1. **AI reads, code decides.** AI may read documents and suggest. The unbreakable rules (no duplicate, no double-record, no editing a locked period, no cross-entity leak) live in plain deterministic code — **never** inside an AI/LLM call.
2. **Never double-record.** If not 100% certain, do NOT auto-record — send it to the Needs Review queue.
3. **Void → Reverse → Audit.** Never hard-delete a financial record. Void or reverse with full history and audit trail only — no in-place edits to posted amounts.
4. **Audit trail on every change:** what changed, old value, new value, who, when, reason.
5. **Explicit company scoping.** Every record is entity-stamped (restaurant/company). Every query and every write MUST filter or stamp by entity — no cross-entity leakage, ever. Enforce at the database level. A single leaked penny is a critical failure.
6. **Money is stored as whole-number kuruş (integers).** Never store money as a floating-point/decimal. Format only on display (Turkish style `1.234,56 TL`).
7. **Same rulebook for all, separate books for each.** Rules are global core; data is partitioned per entity.
8. **Everything is connected — build it like a tree.** No record is a dead-end island. Every business event and money movement **posts to the double-entry ledger**, and the ledger **rolls up into the financial statements** (Profit & Loss and Balance Sheet) per entity. A record must flow into the ledger and up into every report/statement it affects — never store the same fact in two disconnected places.
9. **Build with the whole picture in mind.** You have the complete Decisions document and roadmap up front — you know the full intent, not one piece at a time. Each slice must fit the overall architecture and connect cleanly to the rest. Never solve today's slice in a way that conflicts with or ignores the rest of the plan.
10. **One posting boundary.** Every write to the ledger goes through a **single posting service / unit-of-work** — never scattered across the app. Double-entry integrity (debits = credits, correct accounts, correct entity) is enforced in that one place, in deterministic code. (Lesson from the previous app, which sprawled into a 1.1 MB monolith.)
11. **Configurable over opinionated.** Prefer settings and configuration over hard-coded assumptions where reasonable — so the app can adapt without code changes for every business variation.
12. **Statement-first banking.** Banking flows start from statements and uploads — not from invented or assumed transactions. Import/classify real bank data first; never fabricate movements to fill gaps.
13. **Discovery before implementation.** Search and read the codebase and docs before writing new code. Understand what already exists; extend or fix it — do not duplicate.
14. **ROADMAP.md always current.** Update `ROADMAP.md` after every slice. Do not mark work complete without updating it.

If a task would require breaking any of these, STOP and ask.

---

## 2. Build in slices (vertical, purposeful, complete)

- **Work in small vertical slices.** A slice is one thin, end-to-end, working piece (e.g. "upload a supplier invoice → read it → show it for review → post it"), not a half-built layer.
- **One slice at a time.** Finish it through the completion gate (below), commit/tag it, and get owner confirmation BEFORE starting the next. Do not start slice N+1 while slice N is unfinished.
- **Business logic first.** Implement and verify core business rules and data integrity before UI polish or peripheral features within the slice.
- **Every slice must have a stated purpose** tied to a requirement in the Decisions document. Before building, write one line: *"This slice implements [Decisions §X] because [reason]."*
- **No speculative work.** Do not build features, files, options, or abstractions "for later" or "just in case." If it isn't needed by the current slice and isn't in the Decisions document, do not build it.

### Slice completion gate (mandatory before commit/tag)

Every slice MUST pass ALL gates in this order. **Only commit and tag if every gate passes.**

**Characterize → Audit → Test → Fix → API → Verify → ROADMAP → Commit/tag**

| Step | What to do |
|------|------------|
| **Characterize** | State what the slice implements (Decisions §), expected behavior, and acceptance criteria. |
| **Audit** | Review existing code for this concern before adding new code. Consolidate; do not duplicate fixes. Remove dead code when safe. |
| **Test** | Run focused tests for this slice, then full `pytest` for the entire suite. |
| **Fix** | Fix any failures at the root. Re-run tests until green. Never weaken or skip tests. |
| **API** | Verify API endpoints / integration points for this slice work as intended. |
| **Verify** | Confirm end-to-end behavior matches the slice purpose (owner-visible where applicable). |
| **ROADMAP** | Update `ROADMAP.md`: slice status, what was done, what's next. |
| **Commit/tag** | Commit with a clear message; tag if this slice is a milestone. Push to remote. |

Do NOT commit or tag a slice that has not passed Characterize through ROADMAP.

### Definition of Done (do NOT mark a slice complete until ALL are true)

1. **Focused tests pass** — tests written for this slice pass.
2. **Full `pytest` passes** — the entire test suite is green.
3. **`ROADMAP.md` is updated** — slice status, what was done, what's next.
4. **Commit/tag is recommended** — only after 1–3 pass; then commit (and tag if appropriate) and push.

A slice is NOT done if any of the above is missing — even if the feature "works" in the UI.

---

## 3. Nothing hangs around for nothing (no dead code)

- **Every file, function, and component must have a purpose and must be used.** No orphan code, no unused files, no commented-out blocks left lying around, no dead branches.
- **Every source file starts with a short header comment** stating its purpose and the Decisions section / slice it serves. If you can't write that line, the file shouldn't exist.
- **If something becomes unused, remove it** (in its own clearly described commit) — don't leave it "just in case." Git history is the safety net for anything removed.
- **No duplicate logic.** One responsibility lives in exactly one place (single source of truth). If two pieces of code do the same job, merge them.

### Audit & code hygiene (before and during every slice)

- **Audit first.** Before adding code for a concern, review what already exists for that concern. Extend or fix — do not pile on parallel implementations.
- **Don't duplicate fixes.** Consolidate to one way per concern. If the same bug or pattern was fixed elsewhere, reuse that approach.
- **Consolidate existing code** when touching an area — leave it cleaner than you found it.
- **Remove dead code when safe** — especially if it could compromise correctness, confuse future work, or violate the single posting boundary.
- Align with Section 1 (non-negotiables), Section 3 (no dead code), and `ARCHITECTURE.md` (single posting boundary, feature modules).

---

## 4. Git discipline (commit, tag, push — only when gates pass)

- **Commit and tag ONLY after:** audit is done, full `pytest` passes, and `ROADMAP.md` is updated. Never commit failing tests or a partial slice unless the owner has explicitly agreed to a WIP branch for that work.
- **Commit at the end of every completed slice** (and at safe checkpoints within a long slice). Never leave large amounts of uncommitted work.
- **Clear commit messages** describing what and why, e.g. `feat(invoices): read e-Fatura PDF into draft (Decisions §7)` or `fix(payables): payment now reduces supplier balance (BugLog #12)`.
- **Push to the owner's git remote after every commit**, so a local crash never loses committed work.
- **Tag milestones.** Tag the completion of each phase/major slice with a sensible name (e.g. `v0.1-ledger-core`, `v0.2-supplier-invoices`). Tags are recovery anchors.
- **One logical change per commit.** Don't mix an unrelated fix into a feature commit.
- **Never rewrite git history** (no force-push, no rebase of shared history) without explicit owner approval.

---

## 5. Recovery Protocol — mandatory at the start of EVERY session

**This protocol is NOT optional.** Run it at the start of every working session — after ANY crash, disconnect, context loss, new chat, agent restart, or owner opening a fresh conversation — before writing or changing ANY code. Report findings in plain English.

### Why this exists — how agents lose state

- **No persistent agent memory.** Each new chat or session starts without prior conversation. The agent does not remember what was said, decided, or half-built in a previous session.
- **What survives:** git history (commits, tags, branches), the project markdown logs (Section 8), and the codebase itself. Nothing else is reliable.
- **What does NOT survive and is NOT authoritative:** chat history, `.cursor/` config, agent transcripts, or anything the agent "remembers" from conversation alone. If chat says X but `ROADMAP.md`, `PROGRESS.md`, or git says Y — **trust the files and git.**
- **Never assume "we already did this"** from conversation alone. Verify in `git diff`, `ROADMAP.md`, `PROGRESS.md`, and the codebase before claiming work is done or skipping a step.

### Handoff block (run in order — every session)

1. **Git:** `git status` and `git log --oneline -5` (or `-20` if needed). Note branch, uncommitted changes, and latest tag. The last commit/tag is the source of truth for what is actually done.
2. **Read `ROADMAP.md`** → current phase, active slice, last completed slice, what's next.
3. **Read `PROGRESS.md`** → resume point (branch, slice name, step in the completion gate, blockers).
4. **Read `CHANGELOG.md`** → last entry (what changed recently).
5. **Read `BUGLOG.md`** if fixing bugs or investigating failures — check for recurring issues before re-patching.
6. **Search the codebase** for the slice area — grep/read existing code and tests. NEVER write a new version of something that already exists; continue or fix the existing one.
7. **State aloud before editing:** *"Resuming slice [X] at step [Y] of the completion gate."* Wait for owner confirmation if anything is ambiguous.
8. **Run tests** to confirm existing work is healthy before adding to it.

Only after these steps may new work begin.

### After crash or unexpected stop

- Run the full Handoff block above. Do NOT re-implement from memory.
- **Reconcile in-progress vs. committed:** compare what `PROGRESS.md` and `ROADMAP.md` say against `git status` and the codebase. Identify exactly what exists uncommitted or half-finished.
- **Mid-slice crash:** prefer finishing the current completion-gate step cleanly, OR revert to the last good commit/tag — never commit failing `pytest`, partial API, or a broken slice.
- **Duplicate-work prevention:** search/grep before writing; read existing tests; check the ROADMAP slice log for what was already shipped.

### Session start checklist (copy-paste)

```
[ ] git status && git log --oneline -5
[ ] Read ROADMAP.md → phase / slice / next
[ ] Read PROGRESS.md → resume point
[ ] Read CHANGELOG.md → last entry
[ ] Read BUGLOG.md (if bug work)
[ ] Search codebase for slice area
[ ] State: "Resuming slice X at step Y"
[ ] Run pytest (baseline health check)
```

### Session end checklist (before closing chat or pausing mid-slice)

```
[ ] Update PROGRESS.md — branch, slice, gate step, blockers, exact next action
[ ] Update ROADMAP.md slice status if the slice moved (done / in progress / blocked)
[ ] Update CHANGELOG.md if behavior or scope changed this session
[ ] Commit WIP only if owner agreed to a WIP branch — otherwise revert to last good commit or leave clean with resume point documented
[ ] Push after any completed commit (Section 4)
[ ] Tag if a slice/phase milestone completed (Section 4 — tags are recovery anchors)
```

### Files beat chat — source of truth (priority order)

1. **Git** (commits, tags, diff) — what is actually saved
2. **`ROADMAP.md` + `PROGRESS.md`** — where we are and where to resume
3. **Other Section 8 logs** — `CHANGELOG`, `BUGLOG`, `DECISIONS`, `TESTS`
4. **The codebase** — what is implemented
5. **Chat history** — hints only; never authoritative

See Section 8 for what each log file is for. Update `PROGRESS.md` before ending a session whenever possible — it is the primary handoff file for the next agent or session.

---

## 6. Bug protocol (fix the cause, not the symptom)

1. **Reproduce the bug** and state, in plain English, the **root cause** — not just where it shows up.
2. **Check `BUGLOG.md` first.** If this bug (or one like it) was "fixed" before and has come back, **STOP. Do NOT patch it again.** Investigate why the first fix failed and report it. Re-patching a recurring bug is forbidden.
3. **Fix at the root**, in the smallest change that addresses the cause.
4. **Add a test that fails on the bug and passes after the fix**, so it can never silently return.
5. **Record it in `BUGLOG.md`:** symptom, root cause, fix, and the guarding test.
6. **Do not rewrite working code** to fix an unrelated bug.

---

## 7. Testing rules

- **Every money rule has an automated test:** no duplicates, payment reduces payable, salary vs advance no double-count, transfers are not income/expense, entity isolation (no cross-entity leak), KDV math (net + VAT = gross), Turkish number parsing, kuruş integer storage, locked-period protection.
- **Tests must pass before a slice is considered done** and before moving on. Both focused slice tests AND full `pytest` must pass (see Definition of Done, Section 2).
- **Every test must have meaning.** It must check real behavior the owner's books depend on. No empty, trivial, or placeholder tests written just to produce a green light.
- **Never make a test pass just to move on.** If a test fails or any error appears, STOP and **audit it: question it, find the root cause, fix the cause.** A passing suite must mean the code is genuinely correct — not that a failure was hidden, skipped, silenced, or worked around.
- **Never weaken, skip, or delete a test to make it green.** A failing test means the code is wrong, not the test.
- Keep a `TESTS.md` register: what is tested, why it matters, and current pass/fail status.

---

## 8. Record-keeping (the project's memory)

Maintain these files and update them as part of every slice — they are how work survives crashes, new chats, and agent restarts (see Section 5). **Chat and agent transcripts are not memory; these files + git are.**

- **`ROADMAP.md`** — phase and slice tracker: current status, what is done, what is in progress, what is next. **Update after every slice** — mandatory before marking work complete.
- **`PROGRESS.md`** — current phase/slice, resume point, session notes. **Update when starting, pausing, or ending work** — mandatory before closing a session (Section 5 session end checklist).
- **`CHANGELOG.md`** — every change, plain English, dated.
- **`BUGLOG.md`** — every bug: symptom, root cause, fix, guarding test.
- **`DECISIONS.md`** — any significant technical choice and why (so nothing gets silently undone later).
- **`TESTS.md`** — the test register and status.

---

## 9. Communication & behavior

- **When unsure, ASK the owner — never guess.** Same rule the app itself follows.
- **Explain everything in plain, non-technical English.** The owner is not a coder.
- **Small steps, visible progress.** Show the result of each slice so the owner can test it.
- **Do not invent scope.** Build only what the Decisions document and the current slice require. New ideas go to the owner first.
- **Never create a new supplier/customer/account/category/entity automatically** unless the Decisions rules clearly allow it; otherwise ask.

---

## 10. Code hygiene & consistency

- **One design language** (Section 25 of Decisions): same components, styles, pickers, date pickers, validation everywhere. Reuse shared components; don't reinvent per screen.
- **Consistent structure and naming** across the codebase. New code matches the patterns already there.
- **Every record carries:** its entity (restaurant) id, created/updated timestamps, and the user who acted — for isolation and audit.
- **Pickers read from saved lists** (suppliers, accounts, cards, categories) scoped to the current entity — never empty, never free-text-first.
- **Modern-UX behaviors live in the shared components** — Enter submits, type-or-pick date picker, type-to-filter pickers, inline validation, autosave drafts — built once so every screen inherits them (see `DESIGN_SYSTEM.md` §10).

---

## 11. Hard formatting rules (to prevent silent money errors)

- Store money as **integer kuruş**; format on display as **`1.234,56 TL`** (comma decimal, dot thousands).
- Accept amount input with dot OR comma; **two digits after the last separator = kuruş; a single separator + three digits = thousands.** Echo the parsed amount back before saving.
- Dates: display/read as **DD.MM.YYYY**; store in the unambiguous internal date format.
- Handle Turkish characters (ç, ğ, ı, İ, ö, ş, ü), including dotless "ı" in any text comparison.
- Read Turkish source documents with Turkish number rules — never assume English formatting.

---

## 12. Things Cursor must NEVER do

- Put a safety/guardrail rule inside an AI/LLM call.
- Hard-delete a financial record.
- Let any data cross between entities/restaurants.
- Store money as a decimal/float.
- Build features not requested in the Decisions document or current slice.
- Do a big-bang rewrite of working code.
- Start new work without running the Recovery Protocol (Section 5) — it is mandatory every session.
- Re-patch a recurring bug without finding why the first fix failed (Section 6).
- Weaken or delete a test to make it pass.
- Commit or tag a slice without passing the completion gate (Section 2).
- Mark a slice complete without updating `ROADMAP.md`.
- Commit failing tests or a partial slice (unless owner agreed to a WIP branch).
- Leave large uncommitted work, or skip pushing to the remote after a completed commit.

---

*End of rules. When in doubt: stop, read git + the logs (including ROADMAP.md), and ask the owner in plain English.*
