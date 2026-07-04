# Future ideas — pocket backlog

**Status:** NOT for the current build slice unless promoted into `Restaurant_Bookkeeping_App_Decisions.md` first. Parking lot so good ideas don't get lost. Cautionary lessons from the previous app live in `ARCHITECTURE.md` — not repeated here.

> **Promoted → Phase 13 (`POST_LAUNCH_PLAN.md`):** dashboard "view as chart" (→ DASH-A/DASH-B), unified searchable document archive (→ UX-C "Add document" + UX-B data-first search), spend-by-commodity insight (→ SRCH-B). These are now active plan, not loose backlog.

---

## Reports & insights
- **Scheduled / emailed reports** — *later* (needs email + scheduling infra).
- ~~**Favorite / pinned reports**~~ → **promoted to v1** (cheap).
- **View as chart or table** — *partly v1* (statements show as table + a simple chart); **configurable PDF layouts** *later*.
- **Custom report builder** — *deferred* (a saved-query builder; big feature).
- ~~**Cash flow statement**~~ → **promoted** to the v1 financial-statements set; **business ratios / movement of equity** *later*.
- ~~**Period comparison** (this vs last)~~ → **promoted**; **budgets vs. actuals** *later* (needs a budgeting module).

## Deeper accounting (as you scale up)
- ~~**Full chart of accounts + sub-accounts**~~ → **promoted to v1 (foundational)** — the ledger posts to it; default restaurant chart seeded per entity, editable. *Later:* deep sub-account codes.
- ~~**Basic manual journal entries**~~ → **promoted to v1** (accountant adjustments, audited); **recurring / reversing / adjustment journal templates** *later*.
- **Proper VAT / KDV return module** (output − input, declaration, periods) — **kept deferred on purpose** (rules-heavy and they change). Per-rate input VAT is already captured on supplier invoices, so it's ready when we build this as its own focused project.
- ~~**Surface per-rate KDV on purchase invoices**~~ → **promoted** (invoice posting + future KDV report).
- **Fixed-assets register + depreciation.**
- **Multi-currency revaluation / FX gain–loss posting** — FX Gain/Loss accounts are in the default chart; today we keep FX simple (cost only).
- **Cost of goods / light inventory link** — only if you ever want food-cost % (inventory is out of v1 scope).
- **Year-end close** — closing entries to retained earnings; fiscal-period handling beyond basic month locking. **Implementation note:** today the Balance Sheet's `_unclosed_net_income_kurus` (`backend/app/features/reports/financial_statements.py`) correctly carries *all* accumulated revenue−expenses since inception, because there are no closing entries yet. When year-end close is added, that function must only count the **post-close** period (revenue/expenses since the last close), otherwise prior-year profit would be double-counted — once in retained earnings (via the closing entry) and again in unclosed net income. Add a balance-sheet test that closes a year and asserts the equation still balances.
- **Additional default expense accounts** — optional chart expansion (e.g. Advertising, Fuel, Office supplies) beyond the current rent/salary/utility seed.

## Workflow & control
- **Transaction approval workflow** — e.g. a payment over a threshold needs owner approval.
- **Bulk actions** on table rows — confirm or categorize many at once.
- **Right-side slide-over panel** — quick view/entry without leaving a list.
- **Saved views / filters** per list (started in the preview; expand later).
- **Audit-events trail surfaced as its own report** (raw `ledger_audit_events` — who/when/action; dedicated UI later). *Note: the **general ledger** "all journal entries" report is NOT this — it's promoted to Phase 11.16.*
- Extend **period locking** once a month is closed.

## Banking & automation
- **Bank feeds** — auto-import transactions instead of uploading statements.
- **PDF bank-statement extraction** — *deferred on purpose*. Statement import today is a **canonical template** (CSV/Excel: `transaction_date`, `amount` in lira TRY with Turkish formatting, `description`, `reference`), parsed to integer kuruş server-side — amounts are never guessed. A PDF statement is unstructured and varies per bank, so reliable extraction needs a real per-bank parsing/OCR pipeline. If built, it must route **every** extracted line through Needs Review with the user confirming each amount/date before it's used in reconciliation — never auto-trusted. Likely pairs with bank feeds.
- **Transaction rules** — auto-classify recurring bank lines (rent, the same supplier, etc.).
- **Recurring expense templates** — generate **drafts to confirm**, not auto-post (matches review-first philosophy).
- **Smart match suggestions** for settlements and supplier payments.

## Documents & data
- **Document archive** — *partly done*: per-intake uploads exist + an `/uploads` list page; a **unified searchable archive** (filter by type/supplier/date across all documents) is **deferred** (was out-of-scope in Phase 11). *Later:* that unified archive + full text-search inside document contents.
- ~~**Duplicate-document detection** via file fingerprints~~ → **implemented** (invoice draft upload). *Later:* near-duplicate / similar-document detection.
- **Receipt AI learning store** — remember owner corrections (supplier, category, amount) and pre-fill future receipt reads; borrow the pattern from the previous app's learning map.
- **Backup:** automated backups are **in v1**. *Later:* a polished restore UI and configurable schedules.
- **Import** from existing software or an accountant's export — *still later* (v1 seeds via manual opening balances; maybe a simple supplier CSV import if easy).

## Categories & onboarding
- **Default expense categories with sub-categories** (two levels) — e.g. Utilities → {Electricity, Water, Gas}, Payroll → {Salary, Bonus}; seed per restaurant alongside the chart of accounts.
- ~~**Setup / onboarding wizard**~~ → **in v1 plan** (Decisions §19) — chart seed, delivery toggle, opening balances; *later:* polish UI and category seed from above.

## Multi-user & scale
- **More granular roles & permissions** per module — *later*; v1 has the 3 roles, but the permission layer is built so this plugs in without rework.
- **Owner combined-restaurant overview** — cross-entity, read-only — *early add-on*; the entity-stamped data already supports it, build once the single-entity app is solid.
- **Mobile:** responsive web upload/review is **in v1**; a *native* mobile app is later.
- Customer / vendor portals — *defer* (probably never needed for a restaurant).

## Integrations (later)
- **Accountant (mali müşavir) handoff** — an export format your accountant wants, or shared access.
- **e-Fatura / e-Arşiv direct integration** (GİB or an integrator) to auto-fetch invoices instead of manual upload.
- **Payroll / SGK** integration for staff.

## Restaurant operations & deeper
- **External sales verification** — reconcile sales reported by delivery platforms / the POS provider (Yemeksepeti, Getir, Trendyol, etc.) against recorded sales.
- **Recipe costing / menu pricing / food cost** — Ingredient → Recipe → Recipe lines → Menu item + price history; gives food-cost % (the COGS world we deferred). The previous app had a real structure to borrow later.
- **Partner profit allocation** — distribute profit among partners (beyond our current reimbursement-only scope).

---

*Rule: keep adding to this list freely. Promote an item to the real plan only when we actually decide to build it.*
