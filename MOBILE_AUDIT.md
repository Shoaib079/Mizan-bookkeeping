# Mobile audit

Read against the desktop archetype work in `DESIGN_ARCHETYPES.md`. The rule
there — *a page declares what it is; if it needs a shape no archetype provides,
we extend the archetype, never fork it inside the page* — is the same rule that
should govern mobile, and most of what follows is a consequence of it not being
applied when the mobile shell was added.

**What I could and could not verify.** Everything marked *code-certain* is read
directly from the source and does not depend on my judgement about how it looks.
Everything marked *needs eyes* is a reasoned inference from CSS that I could not
render — this session has repeatedly shown that my reading of layout is worth
less than one look at the actual screen, so please treat those as questions
rather than conclusions.

---

## What is already right

Worth stating first, because it means the shell is sound and the problems are
localised rather than architectural.

- **Dialogs are properly mobile.** `ui/dialog.tsx` has a real sheet
  presentation (`max-h-[85dvh]`, rounded top, bottom safe-area inset) and a
  full-screen variant, both respecting `env(safe-area-inset-*)`. This is the
  best-handled part of the mobile app.
- **Back navigation exists and is guarded.** `MobileTopBar` resolves a back
  destination per route and routes it through the unsaved-changes confirm.
- **The tab bar is accounted for in layout.** `<main>` carries
  `pb-[calc(4.75rem+env(safe-area-inset-bottom))]`.
- **KPI grids stack.** Every stat grid found uses `sm:grid-cols-*`, so they are
  one column on a phone rather than three crushed ones.
- **The breakpoint has its own tests** (`lib/mobile-shell.test.ts`).

---

## 1 · The save button on every form is behind the tab bar — *code-certain*

**Severity: severe.** This is not cosmetic; it obscures the primary action of
every form in the app.

```
form-page.tsx:75          sticky bottom-0 z-10   ← Save / Post lives here
mobile-bottom-tabs.tsx:124  fixed inset-x-0 bottom-0 z-30
```

A `sticky bottom-0` element sticks to the bottom of its scroll container's
padding box. `<main>` extends underneath the fixed tab bar, so the save bar
comes to rest under it — and the tab bar wins on `z-index` (30 vs 10).

The `pb-[4.75rem]` on `<main>` does not help: padding is *inside* the
scrollport, so `bottom: 0` still resolves below it.

The irony is that the save bar was made sticky for a good reason, recorded in
its own comment: *"on Settings you could scroll past Save and not know it was
there."* The desktop fix created the mobile fault.

**Fix.** `FormPage` should offset its save bar by the tab bar height on mobile —
`bottom-[calc(4.75rem+env(safe-area-inset-bottom,0px))]` under the mobile
breakpoint, `bottom-0` above it — and the two magic numbers (`4.75rem` here and
in `AppShell`) should become one shared token, because they are already
duplicated and will drift.

**Affected:** every page using `FormPage` with a `saveBar`, which is every form
in the app including the manual journal, opening balances, and all settings.

---

## 2 · Tables do not become readable on a phone — *needs eyes, cause code-certain*

**Severity: major.** This is the bulk of the "not aligned" feeling.

`ListPage` accepts an optional `mobile` slot and falls back silently:

```
list-page.tsx:126   {isMobile && mobile ? mobile : table}
```

Coverage today:

| | count |
|---|---|
| Files rendering a `DataTable` | 50 |
| `ListPage` users | 14 |
| `ListPage` users passing `mobile` | **5** |
| Table surfaces with a mobile variant | **4 pages + 1 panel** |

So roughly **45 table surfaces render a desktop table on a 375px screen.**
Customers, suppliers, partners and staff were done properly with
`MobileCardList`; nothing else was.

What the reader actually gets: `DataTable` is `overflow-auto` wrapping
`<table class="w-full">`. With `table-layout: auto` and `width: 100%`, the
browser does not scroll the table — it *compresses* the columns and wraps the
text inside them. A six-column row on a phone becomes a tall stack of wrapped
fragments. It is not clipped and not scrollable; it is squeezed.

Worst offenders by column count:

| Report | header cells |
|---|---|
| Cash book | 15 |
| Expense register | 9 |
| Profit and loss | 4 |
| Bank reconciliation | 4 |

**The structural problem, not just the symptom.** Making the mobile view an
optional prop guarantees this outcome — the archetype cannot enforce what it
lets you omit, and 9 of 14 callers omitted it. This is precisely the failure
mode `DESIGN_ARCHETYPES.md` was written to prevent.

**Fix, in order:**

1. Make the mobile view non-optional in the type: either `mobile` is required,
   or `ListPage` derives cards from a declared column spec so a page cannot
   have a table without a phone view. The second is more work and removes the
   whole class of bug.
2. Until then, add a failing test that lists every `ListPage` call site without
   a `mobile` prop — the same shape as `chart-account-requests.test.ts`, which
   caught the `limit=500` bug by walking source rather than mocking.
3. For genuinely wide financial tables (cash book, expense register), cards are
   the wrong answer and a horizontally scrolled table is right — but it has to
   actually scroll: the inner `<table>` needs `min-w-max` or an explicit
   min-width so `overflow-auto` has something to do, plus a sticky first column
   so the date or description stays visible.

---

## 3 · Report pages have no mobile consideration at all — *needs eyes*

**Severity: major.** Eleven report pages use `DataTable` directly with no
`ListPage` and no mobile branch. `ReportPage` itself contains no `isMobile`
handling and no responsive classes beyond what it inherits.

Each report page stacks, on a phone: a period control (two date inputs, Apply,
This month), a download menu, a KPI band, and then a wide table. The controls
are the part I would look at first — `ReportDateRange` uses `sm:w-36` on the
inputs so they go full-width on mobile, which is correct, but four controls
wrapping into a tall block above every report pushes the actual figures below
the fold.

**Fix.** Consider collapsing the period control into a single tappable summary
(`01.07 – 05.08 ▾`) that opens the existing mobile dialog sheet — the sheet
infrastructure is already there and already good. This is a design decision, not
a defect; I would want your read before building it.

---

## 4 · Row action buttons are below the touch minimum — *code-certain*

**Severity: moderate.**

47 occurrences of `h-8` (32px) on interactive elements, including the row
actions you use most:

```
ledger/void-trigger-button.tsx:39     h-8 px-2
ledger/subledger-row-actions.tsx:45   h-8 px-2
ledger/ledger-history-toggle.tsx:22   h-8 px-2
review/manual-journals-panel.tsx      h-8 px-2   (Edit, Void)
```

The base `Button` is `h-9` (36px). Both are under the 44px that iOS and
Android guidelines call for, and these are destructive or
correction actions — Void, Edit — where a mis-tap costs a journal entry.

**Fix.** Keep the visual height, raise the hit area: add
`min-h-11 sm:min-h-0` or a `::after` tap-target expansion on `Button` under the
mobile breakpoint. Changing `h-8` to `h-11` outright would wreck the desktop
row rhythm, so this should be breakpoint-scoped.

---

## 5 · Smaller things worth folding into the same pass

- **`min-w-[140px]` / `min-w-[200px]`** in `invoice-draft-review`,
  `receipt-review`, `pos-summary-review`, `delivery-report-review`,
  `member-access-editor`. Individually fine at 375px; in a flex row with
  siblings they are the usual cause of a page that scrolls sideways by 20px.
  Worth checking on a real phone rather than changing blind.
- **Two hardcoded copies of the tab bar height** (`4.75rem` in `AppShell`,
  needed again in the `FormPage` fix). One token.
- **`DocumentReviewPage`** is a two-pane `lg:grid-cols-2`, so it stacks on
  mobile — but that means the document preview and the form become a single
  very long scroll. Whether the preview should collapse behind a toggle on a
  phone is a design call.

---

## Suggested order

1. **Form save bar** — severe, small, self-contained, affects every form.
2. **Touch targets** — moderate, small, and the risk is mis-tapping Void.
3. **Guard test for `ListPage` mobile coverage** — cheap, and stops the gap
   widening while the rest is done.
4. **Mobile views for the list surfaces**, highest-traffic first.
5. **Wide financial tables** — real horizontal scroll with a sticky first
   column.
6. **Report page controls** — design decision first, then build.

Items 1–3 I would do without further discussion. Items 4–6 are where I would
rather see a screenshot of the page in question before writing code, for the
reason at the top of this document.
