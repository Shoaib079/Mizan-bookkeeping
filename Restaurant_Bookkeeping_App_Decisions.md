# Restaurant Bookkeeping App — Decisions & Notes

**Status:** Living document (brainstorming stage — nothing is being built yet).
**Purpose:** One single source of truth for everything we've decided, so ideas don't drift and the project doesn't turn into a mess.
**How to use it:** When we (or an AI builder like Cursor) start work, this is the reference. If something here is wrong or changes, update it here first — never let the app and this document disagree.

---

## 1. The core philosophy (the non-negotiables)

- **Business events vs. money movements.** A *business event* is a sale or a cost (invoice, daily sale, card purchase, salary). A *money movement* is value actually moving (bank payment, card settlement, transfer between own accounts, FX purchase). An invoice and its payment are **two events, not two expenses** — one creates a debt, the other settles it. Only real business events affect profit; money movements do not.
- **Double-entry ledger underneath, posting to a chart of accounts.** The app keeps a proper double-entry ledger as its hidden engine. You never see debits/credits on screen, but they make the books always balance and prevent double-counting *structurally*. The ledger posts to a **chart of accounts** — a sensible **default restaurant chart** (cash, banks, cards, suppliers, sales, expense categories, VAT, equity…), editable as you grow. The **P&L, Balance Sheet and Cash Flow all derive from it**. (Basic **manual journal entries** for accountant adjustments post directly to the ledger, fully audited.) A **default restaurant chart of accounts is seeded** (see `backend/app/core/chart_of_accounts/default_chart.py`), including the standard "plumbing" accounts: **Card Sales Clearing** (the POS receivable), **delivery-platform clearing accounts** (one per platform — Getir, Yemeksepeti, Trendyol), **Opening Balance Equity** (opening balances post here), **Cash Over/Short**, **Credit Card Payable**, **Employee Advances**, and **FX Gain / FX Loss**.
- **AI reads, code decides.** AI reads messy documents and *suggests*. Plain, fixed code enforces the unbreakable rules. Safety rules live in code, **never** inside an AI.
- **Never double-record.** If the app is not 100% sure, it does **not** record automatically.
- **When unsure → Needs Review.** Anything uncertain goes to a review queue and asks the owner.
- **Nothing is ever hard-deleted.** Records are voided/reversed or soft-deleted with history. Everything editable but fully traceable (audit trail: what changed, old value, new value, who, when, why).
- **Everything connected — build it like a tree.** No record is a dead-end island. Every business event and money movement **posts to the double-entry ledger**, and the ledger **rolls up into the financial statements (Profit & Loss and Balance Sheet), per entity.** A supplier invoice, for example, flows into the ledger → payables on the balance sheet → expense on the P&L, automatically. Editing one record correctly updates everything linked to it, all the way up. (The full Balance Sheet *view* can arrive later in the build, but the connected structure exists from day one so nothing is re-wired.)
- **These are GLOBAL, CORE rules.** Everything in this document describes the **core of the app** and applies to **every entity/restaurant equally** — none of it is specific to one company. There is **one app, one engine, one rulebook**, applied uniformly everywhere. (See Section 2: *same rulebook for all, separate books for each*.)

---

## 2. Multi-restaurant separation — FOUNDATIONAL ("not even a penny")

The owner has **several restaurants**, and each must be **completely separate** — no data, no balance, not a single penny leaks between them.

- **Each restaurant is a separate LEGAL ENTITY** — its own legal identity and tax number — treated as a full standalone business with its own complete books. Never consolidated into another.
- **Same rulebook for all, separate books for each.** The *rules, logic, and behavior* (everything in Section 1 and throughout this document) are part of the app's **shared core** and apply **identically to every entity**. Only the *data* (balances, records, files) is partitioned per entity, with no leak. Adding a new restaurant later means it automatically inherits all the same rules and quality — nothing is re-specified per company.
- **Every record is stamped with its restaurant.** The app is always "inside" one restaurant at a time. Each restaurant has its **own complete set of books**: sales, expenses, suppliers, accounts, cards, cash, FX, staff, customers, dashboard, reports.
- **Isolation enforced at the deepest (database) level**, so even a future bug cannot leak across restaurants. Think of it as separate apps sharing one login.
- **Suppliers/customers/staff are tracked per restaurant.** The same supplier (e.g. Metro) serving two restaurants is tracked **independently** in each; balances never touch. e-Fatura invoices arrive per restaurant, so this happens automatically.
- **Access is per restaurant.** A cashier at Restaurant A sees only Restaurant A.
- **Assumption to confirm:** each restaurant has its **own bank accounts and cards**. If any account/card is *shared* across restaurants, that's the one thing that complicates "no leak" and needs special handling — flag it.
- **Per-restaurant feature toggles.** Optional modules — first and foremost **food-app delivery** — can be switched **on/off per restaurant**, so each restaurant's app shows only what it actually uses (no empty delivery pages for a dine-in-only place). The same toggle pattern can extend to other optional features later.
- **Future option (off by default):** an owner-only "all restaurants combined" overview. Never shown to staff.

---

## 3. Technology stack (agreed)

- **Front end:** TypeScript + React + Next.js + Tailwind CSS + shadcn/ui — one consistent design language.
- **Back end:** Python + FastAPI — best for AI, document reading, Excel.
- **Database:** PostgreSQL — reliable, made for financial data (and enforces the per-restaurant isolation above).
- **Background jobs:** Celery + Redis — document reading runs in the background, never freezes the app.
- **File storage:** S3-compatible storage for all uploaded files.
- **Excel export:** a Python library (e.g. openpyxl).
- **Document reading:** hosted OCR + a vision AI returning strict structured (JSON) data. Use **e-Fatura XML directly when available**; fall back to reading the PDF.
- **AI provider is replaceable** — not locked to one vendor.

Languages in short: **TypeScript + Python + SQL.**

**Code structure:** see `ARCHITECTURE.md` — feature-based modules + an isolated accounting core with a **single posting boundary**, so it never collapses into a monolith like the previous app.

---

## 4. How it will be built (owner is not a coder)

- **Owner is the manager; the AIs are the staff.** Four roles, one tool to learn plus a chat window:
  - **Translator / thinking partner** — a chat AI (plain English) to explain and keep requirements straight.
  - **Builder** — **Cursor** (AI writes/runs code while you direct it in plain English).
  - **Claude for the hard parts** — set Cursor to use Claude for the ledger and anti-duplicate logic.
  - **Checker** — a fresh AI reviews the builder's work, AND the owner tests the money behavior by hand.
- **Owner's edge: an accounting background** — the real safety net for accounting correctness.
- **One small step at a time.** Invoices first; handwriting last.
- **Outsource one job:** safely putting the finished app online (servers, backups, security) — a few hours of a real developer.

---

## 5. Languages & Turkish formatting (bilingual app)

- **Interface:** Turkish + English, switchable (separate from the data language).
- **Data stored verbatim, never translated.**
- **Turkish number format everywhere you see it:** comma = decimal, dot = thousands (`1.234,56 TL`). Read Turkish documents with Turkish rules.
- **Money stored internally as whole numbers of kuruş** (1.234,56 TL → 123456) to preserve every kuruş and prevent rounding drift. Formatting only on display.
- **Forgiving amount entry:** accept dot or comma. Rule: digits after the *last* separator decide — **two digits = kuruş**; a single separator + **three digits = thousands**. So `1203,45`, `1203.45`, `1.203,45`, `1,203.45` all mean the same. **Always echo back as `1.234,56 TL`** before saving.
- **Dates:** display/read as **DD.MM.YYYY**; store in the unambiguous computer format.
- **Turkish characters** (ç, ğ, ı, İ, ö, ş, ü) handled everywhere, including dotless "ı" in spelling comparisons.

---

## 6. Modules (layers that all feed one shared ledger, per restaurant)

Upload/ingestion (+ fingerprint) · AI read · Match & identify · Needs Review queue · Ledger core · Views (Suppliers, Payables, Customers/Receivables, Banking hub, Sales & Tips, Expenses, VAT, Tax payments, Staff, Partner reimbursements) · **Document archive** · Reports & Excel export · Admin (suppliers, categories, **chart of accounts**, bank/card accounts, opening balances, **manual journals**, users/roles, month locking).

---

## 7. Documents handled

1. **Supplier invoices** — e-Fatura / e-Arşiv from GİB, **mostly PDF** (check if XML available; XML = near-perfect). GİB PDFs follow a standard layout → reliable reading.
2. **Bank statements** — multiple banks, multiple accounts.
3. **Credit card statements** — multiple cards.
4. **Receipts.**
5. **POS daily summary** (photo of the POS report) — cash, card, total; the **primary** sales source. *(Handwritten daily sales sheet = rare fallback.)*
6. **Delivery platform reports** (Getir, Yemeksepeti, Trendyol portals) — gross sales, commission, net payout, per platform.
7. **Delivery commission invoices** — e-Fatura with KDV, from each platform (each platform is also a vendor).
8. **Daily handwritten expense papers** — date, description, category, amount, payment method if known, source file. (The one genuinely manual input.)
9. **Manual entries** — typed sales/expenses.

**Document archive & data safety (v1):** every uploaded file is stored, **fingerprinted (duplicate detection)**, and listed in a **searchable archive** (filter by type, supplier, date, filename) linked to the record it created. **Automated backups run from day one** (a polished restore UI can come later). *(Full text-search inside documents and an import/migration tool are parked in `FUTURE_IDEAS.md`.)*

**Manual entry (no document needed) — first-class:** sales and expenses can always be **typed in by hand** — receipts get lost, and cash expenses often have no paper. A manual entry is a **full, equal record**: it posts to the ledger and appears in reports, supplier balances, cash, etc., exactly like a scanned one. It's just flagged **"no source document"** so you can see which records lack backup. **If you later find and upload the matching receipt/invoice, the app detects the likely match (same amount / date / supplier) and asks whether to link it to that manual entry — it never blindly creates a duplicate** (per the never-double-record rule).

---

## 8. Suppliers & payables (per restaurant)

- **Ledger/balance based** — NO invoice-by-invoice allocation. Invoice → payable up; payment → payable down; credit note/return → payable down; adjustment → balance changes with explanation.
- **Supplier names are easy** (printed e-Fatura) → no heavy name-matching needed.
- **Supplier page:** total invoices, total KDV, total payments, current payable, running ledger, uploaded files, related bank payments, reconciliation issues.
- **Payables page:** all supplier balances in one place, total at top, click → supplier ledger.

---

## 9. Sales intake & tips (per restaurant)

**Sales are captured per channel, from the source that is actually true — never one lump total.** (The POS double-counts delivery orders, so its aggregate total is NOT trusted. We are NOT building or integrating the POS — it stays the owner's separate operational tool; bookkeeping is a separate, private system that only takes in a sales feed.)

- **Cash + card** → from the **POS daily summary** (owner photographs it; OCR reads cash, card, total). Built-in check: **cash + card should equal the POS total**; mismatch → review. Uniform across every restaurant regardless of which POS — no per-POS integration.
- **Delivery (Getir, Yemeksepeti, Trendyol…)** → from **each platform's own portal report** (the authoritative source), NOT the POS. Each report gives **gross sales, commission, and net payout**, per platform.
- **The app computes the true daily total itself = cash + card + Σ delivery.** The POS aggregate total is never posted.
- **Handwritten daily sales sheet** = rare fallback only.

**Delivery is an OPTIONAL, per-restaurant module (on/off):** many restaurants have no food-app delivery — for them, sales are just cash + card, and none of the delivery channels, clearing accounts, or platform reports exist or clutter the app. A restaurant that *does* deliver switches delivery **on** and picks **which platforms** it uses (Getir / Yemeksepeti / Trendyol / others). Set during the restaurant's setup, changeable anytime.

**When delivery is on — each platform is BOTH a sales channel AND a vendor:**
- Each platform has its own **clearing account** (same pattern as card settlement): gross delivery sales **increase** what the platform owes you; payouts **decrease** it. The running balance = money still in transit — so the **irregular payout schedules (next-day / every-3-days / weekly, different per app) stop mattering**; no manual period matching.
- The platform **invoices its commission as an e-Fatura with KDV**, which flows through the **normal supplier-invoice pipeline** (commission = expense + input KDV; the platform is a **vendor** in suppliers/payables).
- **Net payout to bank = gross − commission.** It settles the clearing balance and should reconcile to (gross owed − commission invoice); mismatch → review.

- **No sales cancellations** — so no negative-sale handling needed.
- **Tips — an EXPENSE paid from cash (owner decision 2026-06-23; supersedes the earlier pass-through-liability treatment).** Sales are recorded **gross** (the POS system receipt has no separate tip line). When a tip is given to staff it is taken from the cash drawer and paid right away, recorded on the **expense list** as a tip expense (`Dr Tips Expense / Cr Cash`). A tip left by a customer on a card is still paid to staff from cash and booked as a cash expense. There is **no "tips owed to staff" pot / Tips Payable liability** anymore.
- **Card tips via the card-terminal Z report — per restaurant (owner decision 2026-06-24).** Optional and per-entity (every restaurant runs differently). When enabled, the owner enters the card-terminal **Z report** total on the POS daily summary; the card tip = **Z − system card sale**. The owner chooses how a tip-bearing day is booked: **system** (the system card sale is revenue; the tip is a pass-through paid to staff from the drawer — no profit effect) or **z_report** (the Z total is revenue and the tip is an expense). The safe default is **ask** — any day with a tip goes to **Needs Review** so the owner decides which figure to record. If the tip doesn't reconcile (Z below the card sale, a Z with no card sale, or an entered tip that doesn't match `Z − card`), the day goes to Needs Review rather than auto-posting. The card terminal money (sale + tip) always flows through the card clearing account so later bank deposits + the commission reconciliation clear it to zero.
- **Hidden bank commission — total clearance, automatic (owner decision 2026-06-24).** Both banks' card deposits land in the **one** card-clearing account. Whatever is left after the owner records the net deposits **is** the commission — the owner enters nothing extra. One button ("Clear card commission") books the leftover to bank charges and zeros the clearing account. Press it when all deposits are in. There is no per-restaurant commission setting and no per-deposit commission entry. (If the deposits exceed the card sales, or there's nothing left, the system refuses and asks the owner to check.)
- **Read a tip from an expense photo (owner ask 2026-06-24; superseded by full receipt OCR below).** Slice C tip-only stub — see Phase 8.7.
- **Daily expense receipt OCR — full multi-line (owner decision 2026-06-24, Phase 8.7).** The owner uploads a photo of the daily handwritten expense paper. The app reads **every line** (item name + amount) and prepares **one cash expense per line** in **Needs Review** — nothing posts until confirmed. Each line records exactly what was written (spelling tolerance per §22 links to one canonical expense item behind the scenes). A **tip line** (`Bahşiş`/`Servis`/`Tip`) maps to **`5700 Tips Expense`**; all other lines default to **`5200 Genel Giderler`** (editable on review). Payment is **always cash** from the cash drawer (account chosen at upload). If OCR finds no lines, the intake is created empty for manual entry. If a receipt total is read and line sums don't match, the intake goes to Needs Review. Re-uploading the same photo for the same restaurant is rejected (duplicate fingerprint). Vision OCR reads real phone photos; review-first always.
- **Manual daily sales (typed, no POS photo) (owner decision 2026-06-24, Phase 8.7).** Cash and card sales for a day can be **typed in** without photographing the POS summary — same GL as POS confirm (`Dr cash / Cr revenue` + `Dr clearing / Cr revenue`), with `cash + card = total` validation. Optional Z-report tip fields when the restaurant has card-tip tracking enabled.

---

## 10. Customers who owe us — receivables (per restaurant)

- Happens occasionally (serving a company's group, paid later by cash or bank).
- **Light "customers who owe us" ledger** — the mirror of supplier payables: a credit sale increases what the customer owes; their later payment (cash or bank) reduces it.

---

## 11. KDV / tax

- **Capture AND show per-rate KDV** (1% / 10% / 20%; occasionally 0%; multiple rates can appear on one invoice). e-Fatura breaks VAT down by rate, so the **KDV report shows the per-rate breakdown** (not just a single total). This is purchase / input VAT only.
- **Purchase KDV kept separate from tax-authority payments.** Not mixed into one tax statement.
- **No tax-return module yet** — separate future module.
- **Credit card statements:** do NOT extract VAT unless an actual invoice/receipt is uploaded.

---

## 12. Banking hub — "everything under one roof" (a tree, per restaurant)

- **All Money** (top — total position for that restaurant)
  - **Banks** → Bank A (Account 1 IBAN…, Account 2…), Bank B (Account 1…)
  - **Credit Cards** → Bank A card (••••1234), Bank B card (••••5678)
  - **Cash** → TRY drawer, USD holding, EUR holding, GBP holding
  - **In transit** → POS card money not yet settled, and (if delivery is on) delivery-platform money not yet paid out, per platform

- Each branch has its **own balance and ledger**; the parent sums its children.
- **Every transaction belongs to exactly one account.** Every uploaded statement is tagged to one specific account (bank name, IBAN, last-4, period). **If unsure → ask before importing.** Detect duplicate/overlapping uploads.
- **Transfers between own accounts** are linked as ONE transfer (from → to) — **not** income or expense. Answers "how much went to which account."
- **Transaction classification:** supplier payment, POS/card settlement, credit card payment, bank fee, rent/utility, transfer between own accounts, tax-department payment, owner deposit/withdrawal, customer payment received, partner reimbursement, unknown/needs review.

---

## 13. POS card settlement (banks delay & batch)

- Banks do **not** send each day's card sales as a tidy matching deposit — money arrives days later, often **batched** into one lump, sometimes net of commission, sometimes not.
- **Model card sales as money the bank owes you** — a running "card receivable" balance, implemented as a **Card Sales Clearing** account: card sales **debit** it, settlements **credit** it, and the leftover is the commission. (This is exactly how the previous app did it.)
- **Commission = the shortfall.** Captured directly when shown; **inferred and flagged** when not.
- Balance shows card money still **in transit**.
- **Delivery platforms use the same clearing pattern** (see §9) — one clearing account per platform — except their **commission is captured directly from their e-Fatura** (not inferred), since the platform statement states it.

---

## 14. Cash drawer (per restaurant)

- TRY cash account: cash sales in; cash expenses out (including tips paid to staff — a tip is a cash expense); FX purchases out; owner draws; etc.
- Running balance = what should be in the drawer.
- **End-of-day close:** count the drawer, compare to the expected cash; any difference posts to a **Cash Over/Short** account and the day is locked. (A real Z-report / EOD close — idea borrowed from the previous app.)

---

## 15. Forex (USD / EUR / GBP holdings, per restaurant)

**Decided: track FX by QUANTITY in its own currency; do NOT convert to TRY on the dashboard for now.** This sidesteps the "bought at different rates" problem — counting units doesn't depend on the purchase rate.

- **Each currency is its own wallet** (own ledger) under Cash, **measured in its own currency**.
- **Buying FX:** TRY leaves the drawer (amount entered by owner — **no online rates, ever**) → FX **units** arrive.
- **Dashboard:** each FX balance shown in its own currency (`$1,000 / €500 / £200`) **next to TRY cash, NOT converted**, with a short plain-English note.
- **Quiet safeguard:** store the TRY paid at each purchase (typed anyway, so free); not displayed; enables average-cost TRY valuation later if ever wanted.
- **Realized gain/loss on conversion only:** when FX → TRY, owner enters TRY received; difference from average book cost posts to FX Gain (`4200`) or FX Loss (`5600`). **Holdings are never revalued** — no mark-to-market.
- **Spending FX — resolved patterns:**
  - **Business payments (~90%): convert FX → TRY first.** Dollars leave the USD wallet; the **actual lira received** is entered (a money movement between own wallets); then the expense is paid **in lira, normally**. No FX-expense puzzle — it's already lira.
  - **Forex salaries: paid directly in forex** — see Section 16.
  - **Owner withdrawal / savings:** if FX is taken out personally → owner withdrawal (not a business expense).

---

## 16. Staff (per restaurant)

- **Each employee has a pay currency** (TRY for most; USD/EUR for forex-paid workers).
- **Staff ledger per employee runs in that pay currency:** salary accrued, advances (avans) paid, payments made, current balance. Plus a **total of all salaries** over any date range.
- **Forex-paid workers:** wages **agreed in forex AND paid in forex** (e.g. "$500/month"). Ledger lives **in forex** so it stays stable and doesn't wobble with the rate. If short on FX, the owner **buys FX first** (TRY → FX) then pays in FX. For the **company-wide wage cost in lira**, each forex salary payment is converted to lira **at its value when paid** (owner enters it — no online rates).
- **No double-counting:** **salary = the expense (cost)**; **advance and final payment = money movements** that settle it.

---

## 17. Partner expense reimbursements (per restaurant)

- **Not capital tracking** — the owner does NOT need "who put in how much."
- **Light per-partner reimbursement ledger:** when a partner pays a business/daily expense out of pocket → the business **owes him** → repaid → cleared.
- **No double-counting:** the expense is still recorded once in its normal category; the reimbursement ledger only tracks *who fronted it and whether they're squared up*.

---

## 18. Roles & permissions (per restaurant)

- **Owner + active partners:** full access.
- **Cashier:** limited — add data and correct mistakes only, on **recent/unlocked** entries; all changes **audit-logged**. Sees only their assigned restaurant.
- **Inactive partner:** view-only, no changes.
- Roles are built as an **extensible permission layer**, so finer per-module permissions can be added later without rework. Access is always **per entity**.

---

## 19. Opening balances (running business, per restaurant)

- App goes live on a chosen start date for an already-running business.
- Per restaurant, enter opening figures: **supplier payables, customer receivables, each bank balance, each card balance, cash in drawer, USD/EUR/GBP holdings, staff balances, partner reimbursement balances.**
- Opening balances are just ledger entries dated day one, posting against **Opening Balance Equity**.
- A **setup / onboarding wizard** seeds each new restaurant's chart of accounts + categories + bank/card accounts, asks **whether delivery is enabled (and which platforms)**, then walks through entering the opening balances. (Idea from the previous app.)

---

## 20. Needs Review — what goes to the queue

Unknown supplier; possible duplicate invoice; possible duplicate bank/manual/receipt entry; unclear invoice total; unclear VAT; unclear date; unclear bank account; unclear card; unclear statement period; possible double-recording risk; unknown category; possible same-item spelling (handwritten expenses); inferred POS commission to confirm; transfer with unknown destination account; unclear which restaurant a document belongs to.

---

## 21. Automate vs. confirm

- **Safe to automate:** reading/extraction, duplicate-file detection, math checks (net + VAT = gross), pre-filling pickers, suggesting categories, classifying obvious own-account transfers, reading e-Fatura XML.
- **Always require owner confirmation:** creating a new supplier/customer/account/category, assigning an uncertain supplier, anything flagged as a possible duplicate, linking uncertain settlements, any uncertain amount/date/VAT, merging handwritten expense-item spellings, editing anything in a locked period, anything where the restaurant is unclear.
- Rule of thumb: **automate reading and suggesting; require confirmation for creating and committing anything that affects a balance.**

---

## 22. Handwritten expense items — spelling tolerance

- Needed for **handwritten expense items**, NOT suppliers (e.g. "peyir" / "peynir" / "cheese" must not be treated separately).
- **Record exactly what was written** (no rewriting/translation), but **link to one canonical item** behind the scenes so reports group correctly.
- **Ask before merging** ("peynir" vs "paneer" may differ). Confirm once; the app remembers.

---

## 23. Dashboard (per restaurant)

Total sales, cash sales, POS/card sales, delivery sales (per platform), total expenses, net result, total payables, payables preview by supplier, total receivables, delivery money in transit (per platform), tax-department payments, items needing review, possible duplicates/warnings, total money position (TRY accounts summed; FX balances shown separately in their own currency, not converted).
**Filters:** from date, to date, supplier, bank account, credit card, expense category.

---

## 24. Reports & Excel export (per restaurant)

Custom date ranges (from/to). Each export has its own columns. Possible exports: Sales; Daily expenses; Supplier invoices; Supplier ledger; Payables; Customer/receivables ledger; Bank transactions; Credit card transactions; KDV from supplier invoices; Tax-department payments; Staff/salary; FX ledger; Partner reimbursements; **Profit & Loss (P&L); Balance Sheet;** Date-range summary; Needs Review; Full backup. (Owner-only combined-restaurant export is a future option.) All statements/reports are derived from the one ledger — never maintained separately.

**How the reports page is organized (idea borrowed from mature accounting tools, not copied):**
- Reports are grouped into business-meaningful **categories**: *Business overview* (P&L, Balance sheet, **Cash flow**, **Trial balance**, Net-result summary) · *Sales* · *Payables* (supplier balances & ledger) · *Receivables* · *Tax* (KDV input per-rate, tax-department payments) · *Banking & cash* (bank, card, FX) · *Staff* · *Activity / audit*.
- A uniform **management wrapper** applies to every report: pick a **date range** (with **period comparison** — this vs last), **export** (Excel-first, PDF for statements), **favorite / pin** the ones used often, and **role-based access** (e.g. a cashier cannot open the P&L; everything scoped per entity).
- **Only confirmed records appear in reports** — anything still in Needs Review is excluded until approved.
- *(Scheduled / emailed reports — e.g. a weekly summary — parked in `FUTURE_IDEAS.md` for later.)*

---

## 25. UI / design principles

**Full design system: see companion file `DESIGN_SYSTEM.md` (Mizan look) — white shadcn base, composed layout, hairline borders, tabular numbers, **blue** accent, theme-preset + layout switcher, and modern keyboard-friendly interactions. Summary below.**

- Professional, clean, **consistent** — one design language (same buttons, tables, pickers, date pickers, colors, spacing, forms, validation).
- Calm, accountant-style. No flashy colors, no random cards, no mixed component libraries.
- Dense, clear tables; numbers right-aligned in Turkish format. Color only for meaning (red = review/negative, amber = warning, green = confirmed).
- Pickers read from saved lists — never empty, never free-text-first. A clear, always-visible **restaurant switcher**.
- Review screens show: original document, extracted data, confidence per field, warnings, clear actions.
- **Modern, user-friendly interactions** (see `DESIGN_SYSTEM.md` §10): **Enter** submits / logs in, **type-or-pick** date entry, **type-to-filter** pickers, smart defaults, inline validation, autosave — minimal clicking, feels like a modern app.
- **Desktop first**; basic upload/review works on mobile.

---

## 26. Build rules for Cursor → see `CURSOR_RULES.md` and `ROADMAP.md`

- **This document (Decisions) = WHAT to build.**
- **`CURSOR_RULES.md` = HOW to build it** — slices, completion gate, git discipline, Recovery Protocol, bug protocol, tests, and record-keeping. **Process rules live only in `CURSOR_RULES.md`** — not duplicated here.
- **`ROADMAP.md` = WHERE we are** — current phase, active slice, status, and what's next. Updated after every slice (see `CURSOR_RULES.md` §2).
- Keep all three files together. If they ever disagree, STOP and ask the owner.
- *(Pointers only — rules are NOT restated here, to avoid drift.)*

---

## 27. Roadmap (build order — nothing advances until tested + owner sign-off)

- **Phase 0 — Setup:** project, rulebook, record-keeping files (see `CURSOR_RULES.md` §8 — `ROADMAP`, `PROGRESS`, `CHANGELOG`, `BUGLOG`, `DECISIONS`, `TESTS`), multi-restaurant foundation, opening-balances plan.
- **Phase 1 — Ledger core + supplier invoices:** double-entry engine + **chart of accounts**, audit trail, soft-delete/void, basic manual journals, read e-Fatura invoices. (Start here.)
- **Phase 2 — Suppliers & payables.**
- **Phase 3 — Banking hub + bank statements:** account tree, import & classify, transfer linking, opening balances.
- **Phase 4 — POS settlement + credit cards.**
- **Phase 5 — Cash drawer, forex, staff, partner reimbursements, receivables.**
- **Phase 6 — Sales intake (POS daily-summary photo + delivery platform reports) + tips + expenses:** POS photo for cash/card; per-platform delivery (gross / commission / net) with clearing accounts; commission e-Faturas via the vendor pipeline; manual entry; handwritten reading as fallback, with expense-item spelling tolerance.
- **Phase 7 — Dashboard, reports, Excel export, financial statements (P&L, Balance Sheet, Cash flow), per-rate KDV report, period comparison.**
- **Phase 8 — Roles & permissions, backups, security hardening, launch.**
- **Later:** proper KDV/tax-return module; per-rate VAT separation; FX revaluation; owner combined-restaurant view.

*Note on order: phases can be resequenced if a dependency requires it — e.g. basic card/delivery **sales intake** (Phase 6) may need to land with or just before **settlement** (Phase 4), since settlements reconcile against sales. The firm rule is "each slice ships tested and signed off," not the exact phase numbering.*

---

## 28. Risks to avoid

- Treating "pages" as separate data instead of views of one ledger.
- **Any cross-restaurant leak** (the #1 isolation rule).
- Editing posted records in place instead of voiding/reversing.
- Over-trusting handwriting OCR (review queue is the main path there).
- Letting suppliers or expense items multiply due to spelling.
- Mixing purchase-KDV with tax-authority payments.
- Misreading Turkish number/date formats (the 1000× error).
- Forcing per-day matching of POS sales to bank deposits (they batch & delay).
- **Trusting the POS's aggregate total** — it double-counts delivery; always compute the real total from trusted per-channel sources.
- **Forcing delivery payouts into fixed periods** — each platform pays on a different schedule; use per-platform clearing balances instead.
- Carving tips out of sales (sales are recorded gross; a tip is a separate cash expense, owner decision 2026-06-23).
- Double-counting: invoice + payment, salary + advance, card purchase + bank-to-card payment, sale + deposit, own-account transfers, partner-fronted expense + reimbursement.
- Building everything at once instead of invoices-first.
- **Out of scope (deliberately):** inventory/stock tracking — a whole separate chapter, not now.

---

## 29. Open items to confirm later

- Whether e-Fatura **XML** is downloadable from GİB (vs. PDF only).
- Whether any **bank account/card is shared** across restaurants (would complicate strict isolation).
- If/when **per-rate KDV** separation is actually needed.
- The future **KDV/tax-return** module's rules.
- Exact **Excel layouts** your accountant (mali müşavir) wants, if they'll use the exports.
- Future-optional: average-cost TRY **valuation of remaining FX holdings**; owner **combined-restaurant** overview.
