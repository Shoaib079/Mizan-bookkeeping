# Hardening plan — stop the same bug arriving twice

## Why this document exists

One evening produced eleven fixes. Almost none of them were new bugs — they
were the *same six mistakes* in different rooms of the app, and each was found
by the owner using the app, not by a test.

The clearest example is void and edit. It has been reported perhaps a dozen
times across months, in slightly different words each time, and it was never
one bug:

| Reported as | Actually |
| --- | --- |
| "Edit does nothing" | resolver offered a kind the UI switch had no case for |
| "no edit on delivery commission" | registry said void-only, resolver had no branch — so neither |
| "Not Found" on void | resolver built a URL no route matched |
| "edit only on one invoice" | auto-post borrowed a source classified uneditable |
| "voided but still there" | the route worked; the paired draft was never released |

Five reports, five different files, one cause underneath: **whether a thing can
be edited or voided is decided in five separate places that must agree.**

That is the shape of every item below. This plan is organised by *class of
mistake*, not by bug, because fixing instances is what got us here.

---

## The scoreboard

Counted on 9 August 2026.

| | |
| --- | --- |
| Source files | 833 |
| Files past the ~400-line rule | 82 (9% of files, 40% of all code) |
| Golden rules with an automated guard | 6 of 19 |
| Places that decide "can this be edited or voided" | 5, ~165 decision points |
| Pages that reset on entity switch (rule 16) | 16 of 91 |
| Weak assertions in frontend tests | 29 |

---

## Class 1 — One decision, many copies

**The mistake.** A fact is written down in more than one place, and the copies
drift. Nothing notices, because each copy is internally consistent.

**Confirmed instances.**

- **Void/edit eligibility — five copies.**
  1. `core/ledger/correction.py` — the source registry (41 sources)
  2. `core/ledger/entry_actions.py` — the resolver (45 return points)
  3. `lib/subledger-actions.ts` — the frontend's own copy of the same sets
  4. `components/ledger/gl-entry-actions.tsx` — a `case` per edit kind (10)
  5. supplier / fx / expenses / partner / staff pages — their own wiring
- **Chart-of-account codes** are string literals on both sides: `5500`, `5200`,
  `1500`, `2000` each appear in backend *and* frontend files. A renumbered
  chart breaks the frontend silently.
- **Mobile breakpoint `819`** appears in four frontend files. This one *is*
  guarded by a test — proof the pattern is fixable.

**The rule.** *A fact has one home. Everything else asks.*

**How to enforce it.** Collapse, then guard what cannot collapse:

- One backend table: `source → {edit route, void route, edit kind, form}`.
  The resolver reads the table instead of 45 hand-written branches.
- The frontend stops keeping its own registry and asks the API. Copies 3 and
  most of 4 stop existing.
- Account codes: one generated constants file, or a test asserting the two
  sides agree — the same shape as the existing `819` test.

**Why this one is first.** It is the only item that *removes* bugs rather than
detecting them. Everything else on this list gets smaller once there is one
copy.

---

## Class 2 — A paired record left stale

**The mistake.** A journal entry changes state; the record beside it does not.
Nothing errors — the app just describes a world that no longer exists.

**Confirmed instances.**

- **Invoice drafts on void** — fixed tonight, and only after the delivery
  commission version had been written hours earlier with a comment explaining
  exactly this. The supplier-invoice version was left alone.
- **Bank statement lines — still broken.**
  `reset_statement_lines_for_voided_journal` exists, its docstring says
  *"unlink bank lines when their journal was voided outside the statement
  UI"*, and it is called from **exactly one place**: `staff/service.py`.
  Void a supplier payment, expense, customer payment, card payment or bank fee
  that came from a bank import through any other route and the line still
  reads LINKED/POSTED. **The bank import looks reconciled when it is not**, and
  the line cannot be re-classified. A statement line can post as any of
  thirteen journal sources; one of them cleans up.

**The rule.** *Void is not finished until every record that pointed at the
entry has been told.*

**How to enforce it.** Move the release into the shared void machinery so it
cannot be forgotten per-caller, plus a test that walks each void function and
asserts that any table holding `journal_entry_id` is either updated or
explicitly declared as not needing it.

---

## Class 3 — A string that has to match something else

**The mistake.** A path, key or identifier is assembled in one language and
consumed in another. Nothing type-checks across that gap.

**Confirmed instances.**

- **Void paths** — three carried a `payables/` segment the router has no
  prefix for. 404 on every attempt. *Now guarded* by
  `test_void_paths_resolve.py`.
- **Edit routes — not guarded.** The resolver returns 13 edit kinds; nothing
  checks the correction endpoints they imply exist.
- **Idempotency keys** — eleven mutations sent none and were rejected in
  production only. *Now guarded* by a source scan.

**The rule.** *If a string must match a route, a test resolves it.*

**How to enforce it.** Extend the void-path guard to cover edit routes and
every correction endpoint in `DEDICATED_CORRECTION_ROUTES`.

---

## Class 4 — A control that does nothing

**The mistake.** The UI offers an action it cannot perform. The user cannot
tell a broken button from a working one, so there is nothing to report but
"nothing happens".

**Confirmed instances.**

- `startEdit`'s `default: return` swallowed five edit kinds — supplier
  invoices, supplier payments, group sales, FX purchases, FX conversions.
  *Two wired, three declared,* and the default arm now speaks.
- Delivery commission offered neither edit nor void; a wrong one was stuck.
- Supplier credit notes (iade) still have **no correction or void route at
  all**. The buttons no longer 404 because they no longer appear — the entry
  is now uncorrectable in-app, which is honest but not finished.

**The rule.** *No silent fallback on a user action. Either it works, or it
says why, and a test proves the offer matches the capability.*

**How to enforce it.** `gl-edit-kinds.test.ts` already compares backend kinds
to frontend cases. Extend the same comparison to the five per-entity surfaces,
which each wire their own actions.

---

## Class 5 — A default filter that hides real data

**The mistake.** A list defaults to a date window and filters on the
*document's* date, not the day it arrived. The common case falls outside.

**Confirmed instances.**

- **Invoice queues** — fixed. An invoice dated 31 July, uploaded 8 August,
  was in payables and on no tab of the review screen.
- **Still live:** expenses review, sales review, expense-items review. A
  receipt dated 28 July uploaded on 2 August is invisible in "needs review".
- **Badges and lists disagree by construction.** `review_counts` has **no date
  filter at all**; the lists have one. The badge says three, the list shows
  none. This is the sharpest symptom of the above and the reason "where did it
  go" keeps being the question.

**The rule.** *A queue of work waiting on you is never filtered by the
document's own date. A badge and its list run the same query.*

**How to enforce it.** Derive both from one query builder; a test asserts the
count endpoint and the list endpoint apply identical filters.

---

## Class 6 — Only broken in production

**The mistake.** The failure needs production configuration, a real viewport,
or a specific library version. Local green means nothing.

**Confirmed instances.**

- **Idempotency** — `IDEMPOTENCY_ENFORCEMENT=false` locally, `true` in
  production. Eleven mutations worked on the machine and 400'd on the site.
- **Toasts behind the mobile tab bar** — every confirmation the app has ever
  shown on a phone was invisible. Needs a narrow viewport to see.
- **`app.routes` is not flat** in the deployed FastAPI version, so a guard
  test found zero routes and reported nineteen false failures.

**The rule.** *Something must exercise the deployed app under production
settings.*

**How to enforce it.** A smoke test against the deployed URL: sign in, upload
a fixture invoice, check the receipt, void it, confirm the draft released.
Plus one CI run with production-shaped env vars.

---

## Class 7 — A misread that hides its own evidence

**The mistake.** Extraction gets a field wrong in a way that suppresses the
usual signs.

**Confirmed instances.**

- **The date.** `Bir Sonraki Son Ödeme Fatura Tarihi` was taken as the invoice
  date; the amount was right, so nothing looked wrong, and every screen that
  could have shown it was filtered by date. *Parser fixed; a future-date gate
  now blocks auto-post.*
- **The tax.** `KDV (20%) (Matrah …)` with the amount on the next line was not
  matched, so the reader assumed one 20% line across the whole net-to-gross
  gap — booking a communication tax and a radio licence fee as reclaimable
  VAT. **585,75 where the document said 185,83.** *Fixed for this layout.*
- **Still open:** any invoice still flagged `assumed_vat` has the same
  overstatement. `24.pdf` in the fixtures does. This reaches a KDV return.

**The rule.** *A derived figure that cannot be read is flagged, never assumed
into a total that posts.*

**How to enforce it.** Audit existing posted invoices carrying the flag; treat
`assumed_vat` as blocking for auto-post the way a future date now is.

---

## Class 8 — Tests that cannot fail

**The mistake.** A test that passes whether or not the feature works. Worse
than no test: it reports coverage that does not exist.

**Confirmed instances, all mine, all tonight.**

- A guard that matched the *import line* rather than the applied class, so the
  fix could be deleted and the test stayed green.
- A message assertion comparing a function against itself.
- A failure message (`assert 0 == 1`, then `assert 0 >= 15`) that could not
  distinguish a broken feature from a broken test — twice, the second time
  after I had written a paragraph complaining about the first.
- 29 weak assertions across the frontend suite (`toBeDefined`, `not.toThrow`).

**The rule** already exists — Definition of Done 4 — and nothing enforces it.

**How to enforce it.** Mutation spot-checks on guard tests: break the thing,
watch the test go red, in the same commit. Where a test cannot be broken on
purpose, it is not a test.

---

## Class 9 — Rules written but not enforced

Six of nineteen golden rules have a guard. These do not:

| Rule | Status |
| --- | --- |
| 4. Audit trail on every change | no guard |
| 15. UI cannot weaken a core rule | no guard |
| 16. Entity-switch hygiene on every page | no guard — 16 of 91 pages |
| DoD 4. No self-passing tests | no guard |
| ARCHITECTURE: split past ~400 lines | no guard — 82 files over |

The file-size rule is not cosmetic. `correction.py` (2,343 lines) and
`statements.py` (3,065) are exactly where tonight's bugs lived. Large files are
where a missing branch is invisible.

---

## The plan

Ordered so each step makes the next one smaller.

### Phase 1 — Stop the bleeding (highest risk, live now)

| # | Work | Class |
| --- | --- | --- |
| 1.1 | Statement-line release moved into the shared void machinery, + guard | 2 |
| 1.2 | Remove the date filter from the three remaining review queues | 5 |
| 1.3 | Badge and list share one query, + guard | 5 |
| 1.4 | Audit posted invoices flagged `assumed_vat`; block auto-post on it | 7 |

*(1.1 is the "statement-line reset" item; 1.2 and 1.3 are the "review queue
date filter, one query for badge and list" item; 3.1 and 3.2 are the
"production smoke test" item.)*

**Why first:** 1.1 means the bank import can currently claim to be reconciled
when it is not. 1.2 and 1.3 are the bug you hit last night, still live in three
other queues. 1.4 touches a tax return.

### Phase 2 — Collapse the copies

| # | Work | Class |
| --- | --- | --- |
| 2.1 | One backend capability table for edit/void; resolver reads it | 1 |
| 2.2 | Frontend asks the API; delete its registry and the switch | 1 |
| 2.3 | Edit routes resolution-checked like void paths | 3 |
| 2.4 | Capability guard extended to the five per-entity surfaces | 4 |
| 2.5 | Credit-note correction and void route | 4 |

**Why second:** this is the fix that ends the void/edit class rather than
patching it. It is also the largest, which is why the bleeding stops first.

### Phase 3 — Make the rules real

| # | Work | Class |
| --- | --- | --- |
| 3.1 | Smoke test against the deployed app, production env | 6 |
| 3.2 | CI run with production-shaped settings | 6 |
| 3.3 | Entity-switch guard across all 91 pages | 9 |
| 3.4 | Shared chart-code constants, one home | 1 |
| 3.5 | File-size guard with a declared, shrinking allow-list | 9 |

### Phase 4 — Pay down what hides the rest

Not tidiness. Both of these files are where a missing branch went unnoticed,
and they need **opposite** treatment — which is the point of measuring before
splitting.

#### 4a. `correction.py` — 2,343 lines, splits cleanly

The file is already organised; it is just all in one place. Measured shape:

| group | functions | lines |
| --- | --- | --- |
| `correct_*` (per document type) | 13 | 1,170 |
| `void_*` (per document type) | 13 | 479 |
| private helpers | 18 | 377 |

And the pairs fall into domains with no overlap:

| would become | functions | lines |
| --- | --- | --- |
| `correction/customer.py` | 4 | 330 |
| `correction/supplier.py` | 4 | 240 |
| `correction/fx.py` | 4 | 236 |
| `correction/pos.py` | 2 | 218 |
| `correction/staff.py` | 2 | 130 |
| `correction/gl.py` | 2 | 128 |
| `correction/delivery.py` | 2 | 112 |
| `correction/partner.py` | 2 | 91 |
| `correction/credit_sale.py` | 2 | 85 |
| `correction/expense.py` | 2 | 79 |

Everything lands under 400 lines, most far under. What stays in a shared
`correction/core.py` is the machinery every domain calls —
`correct_gl_with_subledger_rows`, `void_gl_with_subledger_rows`, the source
registries, `_release_posted_draft`.

**Method.** Pure moves, no behaviour change, one domain per commit, suite green
between each. Keep `correction.py` as a re-export shim so no import in the app
changes in the same commit as a move; delete the shim last, once nothing
imports through it. If a commit does anything other than move lines, it is the
wrong commit.

**What it buys.** Tonight's `void_supplier_invoice` bug was a missing line in a
2,300-line file where the delivery-commission version — with a comment
explaining the exact hazard — sat 500 lines away. In a 240-line
`correction/supplier.py` beside a 112-line `correction/delivery.py`, the two
are readable side by side.

#### 4b. `statements.py` — 3,065 lines, and splitting the *file* would achieve nothing

The measurement says something different here:

```
classify_statement_line   1,713 lines, 140 branch points, 48 classification branches
next longest function       105 lines
```

**One function is 56% of the file.** Moving it into a module of its own leaves
a 1,713-line function — the same problem with a new filename. This is the code
that decides how every imported bank line is classified and posted across
thirteen journal sources, and it is where the statement-line reset gap
(Class 2) lives.

**Method — decompose the function, not the file.** The same seam that worked
for the menu PDF (`document.py` holds facts, `menu_pdf.py` renders them):

1. **Extract the decision.** A pure function: line + rules + context →
   `ClassificationOutcome` describing what should happen. No session, no
   writes. Testable by calling it with a row.
2. **Extract the effects.** One small module per classification family that
   takes the outcome and performs it — post, link, learn, reset. Thirteen
   sources, but they share four shapes.
3. **Leave a thin `classify_statement_line`** that gets the outcome and hands
   it to the effect. Tens of lines, not seventeen hundred.

Do this **after Phase 1.1**, not before: the statement-line release belongs in
the shared void machinery first, so the decomposition does not have to carry a
known bug through it.

**Method note that matters more than the target.** This function posts money.
Every step must be a refactor with the behaviour pinned first: before moving a
line, add characterisation tests that assert the *current* outcome for each of
the forty-eight branches — including the wrong ones. Then move code and watch
them stay green. Changing behaviour and moving it in the same commit is how a
refactor becomes an outage.

#### 4c. The rest

The remaining oversized files — `efatura.py` (1,597), `partners/posting.py`
(1,510), `staff/posting.py` (1,507), `invoices/service.py` (1,444) — get
measured the same way before anything is moved. Some will be 4a-shaped, some
4b-shaped. **Measure, then split; never split by line count alone.**

#### The guard that keeps it from creeping back

A file-size test with a declared allow-list of the files currently over the
limit and their current sizes. A new file over 400 lines fails. An existing
one *growing* fails. Shrinking one is a one-line edit to the list. The list is
the debt, visible and going one direction only.

---

## How to judge whether this worked

Not "tests pass". The measure is:

> The next bug you report should be one I have never fixed before.

If a report matches a class above, the plan failed for that class and the
guard was the wrong shape — not the fix.

## One honest caveat

Phase 2 rewires how every Edit and Void button in the app decides what it can
do. It touches money-moving paths. It should be built in slices with the suite
green between each, and it should not be started on a Friday night after
eleven fixes.
