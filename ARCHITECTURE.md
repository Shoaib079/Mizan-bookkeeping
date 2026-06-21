# ARCHITECTURE — how we keep it from becoming a monolith

**Why this file exists:** the previous app collapsed into a 1.1 MB `app.py`. `CURSOR_RULES.md` covers the *process* (slices, git, tests, recovery). **This file covers the *structure* — where code lives and the boundaries between parts.** Together they make a monolith structurally impossible. The builder must follow this from the very first file.

---

## The 4 things that broke the last app — and the defense for each
1. **One giant `app.py` held everything** → feature-based modules + small files; **business logic is forbidden in the entry file** (it only wires things up). Any file past ~300–400 lines gets split.
2. **The framework was switched mid-build** (Streamlit → React, half-done) → **pick the stack once** (Next.js + FastAPI + Postgres), never switch.
3. **The database was migrated mid-project** (SQLite → Postgres cutover) → **Postgres from day one.** No cutover, ever.
4. **Endless re-planning, AI to AI** → **one decisions doc** as source of truth + git checkpoints + the recovery protocol, so any AI resumes instead of re-tangling.

---

## Backend structure (Python / FastAPI) — feature-based + layered
```
core/                 ← the accounting engine. PURE logic, no framework, no I/O.
   ledger/            ← double-entry posting + the ONE posting boundary
   money.py           ← money as integer kuruş (the only money type)
   chart_of_accounts/ ← accounts + the default restaurant chart
   (tested hard; everything else depends on this, it depends on nothing)

features/<name>/      ← one self-contained module per feature
   invoices/  suppliers/  payables/  banking/  sales/  delivery/
   cash/  forex/  staff/  partners/  receivables/  reports/
   documents/  review/  admin/
   each feature has:
      models.py   ← only ITS tables (never one 61 KB god-models file)
      service.py  ← read_/write_ logic (the only place that changes data)
      api.py      ← thin route handlers (no business logic)
      schema.py   ← input/output validation

adapters/             ← the messy outside world, behind clean interfaces
   ocr_ai/            ← document extraction (swappable AI provider)
   pos_summary/       ← reads the POS daily-summary photo
   delivery_reports/  ← reads Getir/Yemeksepeti/Trendyol portal reports
   bank_parsers/      ← bank & card statement parsing
   storage/           ← file storage (S3)
   excel/             ← report export

main / app entry      ← ONLY wires routes + startup. No business logic. Ever.
```

**Dependency direction is one-way:** `api → service → core`. Services call adapters; **core depends on nothing.** Features never import each other's internals — they call each other's **services**. This is what stops the spaghetti.

**The single posting boundary:** every change to the ledger goes through `core/ledger`. No feature writes journal entries directly. Double-entry integrity (debits = credits, correct accounts, correct entity) is enforced there, once.

---

## Frontend structure (Next.js)
- **One design system** — the shared component kit + tokens (the Mizan look in `DESIGN_SYSTEM.md`). Every page is built from it; no page-specific styling.
- **One app shell** (sidebar + top bar); every page is one of the fixed **page archetypes**.
- `features/<name>/` holds each feature's pages + components, using the shared kit.

---

## Anti-monolith hard rules
- **No god-file.** The entry point only wires things; business logic never lives in `main`/`app`.
- **One responsibility per file;** split anything that grows past ~300–400 lines. (`app.py` was 1.1 MB — never again.)
- **One way to do each thing:** one money type (kuruş int), one posting boundary, one auth, one design system, one date util, one Turkish-number parser. Duplication is where rot starts.
- **Features are isolated;** cross-feature communication only through services/interfaces.
- **Every external/messy dependency is behind an adapter** (OCR, POS, delivery, banks, storage), so fixing or swapping one never ripples.
- **Every money rule has a test** (the guardrail).

---

## Adding a new feature — the slice recipe (so it always lands clean)
1. It gets its **own** `features/<name>/` folder.
2. Build **one thin vertical slice** end-to-end: `models → service → api → UI`, reusing `core` and the shared kit.
3. Add **tests** for its money rules.
4. **Commit + tag.** Update the decisions doc if anything changed.

Result: features accrete **side by side as clean modules** — never piling into one file.

---

## "Isn't that too many files?" — no, and here's why (LOCKED)
**Many small files is NOT a mess. A mess is when you can't find or understand things — a different problem entirely.**

- The old `app.py` was **one giant box** where every ingredient, tool, and receipt was dumped together — so changing anything meant digging through everything, and you broke three things fixing one. The new structure is **a cabinet with labeled drawers**: more drawers, but you open the *one* you need and it's all right there. That's organization, not clutter.
- **You never hold them all in your head.** To work on delivery, you open `features/delivery/` and *only* that — a few small files, each readable in a minute. The rest of the app is out of sight and irrelevant.
- **You find things by folder + name, instantly** — not by scrolling a 1.1 MB wall.
- **A small change touches a small area.** A change to delivery cannot reach into suppliers. Less fear, fewer rewrite spirals. This is the whole point of splitting up.
- **The AI builder thrives on many well-named files;** one giant file is what makes it lose the thread.
- **The count grows one tidy feature folder at a time**, not all at once. Essentially *every* professional app is hundreds/thousands of small files — the single-giant-file version was the unusual, unhealthy shape.

**The real test of "is it a mess?" is never *how many* files — it's: can I find it, read it, and change it safely? Many small organized files win on all three, every time.**

---

## Why this actually works
Each cause of the old mess has a specific structural counter (above). On top of that: small slices catch problems early, git checkpoints make rollback trivial, the owner's accounting eye verifies behavior, and the recovery protocol stops AI-to-AI drift. No plan is magic — but a monolith **cannot form** when business logic is banned from the entry file, every feature is isolated, every messy dependency is behind an adapter, and files are kept small.
