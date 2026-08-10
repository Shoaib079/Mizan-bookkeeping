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
| Files past the ~400-line rule | 84 of 840, holding 55,777 lines — **ratcheted 9 Aug**: none may grow, none may join |
| Golden rules with an automated guard | ~~6~~ → 7 of 19 — Class 3 closed 10 Aug |
| Places that decide "can this be edited or voided" | 5, ~165 decision points |
| Pages that reset on entity switch (rule 16) | ~~16 of 91~~ → all 91, by remount |
| Weak assertions in frontend tests | 29 |
| Real faults found by running Phase 0 on the books | 1 (Class 10), plus 2 checks that were themselves wrong |
| Faults found by building something adjacent, not by looking | 10 — the seven of 9 Aug, plus 204 idempotency, the 403-that-was-a-500, and an RLS-blind inventory (10 Aug) |

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
- **Chart-of-account codes** were string literals on both sides. **Fixed
  9 Aug** — one `lib/account-codes.ts`, guarded against `default_chart.py`.
  Writing the guard found a live bug first: `NON_MANUAL_REVENUE_CODES`
  excluded `4400`, which is not in the chart. FX Gain is `4200`, so the
  account the comment named was on offer in the manual cash-in picker, and
  choosing it would credit a currency gain by hand against the flow that
  already posts one. A filter excluding a code nobody uses excludes nothing.
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
- **Idempotency keys** — eleven mutations sent none and were rejected in
  production only. *Now guarded* by a source scan.
- ~~**Edit routes — not guarded.**~~ **Guarded 10 Aug**, and wider than
  planned: `test_client_paths_resolve.py` checks *every* `/entities/…` URL the
  frontend builds against the OpenAPI schema, not only the correction
  endpoints. Scoping it to edits would have left the rest of the client
  surface exactly as unguarded as the void paths were, and the cost of the
  wider version was the same scan. 225 client paths against 228 routes; 16 of
  them corrections. All resolved — the Edit forms were already correct, and
  the point is that they now cannot stop being.

**The rule.** *If a string must match a route, a test resolves it.*

**Enforced by** `test_void_paths_resolve.py` for the paths the backend hands
out as data, and `test_client_paths_resolve.py` for every path the client
assembles itself. Two exemptions, each with a test that fails when it stops
being needed: `void_path` (covered by the first file) and the partner
movement ternary (its three branches checked concretely).

**Why a `/entities/` prefix is the whole rule.** The scan needs no list of
which strings are URLs, because a Next.js page route never carries an entity
id. A guard that needs a maintained list of what to look at is a guard that
stops looking.

---

## Class 4 — A control that does nothing

**The mistake.** The UI offers an action it cannot perform. The user cannot
tell a broken button from a working one, so there is nothing to report but
"nothing happens".

**Confirmed instances.**

- `startEdit`'s `default: return` swallowed five edit kinds — supplier
  invoices, supplier payments, group sales, FX purchases, FX conversions.
  *Two wired, three declared,* and the default arm now speaks. **All five
  wired as of 10 Aug; `KNOWN_UNWIRED` is empty and stayed, with a test
  asserting it is, so re-adding an excuse turns a test red rather than
  quietly passing.**
- **A button that worked, and still cost two more clicks.** Group-sale rows
  on the customer page offered one "Edit / Void" that navigated to the sale's
  page, where you pressed Edit or Void again. Nothing was broken, so nothing
  would ever have been reported — it just was not what the control said it
  did. *Fixed 10 Aug.* Worth recording because this class is usually about
  dead controls, and a control that quietly means "go and do this elsewhere"
  is the same mistake wearing a working coat.
- Delivery commission offered neither edit nor void; a wrong one was stuck.
- Supplier credit notes (iade) had **no correction or void route at all** —
  honest buttons, and a wrong iade stuck in the books permanently. **Void
  added 9 Aug** on its own route: an invoice and a credit note move the
  payable opposite ways, so a caller that confuses them has the supplier
  balance wrong by twice the amount. The machinery needed nothing new; what
  was missing was a second caller. Correction is still absent, so Edit stays
  off — void and re-upload, and the draft release makes that work.

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
- **10 Aug — a 403 that became a 500 for any unknown restaurant id.**
  `require_entity_membership` denies access by writing a `permission_denied`
  audit row scoped to the restaurant in the request. When that restaurant is
  not in `entities`, the foreign key refuses the row and the denial raises
  instead of returning. Nothing about it needed a deleted restaurant — any
  unrecognised UUID in a URL did it, and had since the guard was written.
  Invisible locally because nobody types a wrong id by hand; certain in
  production the moment a restaurant can be deleted, because a stale tab keeps
  sending the old one. The denial is now recorded with the id in the detail
  rather than the foreign-key column.

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
- **10 Aug.** "Every trigger came back after the delete" compared trigger
  *names* before and after. Disabling a trigger does not remove it from
  `pg_trigger` — it sets `tgenabled = 'D'` — so the test passed over a ledger
  with every guard switched off. The one assertion written specifically to
  catch the silent failure was itself the silent failure. Now reads
  `tgenabled`, and a companion test disables a trigger on purpose to prove the
  check can see it.

**A ninth, which is the same shape one layer down: a swallowed exception.**

`store_record` in the idempotency middleware ends `except IntegrityError:
rollback; return find_record(...)` — correct for the genuine race it was
written for, two requests with one key. But `idempotency_records.response_body`
is `NOT NULL`, and a 204 has no body, so every 204 route raised
`IntegrityError` for an entirely different reason and took the same path:
rolled back, found nothing, returned `None`. The middleware carried on.

No 204 route has ever been idempotent — removing a member, rejecting a
receipt, rejecting an invoice draft, rejecting a POS summary. Every double
submit ran twice, for as long as the feature has existed. Nothing failed
loudly, no test covered it, and the `except` that hid it looks correct in
isolation.

Found by adding an idempotency key to a new `DELETE`, not by looking. The
lesson is narrower than "don't swallow exceptions": an `except` clause named
for one cause will catch every cause, and the ones it was not written for are
invisible by construction. Catch the specific condition, or assert the
recovery worked.

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
| ARCHITECTURE: split past ~400 lines | **ratchet guard added 9 Aug** — `FILE_SIZE_BASELINE.json` freezes the 84 current offenders; nothing may grow or join |

The file-size rule is not cosmetic. `correction.py` (2,343 lines) and
`statements.py` (3,065) are exactly where tonight's bugs lived. Large files are
where a missing branch is invisible.

---

## Class 10 — A posting rule changed, its old entries stayed put

**The mistake.** The account a movement posts to is changed in code. Every
entry written from then on is right. Every entry written *before* is still
sitting on the old account, and nothing goes back for it.

**Found in the books, not in the code.** Commit `5cad923` (4 July 2026)
changed `post_drawing` from `Dr 2150` to `Dr 3200`:

```
-    """Partner withdraws cash — Dr 2150 / Cr cash; subledger -amount (may go negative)."""
+    """Partner withdraws cash — Dr 3200 / Cr cash; capital subledger -amount."""
```

No migration moved what the old rule had already written. Spice Corner has
one drawing from 1 February 2026 still on the reimbursement payable —
40.000 ₺ that makes liabilities look 40.000 ₺ smaller and equity 40.000 ₺
larger than they are. Cash and P&L are untouched; it is a misclassification
between a liability and an equity account, not a lost transaction.

**Why this class is nastier than it looks.** Nothing in the codebase is
wrong. Every test passes, every current path is correct, and reading the
code will never find it — the evidence exists only in the data. This is the
one class Phase 0 was the only way to catch.

**What it costs to check.** Almost nothing, once asked: a rule change that
moves an account should come with either a backfill migration or a
deliberate written decision not to. Neither happened here, and neither was
noticed for five weeks.

**The guard.** The control-account tie already is the guard — it fired.
What was missing was anyone running it against real books.

---

## Class 11 — Two fixes that each work, and cancel

**The mistake.** One change writes a state; another reads it. Both are
correct in isolation. Nothing connects them, so nothing objects when the
first stops producing what the second looks for.

**Found by the full suite, an evening after both landed.**
`_release_posted_draft` hands a voided invoice's draft back to `confirmed` so
it stops showing as posted — and cleared `journal_entry_id` while doing it.
`_posting_was_voided` decides whether the same file may be uploaded again,
and answered by reading `journal_entry_id`. Between them they restored the
original complaint exactly: *"i voided an invoice ... when i try to upload the
same invoice it says it already in ledger."*

Each had a test. Each test passed. Neither test knew about the other change,
and the collision only surfaced because the whole suite was run at once —
1,663 tests to find it, which is the honest cost of not having pinned the
coupling.

**The fix is the general one, not the local one.** The draft now *keeps* its
`journal_entry_id` after release. The link is the durable fact — a draft
carrying one was posted, whatever its status says now — and that single
predicate covers all four shapes without a special case: live, voided and
released, voided before the release hook existed, and never posted. Status
still governs every screen, so nothing reads it as posted.

**The guard.** A test that pins the two functions to each other: release a
draft, then assert the same-file check still recognises it. Changing either
one alone now fails there instead of in production.

---

## Class 12 — A rule written per case, and a case nobody wrote

**The mistake.** The same question gets its own function per variant —
`live_posted_invoice_exists`, `live_posted_supplier_credit_exists` — and call
sites branch on the variant by hand. Adding a variant means adding a function
*and* finding every branch. Miss it and there is no error: the chain of
`if kind ==` simply falls through, which reads exactly like "no problem found".

**Found by asking what the owner actually cares about.** Not the mechanism —
*"i care about is if one invoice or receipt or delivery invoice etc already
exsist app does not re post it."* Two duplicate rules existed, branched on at
four call sites, and **delivery commissions were in none of them**. A second
copy of the same commission invoice posted without complaint whenever the
file bytes differed, which a re-downloaded PDF does. `post_delivery_commission_draft`
had no duplicate gate at all — only a check that *this draft row* was not
already posted.

**The fix.** One `_COUNTERPARTY_FIELD` map from `InvoiceKind` to the column
naming the other party, one `find_live_posted_invoice`, one
`find_live_posted_duplicate_of(session, entity_id, draft)` that every posting
path calls. The four hand-written branches are gone, and the three per-kind
function names were deleted rather than kept as wrappers — a name per kind is
what made it possible to add a kind and answer it for none of them.

**The guard, in three parts.** Every `InvoiceKind` member must appear in the
map (enumerated from the enum, so a new one fails immediately); the column it
names must exist on `InvoiceDraft`; and every function that writes a journal
entry from a draft must call the gate. An unknown kind now raises rather than
returning None, because silence was the failure.

**Checked at posting, not only at upload.** A draft can reach the ledger
without going through intake — created before its supplier was linked, or
posted by another route. The ledger is the last place that can still say no.

**And the behaviour, separately.** The structural guard proves the gate is
*called*; it would pass just as well against a gate that always returns None.
So the commission case — the one that had no rule — is pinned by money:
posting the same number twice is refused *and the expense account does not
move*, the same number from a different platform still posts (platforms
number their own invoices), and a voided commission stops being a duplicate
so the corrected one can go in. That last one is the same trap as the voided
file that could never be re-uploaded, in a different place.

---

### Phase 3.1 / 3.2 as built

**Entity switch.** The scoreboard said 16 of 91 pages reset on switch. The fix
was not to add the hook to the other 75 — that leaves page 92 to remember it.
`EntityScopedTree` keys the page tree by entity id in `providers.tsx`, so the
whole subtree unmounts and rebuilds and there is no per-page step left.

What sits above the key on purpose: React Query's cache (its keys already
carry the entity id), auth, toasts, and `UnsavedWorkProvider` — which must
outlive the remount it is warning about. `useRegisterUnsaved` clears on
unmount, so the remount does not strand dirty flags.

One hole the remount did **not** close, found by asking what else lives above
the key: `QuickActionsProvider` holds the open Record sheet. Correctly above —
its delivery-enabled cache is per entity and refetching would flash the nav —
but a sheet is a form, not a cache. It stayed open across a switch holding
what had been typed for the restaurant you just left, and would post it to the
new one. Now cleared on entity change.

**Production smoke.** Two findings, one of them the reason the item existed.

The exempt list was written twice — `SKIP_PATH_SUFFIXES` in Python,
`EXEMPT_PATH_FRAGMENTS` in the frontend guard's TypeScript — with a comment
saying *"kept in step"* and nothing checking. The dangerous direction is the
quiet one: a path the **frontend** exempts and the server does not is a call
that returns 400 in production and passes every local check, which is the
original eleven-mutation bug restored. A test now reads the Python tuple and
compares.

And nobody had ever verified that production enforces at all. Every guard in
this area assumes `IDEMPOTENCY_ENFORCEMENT=true`; if it were unset, they
protect nothing and everything still looks fine.
`scripts/smoke_production.py` checks it **without credentials**, because the
middleware is registered outside the auth dependency: an unauthenticated POST
with no key gets `400` rather than `401`, and the difference between those two
codes is the whole signal. It also checks the reverse — that an exempt path is
still exempt in the deployed build — since a broken exempt list would make
drafting fail in production only.

**First real run, 9 August 2026** — `mizan-api-production-e574.up.railway.app`,
all four checks pass. `POST` without a key returns `400`, not `401`, so the
middleware refuses before authentication runs: **production is enforcing.**
That is the assumption the frontend idempotency scan and the exempt-list test
are both built on, and until this run nobody had ever confirmed it.

Two bugs in the script itself, found by running it rather than reading it, and
both the same class as everything else here — a check written as *"not the bad
answer"* rather than *"the right answer"*:

- Against a URL that did not resolve it printed `PASS  exempt endpoints are
  still exempt`. The test was `status != 400`, and a dead connection is not
  400. It now stops at the first unreachable response and asserts something
  answered.
- Against a TLS trust-store problem — a python.org Python with no
  certificates, on a deployment that was up — it offered three guesses,
  placeholder / down / wrong hostname, all wrong. Each cause now gets its own
  answer, with a test per cause asserting it does not produce another's.

The script cannot run in CI, so its *judgement* is tested with canned replies:
a deployment that is up, has a live database, and returns 401 where 400 was
expected must fail, because that deployment is the one the guards cannot see.

---

## Owed — deliberately deferred, not forgotten

Written down because "we'll tidy it after" is how dead code becomes
permanent.

| # | Owed | Why it was deferred | Blocked until |
| --- | --- | --- | --- |
| ~~D2~~ | ~~Backend says how many rows share an entry; partner and staff pages migrate~~ | **Done 9 Aug.** The signal is *owners* per entry, not rows — a salary payment's two rows belong to one employee, so counting rows would have hidden a working button. Partner page migrated via a new batch route. **Staff page deliberately not migrated:** its local rule guards a defect now fixed at the route (`correct_staff_journal_entry` rebuilt one row and dropped the rest), and migrating it buys nothing the guard does not already give. | — |
| ~~D3~~ | ~~Voiding a group-sale discount voids the whole sale~~ | **Fixed 9 Aug.** A discount and a write-off are both `DISCOUNT` rows posting under `GROUP_SALE`; a discount also carries the sale's `reference_id`, which the escape read as "this *is* the sale". Both now route to `customers/{id}/write-offs/{entry}/void`, which accepts any `DISCOUNT` row. The write-off had the mirror bug — no `reference_id`, so it fell through to the credit-sale route, which rejects a `DISCOUNT` row: a dead button. Checking the movement type first is the fix, because what a row *is* beats what its source and reference imply. | — |
| ~~D4~~ | ~~A write-off cannot be corrected from the General ledger~~ | **Done 9 Aug**, along with both FX kinds. The blocker in all three was the same: a field the form needed that the edit context did not carry. A write-off wants the customer's outstanding balance, because a correction is capped at that plus what the write-off already took off; both FX forms want the wallet's currency, which is one hop off the money account since `FxLedgerEntry` names the account and nothing about what is in it. Thirteen of fourteen edit kinds now open from the ledger. | — |
| ~~D5~~ | ~~Say on the Expenses page that it lists hand-recorded expenses only~~ | **Done 9 Aug.** The page now says plainly that salaries, supplier invoices and delivery commission are not listed and that this is not total spend, and links to the expense register. The money figure stopped reading "Total" and now reads "Recorded here" — the same wrong-label problem as "Period total". Nothing about the books changed; the register and the P&L always tied. | — |
| ~~D7~~ | ~~No way to delete a restaurant~~ | **Done 10 Aug.** Spice Corner was a practice entity full of deliberate mistakes with no way to be rid of it. The ledger is undeletable by Postgres, not by application code — `mizan_app` has DML rights and no ownership, so no route can disable a trigger. `delete_entity_cascade()` is a single SECURITY DEFINER function, `EXECUTE` revoked from `PUBLIC` and granted to `mizan_app` alone, that takes an entity id and nothing finer: the new power is "remove an entire restaurant", which is loud, not "delete a journal entry", which is what the schema exists to prevent. Owner-only per restaurant; Settings offers only the restaurant you are in. The script now calls the same function instead of carrying a second copy. **Two silent faults found writing it:** the inventory counted without `app.current_entity_id`, so under `FORCE ROW LEVEL SECURITY` all forty-nine RLS tables returned zero — it would have reported "no data" and deleted a full set of books anyway, since cascades are exempt from RLS even though queries are not; and the trigger list, when written by hand, twice missed triggers declared `UPDATE OR DELETE`, including the append-only audit ones that a `SET NULL` cascade must pass through. Both are why it reads `pg_trigger` at call time rather than trusting a list. | — |
| ~~D8~~ | ~~`group_sale` is the one edit kind the ledger cannot open~~ | **Done 10 Aug. Fourteen of fourteen.** Fixed the way its own `KNOWN_UNWIRED` entry predicted: not by widening the edit context, but by fetching the sale from its id. Every other kind arrives with what its form needs; a group sale is a whole document — one row per menu line, pax and rate on each, a currency, maybe an FX rate — and carrying that through the ledger would have meant reassembling a shape the sale's own page already fetches, drifting apart the first time a column was added to a line. `GroupSaleForm` is untouched; it always accepted `correcting` and posted to `group-sales/{id}/correct`. **And the same gap on the customer page:** group-sale rows there had a single "Edit / Void" button that navigated to the sale's page so you could press Edit or Void *again*. They now use `SubledgerRowActions` like every other row. That branch had also never consulted `customerLedgerRowActions` or `display_kind`, so it drew the button on superseded rows too. `VOIDABLE_ROWS` entries carry a path builder rather than a segment now — a group sale is not voided through the customer, and the shared `customers/{id}/` prefix only held while every row was. | — |
| D6 | Collapse `gl-entry-actions.tsx`'s ten `useState` pairs into one edit target, and move its twelve dialog render blocks to a sibling | It reached 532 lines wiring the write-off and two FX edit forms, and the file-size ratchet was raised rather than obeyed — the first time today. The reason is specific: splitting it is a behaviour-preserving refactor of a React component, and the project has no component-level tests (no `@testing-library`; vitest runs in `node`). `tsc` catches type errors and `gl-edit-kinds.test.ts` catches a missing case, but nothing catches "the dialog no longer opens". Today's backend split was safe precisely because every move was verifiable byte-for-byte; this one is not. | Wants a component test harness first, or a careful pass with the app open. The shape is clear: one `editTarget` state, one `editTargetFor(kind, ctx, id)` mapping, one `<EditDialogs>` sibling. |
| ~~D1~~ | ~~Delete the inert `useEntitySwitchReset` call sites~~ | **Done 9 Aug.** 16 of 17 removed. The seventeenth stays: `statement-import-panel` keys on `(entityId, moneyAccountId)`, and a half-finished column mapping belongs to that account's import — changing account within one entity remounts nothing, so the remount covers the entity dimension only. | — |

`entityResetKey` stays either way — `EntityScopedTree` is built on it.

---

## The standing rule

> *"everything we build we build globally so anything that may come tomorrow
> is not missed out"*

Stated 9 August 2026, and it is the through-line of every class above. In
practice it means three things when writing a fix:

1. **Fix the funnel, not the call sites.** If a rule has to be remembered in
   six places it is already broken in four. See 1.1.
2. **No allowlist.** Where the rule cannot possibly matter — a profit
   allocation has no bank line — apply it anyway. The exception list is where
   the next gap hides, and a guard with no exceptions needs no maintenance.
3. **Scan by shape, not by name.** A guard that holds a list of known helpers
   goes blind the day someone adds one. The first version of the draft-release
   scan looked for two specific helper names and found one route out of two;
   matching *any* name containing `draft` found both, and will find the third.

---

## The plan

Ordered so each step makes the next one smaller.

### Phase 0 — Ask the real books what is already wrong

Everything else on this list is reasoning about code. This phase reads
production data and reports facts. It is read-only, it changes nothing, and it
is the only item that can find a bug **nobody has noticed yet** — including
ones introduced before tonight.

**The machinery already exists and has never been pointed at real data.**
`assert_entity_control_accounts_tied` walks every registered subledger and
checks it against its GL control account. It is called from exactly one place:
a test, against an *empty* seeded entity. It has never once run against the
actual books.

| # | Check | Would have caught |
| --- | --- | --- |
| 0.1 | Every subledger ties to its control account, per entity | silent drift of any kind |
| 0.2 | Draft says `posted` but its journal entry is voided or missing | tonight's void bug |
| 0.3 | Statement line says LINKED/POSTED but its entry is voided | Class 2, still live |
| 0.4 | Any posted entry dated after today | the 16.09.2026 invoice |
| 0.5 | Any journal entry where debits ≠ credits | the thing that must never happen |
| 0.6 | Posted invoices still flagged `assumed_vat` | overstated input KDV |
| 0.7 | Any subledger row whose `journal_entry_id` points at nothing | orphaned money |

Run it before the refactor, and again after: a report that is identical
either side is stronger evidence the split changed nothing than any number of
green tests.

**Output is a report, not a fix.** Each finding gets triaged on its own —
some will be real bugs, some will be data from before a rule existed, some
will be nothing.

#### Triage log

| Finding | Verdict | Cause |
| --- | --- | --- |
| India Gate 3300 out by 220.000 ₺ | **check was wrong, books fine** | Class 1. `entity_capital_total_kurus` listed the two movement types that *credit* partner capital and omitted the one that debits it, so every profit payment widened a phantom gap. Fixed by naming the set once as `CAPITAL_ACCOUNT_MOVEMENT_TYPES`. |
| `--explain` showed a 205.000 ₺ debit from `system` | **the explainer was wrong** | Class 1 again, mine. It filtered `status == POSTED` without excluding reversals, so old voids appeared as live debits. `live_entry_clauses()` now carries both conditions as one thing. |
| Spice Corner 2150 out by 40.000 ₺ | **the books, confirmed — Class 10** | One drawing dated 1 Feb 2026, posted by the code as it stood before commit `5cad923` (4 Jul 2026) moved `post_drawing` from `Dr 2150` to `Dr 3200`. No migration moved the rows the old rule had written. Widening the tie would be the wrong fix — it would then break for every correct drawing since July. **Blocked on Phase 1.1:** see below. |

| Spice Corner, 5 posted invoices flagged `assumed_vat` | **scratch data, live rule** | The rows need no repair. The rule that produced them runs everywhere — see Phase 1.4, now done. |

**Spice Corner's data is scratch. Its code is not.** It is a half-finished
trial entity, so nothing in it needs repairing and **India Gate, the real
books, is clean.** But the correction the owner made on 9 August is the one
that matters:

> *"so nothing is only for one company. spice corner everything is global
> rule so everything works everywhere"*

A finding against a scratch entity is still evidence about code that runs on
the real one. Reading "scratch data" as "ignore" would have parked Phase 1.4,
and Phase 1.4 turned out to be about a number that goes on a KDV return.

That changes what the Class 10 finding is *for*. There is nothing to fix in
the data. What survives is the process lesson: a commit moved an account and
no migration went back for what the old rule had written. Had that drawing
been on India Gate, the repair would have been blocked behind Phase 1.1
anyway — voiding it would strand the bank statement line that still points
at it, trading one finding for another.

Worth recording what this cost and what it bought: the first two rows were
**checks disagreeing with correct books**, not corrupt data. That is the
expected shape of a first run — but it is also why Phase 0 had to report
rather than repair. A tool that had "fixed" the 220.000 ₺ would have
corrupted books that were right.

Note also which class both turned out to be. Two of two findings so far are
Class 1: a fact about the posting code, written out by hand a second time
somewhere that reads it. That is the argument for Phase 2, made with data
instead of assertion.

### Phase 1 — Stop the bleeding (highest risk, live now)

| # | Work | Class |
| --- | --- | --- |
| 1.1 | ✅ **Done.** Statement-line release moved into the shared void machinery, + guard | 2 |
| 1.2 | ✅ **Done.** Date filter removed from the two queues that still had one | 5 |
| 1.3 | ✅ **Done.** One guard over all three queues' filter sets | 5 |
| 1.4 | ✅ **Done.** Auto-post refuses an assumed VAT outright; confirming no longer erases the flag | 7 |

*(1.1 is the "statement-line reset" item; 1.2 and 1.3 are the "review queue
date filter, one query for badge and list" item; 3.1 and 3.2 are the
"production smoke test" item.)*

**Why first:** 1.1 means the bank import can currently claim to be reconciled
when it is not. 1.2 and 1.3 are the bug you hit last night, still live in three
other queues. 1.4 touches a tax return.

#### 1.2 / 1.3 as built

Traced all six review tabs rather than assuming the plan's count of three:

| Queue | Sent a date range? |
| --- | --- |
| Expenses | yes — `from`/`to` always, current month |
| Sales | yes — same |
| Bank | no — `filterLinesForReviewTab` already skips the range for `needs_review`, and the tab count reads the unfiltered list |
| Receipts | no — lists everything, filters pending in the browser |
| Delivery | no — same |
| Invoices | already fixed |

So two, not three. The rule now reads the same in all three places that have
one: **the range applies only to settled views** (`posted`, `voided`).
`all` sits with the queues, not with `posted` — it contains outstanding work,
and outstanding work must never be hidden by a date default nobody chose.

The picker is hidden where it does not apply rather than left inert. It was
the first thing reached for when a row seemed missing, and it was never the
reason. On the expenses panel the money label changes with it: "Period total"
over a list spanning every date is a wrong label on a money figure, which is
worse than no label.

The guard iterates the exported filter sets, not a retyped list, so a tab
added later is covered on the day it is added. It has two halves — no
unsettled view may use the range, **and** every settled view must — because a
`usesRange` that always returned false would satisfy the first alone and
quietly break every report period. Mutation-checked: forcing sales back to
always-ranged fails exactly one test, by name.

#### 1.4 as built

Auto-post was already refusing an assumed VAT — **incidentally**. An assumed
VAT sets `classification_confidence` to `"low"` at intake, and `_common_gates`
refuses anything that is not `"high"`. Nothing anywhere said "do not post a
guessed tax unattended"; it fell out of a side effect two files away, and the
marker that causes it is cleared the moment anyone confirms.

That is a guarantee nobody wrote down, so it was one confidence tweak from
disappearing. It now says what it means: `vat_was_assumed(draft)` is its own
gate, and the test that pins it hands the draft confidence `"high"` so it
cannot be passing for the old reason.

The second half is the one with teeth. Confirming used to strip `assumed_vat`
along with the parse-quality markers, so a posted invoice kept no record that
its input KDV was inferred rather than read. That is the only way to answer
"which invoices on this return claimed a guessed VAT" — the question check
0.6 exists for. Accepting an assumption does not turn it into a reading, and
the flag now survives. `net_adjusted`, `fields_missing` and `no_text_layer`
still clear, because once the owner has read the fields, how well they parsed
genuinely stops mattering.

Blocked on the unattended path only, per the standing instruction: *"u can add
warning if that matters. but i hope it wont stop user or me from recording."*
Posting by hand still works — the preview says the VAT was assumed, and the
decision is the owner's.

#### 1.1 measured

The reset function already exists and reads like it was written for exactly
this: `reset_statement_lines_for_voided_journal` — *"Unlink bank lines when
their journal was voided outside the statement UI."* It is called from **one**
place. Six paths void an entry:

| Void path | Resets the statement line? |
| --- | --- |
| `features/staff/service.py` | ✅ |
| `features/banking/statements.py` (correct-a-line) | ✅ |
| `features/ledger/service.py` — **the generic Void button** | ❌ |
| `core/ledger/correction.py` `_void_journal_entry_in_transaction` — **41 registered sources** | ❌ (the file does not mention statement lines once) |
| `features/pos/service.py` | ❌ |
| `features/manual_journals/service.py` | ❌ |

This is Class 1 with the copies missing rather than drifting, and it explains
the symptom reported on 8 August word for word: *"i voided it but i can still
see the invoice in review invoices… clicked void again nothing happened just
kinda flickered but still everything there."* The entry was voided. The line
that points at it was never told.

**The fix that holds:** call the reset from inside `void_journal_entry` and
`_void_journal_entry_in_transaction`, not at the four call sites — a rule that
has to be remembered at six places has already failed at four. Core importing
a `features` module is a layering inversion, but one this codebase already
makes (`books_health` imports `features.entities`), and the alternative is
keeping the thing that just broke.

**Guard:** a scan asserting every path that voids an entry routes through the
machinery that resets, in the shape of the existing void-path resolution
test — so a seventh path added next month cannot quietly skip it.

**As built.** The rule now lives at the two void funnels and the one correct
funnel, and the scan walks the AST rather than the text so it knows which
*function body* a call sits in. It found a fourth void path nobody had
listed — `void_profit_allocation`. That one can never have a bank line
pointing at it, and it calls the retarget anyway: the rule holds everywhere
so the guard needs no allowlist, and an allowlist is where the next gap
would have hidden.

The fork matters more than the reset does. A **void** releases the line; a
**correction** re-points it at the replacement entry. Releasing on a
correction would have been worse than the original bug — the money is still
posted, so a line handed back to the queue as unclassified invites a second
classification and books the same transaction twice. Corrections already
re-point invoice drafts (`draft.journal_entry_id = corrected.id`); bank
lines now follow the same convention.

The explicit call in `features/staff/service.py` was deleted rather than
left in place. It was correct, but it was a second copy of a rule that now
has one home — and Class 1 is copies.

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

## What "checked and double-checked" can honestly mean

The hope is that after the split everything works and no bug survives,
including the ones nobody has hit yet. Two of those are achievable and one is
not, and it is worth being exact about which.

**Achievable: the split provably changes nothing.** For `correction.py` the
moves are textual. A script can compare each moved function body against its
original byte-for-byte and refuse the commit if anything differs, with the
suite green per commit and the Phase 0 report identical either side. That is
evidence, not hope. For `statements.py` the same standard is met by
characterisation tests over all 48 branches before a line moves.

**Achievable: a known class cannot come back silently.** That is what the
guards are for. Nine classes, nine guards, each verified by breaking the fix
and watching the test go red.

**Not achievable: proof that no bug remains.** No amount of reading proves
absence. Anyone who promises it is guessing, and my own night argues the
point — I introduced three regressions and wrote three tests that could not
fail, one of them minutes after writing a commit message complaining about
exactly that.

**One trap worth naming.** Characterisation tests pin *current* behaviour,
which includes current bugs. They make the refactor safe and they also lock
the wrong behaviour in. So reading those 48 branches for correctness is a
**separate pass with its own findings list** — never a silent fix inside a
move commit. A commit that moves code and changes behaviour at the same time
cannot be reviewed by anyone, including me.

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
