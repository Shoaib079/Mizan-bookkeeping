# Restaurant Bookkeeping App — project folder

Everything we worked out, in one place. Read in this order.

## The core documents
1. **`Restaurant_Bookkeeping_App_Decisions.md`** — **WHAT to build.** The single source of truth: the accounting model, double-recording safeguards, multi-restaurant separation, suppliers/payables, banking, POS + delivery sales intake, cash, forex, staff, KDV, roles, reports, the roadmap (§27), and risks.
2. **`CURSOR_RULES.md`** — **HOW to build it (process).** The rulebook for the AI builder: work in slices, completion gate, no dead code, git commit/tag/push, the mandatory crash-recovery protocol, the root-cause bug protocol, meaningful tests, and the record-keeping logs.
3. **`ROADMAP.md`** — **WHERE we are.** Phase-by-phase, slice-by-slice build tracker (mirrors Decisions §27). Updated after every slice — current status, what's done, what's next.
4. **`PROGRESS.md`** — the exact resume point (phase, last tag, next up); the primary handoff file for a new session.
5. **`CHANGELOG.md`** — every change, plain English, dated.
6. **`ARCHITECTURE.md`** — **HOW it's structured (so it never becomes a monolith).** Feature-based modules, the isolated accounting core + single posting boundary, adapters for messy inputs, and the anti-`app.py` rules.
7. **`DESIGN_SYSTEM.md`** — **HOW it looks.** The locked visual system: white background, **blue** accent, Inter type, Lucide icons, components, the app shell, and the page archetypes (including the Reports card-library layout). **§0** has copy-paste Cursor prompts: standing theme rule (structure first) and theme-refinement-only.
8. **`app_preview.html`** — **a live, openable preview.** Double-click to open in a browser and click through the pages (dashboard, list, supplier ledger, review, reports, settings, login) in the real look.

## Enforcement & memory
- **`AGENT_GUARDRAILS.md`** — what catches you if you don't follow the rules: full green-light commands, file-size ratchet, expensive lessons. Read with `CURSOR_RULES.md`.
- **`HARDENING_PLAN.md`** — the 12 recurring bug classes, the hardening scoreboard, and the owed items (Phases 1-4). Read before fixing any bug.
- **`PROGRESS.md`** — the exact resume point (phase, last tag, next up); the primary handoff file for a new session.
- **`CHANGELOG.md`** — every change, plain English, dated.

## Where the reasoning lives (read before changing accounting behaviour)
- **`FINANCIAL_AUDIT.md`** — an outside review of the accounting engine, finding by finding, each marked resolved / mitigated / deliberately open. **F2 (no output VAT) is the only substantive one still open**, and it's a knowing choice: these books are a management view, not a tax basis.
- **`DECISIONS.md`** — the significant technical choices and *why*, including the things deliberately **not** built (forex-only group sales, fixed assets and depreciation, a create-manual-journal form). Read it before "fixing" something that looks missing — it may be missing on purpose.
- **`BUGLOG.md`** — every real bug: symptom, root cause, fix, guarding test. Several of these are subtle and were expensive to find once.
- **`TESTS.md`** — what each test file guards, and the registry-completeness rules that will fail the suite if a new `JournalEntrySource` isn't classified everywhere.
- **`AUDIT_MULTITENANCY.md`** — the multi-tenant isolation audit; most findings resolved by SEC-1 to SEC-4 (see its status banner).
- **`PHASE_2_SKETCH.md`** — design record for collapsing edit/void into one capability table (steps 1-2 landed, 3-4 abandoned).
- **`POST_LAUNCH_PLAN.md`** — what's next after launch (master build order + invoice classification spec).

## Operations
- **`DEPLOY.md`** — how the app is deployed (Neon + Railway + Vercel + Cloudflare R2).
- **`DEV.md`** — local development setup.
- **`OPS_RESTORE.md`** — backup/restore drill and runbook.

## Ideas for later
- **`FUTURE_IDEAS.md`** — pocket backlog of features to add as the business grows (deeper accounting, bank feeds, recipe costing, receipt AI learning, etc.). Not part of the current slice until promoted into the Decisions doc. Cautionary lessons from the previous app are in **`ARCHITECTURE.md`**, not here.

## Prompts for design help (optional)
- **`THEME_BRIEF_for_design_agent.md`** — paste into a design AI to generate the full theme in our style.
- **`THEME_SECOND_OPINION_brief.md`** — paste into a design AI for a fresh, unguided design opinion (no style hints given).

## When you're ready to build
Hand a coding agent (e.g. Cursor) the core docs together: Decisions (what), CURSOR_RULES (how), ROADMAP (where we are), ARCHITECTURE, and DESIGN_SYSTEM. It then has the full picture — and follows the recovery + test rules from day one.

## After a crash, new chat, or fresh session
Every new session MUST run the **Recovery Protocol** in `CURSOR_RULES.md` §5 before any code changes — agents do not retain prior conversation. **`ROADMAP.md`** (current phase/slice) and **`PROGRESS.md`** (exact resume point) are the handoff files; git commits and tags are the ground truth for what is actually saved.

*Golden rule: if anything changes, update the relevant document first, so the files and the app never drift apart.*
