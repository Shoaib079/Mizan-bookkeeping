# Phase 2 — one answer to "can this be edited or voided"

Read this before any code is written. Nothing here is built yet.

---

## What I found that the plan had wrong

The plan says five places decide edit/void and the fix is to make the frontend
ask the API instead of keeping its own copy. Reading the code, **the endpoint
already exists and the main ledger screen already asks it**:

```
GET /entities/{entity_id}/ledger/entries/{entry_id}/actions
→ { can_edit, can_void, void_path, edit: { kind, context } }
```

`gl-entry-actions.tsx` has called that since it was written. So this is not a
build-the-mechanism job. It is a *finish the migration* job, and the work is
smaller and less risky than the plan implies.

Here is what each of the five places actually is:

| # | Place | What it really does | Verdict |
| --- | --- | --- | --- |
| 1 | `correction.py` registries | 19 dedicated routes + 21 void-only sources, with a completeness check that already fails fast on an unclassified source | **Keep.** This is the fact. |
| 2 | `entry_actions.py` resolver | 46 hand-written branches producing the answer above | **Collapse to a table.** |
| 3 | `subledger-actions.ts` | 241 lines: a second copy of #1 in TypeScript, plus five `xRowActions` helpers | **Delete.** |
| 4 | `gl-entry-actions.tsx` switch | 10 cases on `edit.kind`, choosing which *form* to open | **Keep.** Not a second opinion — the API says which form, this renders it. Already guarded by `gl-edit-kinds.test.ts`. |
| 5 | Per-entity pages | customers, partners, staff, transaction drawer, general ledger panel — each calls a helper from #3 | **Point at the endpoint.** |

So: one collapse, one deletion, five call sites re-pointed. Not a rewrite.

---

## Why the resolver cannot be a plain lookup table

Every branch does the same three things, and the middle one is why a flat
`dict[source, capability]` will not work:

```python
if source in {PARTNER_EXPENSE_FRONTED, PARTNER_REIMBURSEMENT_PAID,
              PARTNER_DRAWING, PARTNER_DRAWING_REPAYMENT}:
    row = session.scalar(select(PartnerLedgerEntry)
                         .where(PartnerLedgerEntry.journal_entry_id == entry_id))
    if row is None:
        return LedgerEntryActions(can_edit=False, can_void=False, void_path=None)
    return LedgerEntryActions(
        can_edit=True, can_void=True,
        void_path=f"partners/{row.partner_id}/ledger/{entry_id}/void",
        edit=LedgerEntryEditContext(kind="partner_ledger", context={...}),
    )
```

1. **Find the owning subledger row** — different model, different FK per source.
2. **Build the void path from that row's owner id** — `partners/{partner_id}/…`,
   `suppliers/{supplier_id}/…`. The path is not knowable without the lookup.
3. **Build the edit context** from the row's fields.

Steps 1 and 2 are mechanical and identical in shape everywhere. Step 3 genuinely
differs per source. So the table holds the mechanical parts and takes a small
function for the part that is really different:

```python
@dataclass(frozen=True)
class Capability:
    owner_model: type | None          # PartnerLedgerEntry, SupplierLedgerEntry, …
    owner_id_field: str | None        # "partner_id"
    void_path: str | None             # "partners/{owner_id}/ledger/{entry_id}/void"
    edit_kind: str | None             # "partner_ledger"  (None ⇒ void only)
    context: Callable[[Any], dict]    # row → the edit form's fields

CAPABILITIES: dict[JournalEntrySource, Capability] = { ... }
```

The resolver becomes one function: look up the capability, find the row, format
the path, build the context. **46 branches → ~20 table rows.**

Sources with no dedicated route keep `edit_kind=None` and the generic void path,
which is what the void-only set already means.

---

## Correction: two capabilities depend on the row, not the source

Decisions taken 9 Aug: **batch endpoint, buttons hidden while loading, backend
wins where the two disagree.**

I derived the table mechanically from the resolver rather than transcribing 46
branches by hand — and the derivation was wrong, which is worth recording
because it is the same mistake in a new place. It took "the last
`LedgerEntryActions` in a branch" as that branch's answer. Two branches have an
*inner* condition, so the last one is a fallback, not the answer:

- **`CUSTOMER_CREDIT_SALE` / `GROUP_SALE`** — a group sale *with* a
  `reference_id` voids at `group-sales/{reference_id}/void` and edits as
  `group_sale`. Without one, and for every credit sale, it is
  `customers/{customer_id}/credit-sales/{entry_id}/void` and
  `customer_credit_sale`.
- **`PARTNER_SUPPLIER_PAID`** — likewise two answers.

Counted properly: **22 branches give one answer per source, 2 depend on the
row.** So a flat table is right for 22 of 24, and forcing the last two into it
would mean inventing a rule the code does not have.

The table therefore allows one escape:

```python
Capability(..., resolve=None)                 # the 22: table answers directly
Capability(..., resolve=_group_sale_answer)   # the 2: a function reads the row
```

with the guard requiring that any source using `resolve` is listed with its
reason — the same shape as `KNOWN_UNWIRED` in `gl-edit-kinds.test.ts`, so the
exceptions stay visible instead of becoming the norm.

Had I not checked, the table would have said every credit sale voids at a
group-sale URL. Those routes exist, so nothing would have 404'd; it would
simply have voided against the wrong record.

---

## What this buys, concretely

The five reports in the plan's opening table were five different files with one
cause. Under the table:

- *"registry said void-only, resolver had no branch — so neither"* — impossible.
  There is one entry per source; there is no second place to disagree with.
- *"resolver built a URL no route matched"* — the path is a template on the
  same row as the owner lookup that fills it, and the existing
  `test_void_paths_resolve.py` scan runs over the table instead of over 46
  scattered f-strings.
- *"edit only on one invoice"* — a source either has an `edit_kind` or it does
  not, for every entry of that source.

And the completeness check that already exists in `correction.py` extends
naturally: every `JournalEntrySource` must appear in `CAPABILITIES`, so a new
source fails at import rather than silently offering nothing.

---

## How it lands without a big-bang switchover

Four steps, each shippable and green on its own. **Nothing is deleted until the
thing replacing it is proven.**

**Step 1 — build the table beside the resolver, change no behaviour.**
Add `CAPABILITIES` and a `resolve_from_table()` that produces the same
`LedgerEntryActions`. Do not call it from the endpoint yet. Add a test that,
for every source and a representative entry, the table and the existing
resolver return **identical** answers. This is the whole safety argument: the
old code is the specification, and the test says the new code matches it.

**Step 2 — switch the resolver over, delete the branches.**
Only once step 1's equivalence test is green. The endpoint's output does not
change, so no frontend change is needed and nothing user-visible moves.

**Step 3 — point the five frontend call sites at the endpoint.**
One per commit: customers, partners, staff, transaction drawer, general ledger
panel. Each replaces a local `xRowActions(...)` with the fetched actions. The
pages already render `can_edit` / `can_void` / `void_path`; they just get them
from a different source. **This is the only step with visible behaviour**, and
where a page currently disagrees with the backend, the backend wins — which is
the point, and also why these are separate commits rather than one.

**Step 4 — delete `subledger-actions.ts`.**
Once nothing imports it. If anything still does, the migration is not finished
and this step simply does not happen yet.

---

## What I want you to decide before I start

**a) Does the API answer per row, or per page?**
Today `gl-entry-actions.tsx` fetches `/actions` for **one entry at a time**, on
demand. A supplier page showing 50 rows with Edit/Void buttons cannot make 50
requests. Two options:

  - **Batch endpoint** — `POST /ledger/entries/actions` with a list of ids.
    One request per page, no change to the per-row answer.
  - **Embed in the list** — each subledger list endpoint returns `actions`
    inline on every row. Fewer requests still, but it puts capability logic
    into six list endpoints, which is a little of the old spreading-out.

I lean to the batch endpoint: one new route, no change to any list response,
and the per-row answer stays in exactly one place.

**b) What happens on a page while the actions are loading?**
Buttons hidden until the answer arrives, or shown-and-disabled? Hidden is
honest but makes rows jump. Disabled-then-enabled is steadier but shows a
control that might turn out not to exist. I lean to **hidden**, because a
button that appears and then vanishes is the same "did I imagine that" problem
as a button that does nothing.

**c) Is a behaviour change acceptable where the two currently disagree?**
Step 3 will find rows where the frontend offers Edit and the backend says no,
or the reverse. Backend wins. That means some buttons will disappear and some
will appear. I will list every difference before the commit that changes it,
but I want to know now that this is the intent rather than a regression.

---

## The table, as derived from the code today

Void paths shown as templates. `<generic>` is `ledger/entries/{entry_id}/void`.

| Source | Edit | Void | Edit kind | Void path |
| --- | --- | --- | --- | --- |
| *generic correctable* | ✅ | ✅ | `generic_ledger` | `<generic>` |
| *generic void-safe* | — | ✅ | — | `<generic>` |
| `EXPENSE_ENTRY` | ✅ | ✅ | `expense` | `expenses/{id}/void` |
| `PARTNER_EXPENSE_FRONTED` | ✅ | ✅ | `partner_ledger` | `partners/{partner_id}/ledger/{entry_id}/void` |
| `PARTNER_REIMBURSEMENT_PAID` | ✅ | ✅ | `partner_ledger` | ” |
| `PARTNER_DRAWING` | ✅ | ✅ | `partner_ledger` | ” |
| `PARTNER_DRAWING_REPAYMENT` | ✅ | ✅ | `partner_ledger` | ” |
| `PARTNER_CAPITAL_CONTRIBUTION` | — | ✅ | — | ” |
| `PARTNER_LOAN_RECEIVED` | — | ✅ | — | ” |
| `PARTNER_LOAN_REPAID` | — | ✅ | — | ” |
| `PARTNER_PROFIT_PAID` | — | ✅ | — | ” |
| `EXPENSE_PERSONAL_SPLIT` | — | ✅ | — | ” |
| `PARTNER_PROFIT_ALLOCATION` | ✅ | ✅ | `partner_profit_allocation` | `partners/profit-allocation/{entry_id}/void` |
| `STAFF_ACCRUAL` | ✅ | ✅ | `staff_ledger` | `staff/employees/{employee_id}/ledger/{entry_id}/void` |
| `STAFF_ADVANCE` | ✅ | ✅ | `staff_ledger` | ” |
| `STAFF_PAYMENT` | ✅ | ✅ | `staff_ledger` | ” |
| `CUSTOMER_PAYMENT_RECEIVED` | ✅ | ✅ | `customer_payment` | `customers/{customer_id}/payments/{entry_id}/void` |
| `PAYMENT` | ✅ | ✅ | `supplier_payment` | `suppliers/{supplier_id}/payments/{entry_id}/void` |
| `INVOICE` | ✅ | ✅ | `supplier_invoice` | `suppliers/{supplier_id}/invoices/{entry_id}/void` |
| `DELIVERY_COMMISSION` | ✅ | ✅ | `delivery_commission` | `invoices/delivery-commission/{entry_id}/void` |
| `FX_PURCHASE` | ✅ | ✅ | `fx_purchase` | `fx/purchases/{entry_id}/void` |
| `FX_CONVERSION` | ✅ | ✅ | `fx_ledger` | `fx/ledger/{entry_id}/void` |
| `FX_EXPENSE_SPEND` | ✅ | ✅ | `fx_ledger` | ” |
| `CARD_SALES` | — | ✅ | — | `pos/card-sales/{id}/void` |
| `POS_SETTLEMENT` | — | ✅ | — | `pos/settlements/{id}/void` |
| `DELIVERY_REPORT` | — | ✅ | — | `delivery/reports/{id}/void` |
| `DELIVERY_SETTLEMENT` | — | ✅ | — | `delivery/settlements/{id}/void` |
| `CUSTOMER_CREDIT_SALE` / `GROUP_SALE` | ✅ | ✅ | **row-dependent** | **row-dependent** |
| `PARTNER_SUPPLIER_PAID` | — | ✅ | — | **row-dependent** |
| *rest of `VOID_AND_REENTER_SOURCES`* | — | ✅ | — | `<generic>` |

Three of the thirteen edit kinds — `group_sale`, `fx_purchase`, `fx_ledger` —
have no frontend case. That is already known and documented in
`gl-edit-kinds.test.ts`'s `KNOWN_UNWIRED`, each with the reason, and the
default arm now says so rather than doing nothing. Not this phase's job.

---

## How it actually ended — steps 3 and 4 were the wrong plan

Steps 1 and 2 landed as designed: 46 branches became a 31-row table, and
`entry_actions.py` went from 546 lines to 76.

Steps 3 and 4 — point the five frontend surfaces at the endpoint, delete
`subledger-actions.ts` — were **abandoned on evidence**, and the evidence came
from the difference list rather than from building it and finding out.

**The differences, measured.** On the *source* axis, four disagreed:
`opening_balance`, `pos_card_tip`, `credit_card_payment`, `cash_movement` —
frontend said void-only, backend said nothing at all. Those turned out to be
four **dead buttons**: the General ledger draws its buttons from the frontend's
list and only asks the API what a click should *do*, so it drew a Void, then
read `void_path: null` and returned in silence. Fixed by deleting the four from
the frontend's set, and pinned by a guard comparing the two lists.

**Then the axis problem.** The per-entity pages do not key on journal source at
all — they key on *movement type*, and one journal entry can own several rows:

| Subledger | Rows per entry |
| --- | --- |
| Partner profit allocation | one per partner, written in a loop |
| Staff salary payment | two; a period payment writes three |
| Customer | one — every path writes exactly one |

So the backend is right about the *entry* and would be wrong about the *row*.
A Void on one partner's profit-allocation row voids every partner's share. The
frontend hiding those buttons is not drift — it is a guard the backend cannot
currently express, and "backend wins" was the wrong instruction for that half.

**What was done instead.** The source-keyed half is now guarded against drift.
The movement-type half stays, with the reason written where someone deleting
it would read it. Migrating it is recorded as owed item D2, and it is *cheaper*
now than before: the table already knows each source's owner model, so the row
count is one query in one place rather than a change to 46 branches.

The check also turned up a live bug that predates all of this — owed item D3,
voiding a group-sale discount voids the whole sale.

**The lesson worth keeping.** The plan said "five places decide this, collapse
them to one". Four of the five were the same question. The fifth was a
different question wearing the same words, and the only thing that revealed it
was counting rows per journal entry — which nobody had asked, because the plan
had already decided what the answer was.

---

## What is deliberately not in this phase

- **Supplier credit notes (iade)** still have no correction or void route.
  Under the table they will be one honest row saying so. Writing the route is
  its own piece of work (plan item 2.5).
- **The `edit.kind` switch in `gl-entry-actions.tsx`** stays. It maps a kind to
  a React form; that is rendering, not policy, and it is already guarded.
- **`correction.py`'s registries** stay where they are. `CAPABILITIES` reads
  them rather than restating them.
