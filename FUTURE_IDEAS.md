# Future ideas — pocket backlog

**Status:** NOT for the first version. These are ideas worth keeping for when the business grows and we want deeper accounting. Nothing here changes current scope or the decisions doc — it's just a parking lot so good ideas don't get lost. When one becomes relevant, move it into `Restaurant_Bookkeeping_App_Decisions.md` properly first.

---

## Reports & insights
- **Scheduled / emailed reports** — *later* (needs email + scheduling infra).
- ~~**Favorite / pinned reports**~~ → **promoted to v1** (cheap).
- **View as chart or table** — *partly v1* (statements show as table + a simple chart); **configurable PDF layouts** *later*.
- **Custom report builder** — *deferred* (a saved-query builder; big feature).
- ~~**Cash flow statement**~~ → **promoted** to the v1 financial-statements set; **business ratios / movement of equity** *later*.
- ~~**Period comparison** (this vs last)~~ → **promoted**; **budgets vs. actuals** *later* (needs a budgeting module).

## Deeper accounting (as you scale up)
- ~~**Full chart of accounts + sub-accounts**~~ → **promoted to v1 (foundational)** — the ledger posts to it; default restaurant chart, editable. *Later:* deep sub-account codes.
- **Manual journal entries** — *basic version promoted to v1* (accountant adjustments, audited); **recurring / reversing / adjustment journals** *later*.
- **Proper VAT / KDV return module** (output − input, declaration, periods) — **kept deferred on purpose** (rules-heavy and they change). Per-rate data is already captured, so it's ready when we build it as its own focused project.
- ~~**Surface per-rate KDV** (1 / 10 / 20 / 0%)~~ → **promoted** (the KDV report shows the per-rate breakdown).
- **Fixed-assets register + depreciation.**
- **Multi-currency revaluation / FX gain–loss** (today we keep it simple: cost only).
- **Cost of goods / light inventory link** — only if you ever want food-cost % (currently out of scope).

## Workflow & control
- **Transaction approval workflow** — e.g. a payment over a threshold needs owner approval.
- **Bulk actions** on table rows — confirm or categorize many at once.
- **Right-side slide-over panel** — quick view/entry without leaving a list.
- **Saved views / filters** per list (started in the preview; expand later).
- **Activity log / audit trail surfaced as its own report.**
- Extend **period locking** once a month is closed.

## Banking & automation
- **Bank feeds** — auto-import transactions instead of uploading statements.
- **Transaction rules** — auto-classify recurring bank lines (rent, the same supplier, etc.).
- **Recurring expense templates** (rent, utilities, subscriptions).
- **Smart match suggestions** for settlements and supplier payments.

## Documents & data
- ~~**Document archive**~~ → **promoted to v1** (basic searchable archive). *Later:* full text-search *inside* document contents.
- ~~**Duplicate-document detection** via file fingerprints~~ → **already core in v1.** *Later:* near-duplicate / similar-document detection.
- **Backup:** automated backups are **in v1**. *Later:* a polished restore UI and configurable schedules.
- **Import** from existing software or an accountant's export — *still later* (v1 seeds via manual opening balances; maybe a simple supplier CSV import if easy).

## Multi-user & scale
- **More granular roles & permissions** per module — *later*; v1 has the 3 roles, but the permission layer is built so this plugs in without rework.
- **Owner combined-restaurant overview** — cross-entity, read-only — *early add-on*; the entity-stamped data already supports it, build once the single-entity app is solid.
- **Mobile:** responsive web upload/review is **in v1**; a *native* mobile app is later.
- Customer / vendor portals — *defer* (probably never needed for a restaurant).

## Integrations (later)
- **Accountant (mali müşavir) handoff** — an export format your accountant wants, or shared access.
- **e-Fatura / e-Arşiv direct integration** (GİB or an integrator) to auto-fetch invoices instead of manual download.
- **Payroll / SGK** integration for staff.

---

## Restaurant operations & deeper (mined from the previous app)
- **External sales verification** — reconcile sales reported by delivery platforms / the POS provider (Yemeksepeti, Getir, Trendyol, etc.) against recorded sales.
- **Recipe costing / menu pricing / food cost** — Ingredient → Recipe → Recipe lines → Menu item + price history; gives food-cost % (the COGS world we deferred). The previous app has a real structure for this to borrow later.
- **Partner profit allocation** — distribute profit among partners (beyond our current reimbursement-only scope).
- **Year-end close** — closing entries to retained earnings; fiscal-period + year-end-close handling.
- **FX revaluation** — FX Gain/Loss accounts are already in the default chart, ready for when we move past simple cost-only.

*(See `IDEAS_FROM_PREVIOUS_APP.md` for the full harvest and the cautionary lessons.)*

---

*Rule: keep adding to this list freely. Promote an item to the real plan only when we actually decide to build it.*
