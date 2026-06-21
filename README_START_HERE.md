# Restaurant Bookkeeping App — project folder

Everything we worked out, in one place. Read in this order.

## The core documents
1. **`Restaurant_Bookkeeping_App_Decisions.md`** — **WHAT to build.** The single source of truth: the accounting model, double-recording safeguards, multi-restaurant separation, suppliers/payables, banking, POS + delivery sales intake, cash, forex, staff, KDV, roles, reports, the roadmap (§27), and risks.
2. **`CURSOR_RULES.md`** — **HOW to build it (process).** The rulebook for the AI builder: work in slices, completion gate, no dead code, git commit/tag/push, the mandatory crash-recovery protocol, the root-cause bug protocol, meaningful tests, and the record-keeping logs.
3. **`ROADMAP.md`** — **WHERE we are.** Phase-by-phase, slice-by-slice build tracker (mirrors Decisions §27). Updated after every slice — current status, what's done, what's next.
4. **`ARCHITECTURE.md`** — **HOW it's structured (so it never becomes a monolith).** Feature-based modules, the isolated accounting core + single posting boundary, adapters for messy inputs, and the anti-`app.py` rules.
5. **`DESIGN_SYSTEM.md`** — **HOW it looks.** The locked visual system: white background, **blue** accent, Inter type, Lucide icons, components, the app shell, and the page archetypes (including the Reports card-library layout).
6. **`app_preview.html`** — **a live, openable preview.** Double-click to open in a browser and click through the pages (dashboard, list, supplier ledger, review, reports, settings, login) in the real look.

## Ideas for later
- **`FUTURE_IDEAS.md`** — a pocket backlog of features to add as the business grows (deeper accounting, scheduled reports, bank feeds, approvals, etc.). Not part of v1 — just so good ideas don't get lost.
- **`IDEAS_FROM_PREVIOUS_APP.md`** — good ideas mined from your earlier Streamlit app (default chart of accounts, card-sales clearing, end-of-day close, etc.) plus the cautionary lessons on why it became a mess.

## Prompts for design help (optional)
- **`THEME_BRIEF_for_design_agent.md`** — paste into a design AI to generate the full theme in our style.
- **`THEME_SECOND_OPINION_brief.md`** — paste into a design AI for a fresh, unguided design opinion (no style hints given).

## When you're ready to build
Hand a coding agent (e.g. Cursor) the core docs together: Decisions (what), CURSOR_RULES (how), ROADMAP (where we are), ARCHITECTURE, and DESIGN_SYSTEM. It then has the full picture — and follows the recovery + test rules from day one.

## After a crash, new chat, or fresh session
Every new session MUST run the **Recovery Protocol** in `CURSOR_RULES.md` §5 before any code changes — agents do not retain prior conversation. **`ROADMAP.md`** (current phase/slice) and **`PROGRESS.md`** (exact resume point) are the handoff files; git commits and tags are the ground truth for what is actually saved.

*Golden rule: if anything changes, update the relevant document first, so the files and the app never drift apart.*
