# Guardrails — hand this to any agent before it touches the code

`CURSOR_RULES.md` says what to do. **This file says what will catch you if you
don't**, and records the mistakes that were expensive enough to become rules.

Read `CURSOR_RULES.md` first — golden non-negotiables, slices, git discipline,
the recovery protocol. Then this. For the bug-class scoreboard and owed items
(Phases 1–4), read `HARDENING_PLAN.md` before fixing any bug.

---

## 1. The suite is not advisory

As of 2026-08-10: 215 backend test files, 175 frontend. A large number of them
are **guards**: they assert nothing about a feature, only that a rule still
holds. Roughly 74 frontend tests and 18 backend tests read source or enumerate
registries. Counts drift — trust the suite on disk, not this paragraph.

They exist because every one of them was written the day after something broke
in production. If a guard fails, the guard is almost certainly right.

**Never make a failing test green by editing the test**, unless you can state
in the commit message which behaviour deliberately changed and why. If you
delete an entry from a list a test asserts, you have probably just re-opened
the hole it was guarding.

### The green light — all of it, every time

```bash
# Backend (one run at a time; the suite shares one test DB)
cd backend
export DATABASE_ADMIN_URL='postgresql+psycopg://<user>@localhost:5432/postgres'
.venv/bin/pytest -q                      # venv binary, never bare python3
python3 scripts/check_file_sizes.py      # the ratchet, 6 checks

# Frontend
cd frontend
npx vitest run
npx tsc --noEmit
npx eslint .                             # the whole tree, NOT `next lint --file`
NEXT_FONT_GOOGLE_MOCKED_RESPONSES=$(pwd)/mocked-google-fonts.js npx next build
```

The real `next build` is not optional. A server/client boundary error only
appears at prerender — vitest, tsc and eslint were all green the day
production broke on `useShowsSkeleton() from the server`.

---

## 2. The file-size ratchet

`LIMIT = 400` lines. As of 2026-08-10, `FILE_SIZE_BASELINE.json` listed 81 files
already over it (the live list is that file — do not trust this sentence if
they disagree). Six checks, and the shape matters more than the number:

1. the scan finds the source tree (not an empty list)
2. the baseline describes real files
3. no new file goes over the limit
4. **no already-oversized file grows**
5. a file that comes back under the limit leaves the list
6. the baseline is not quietly empty

Check 4 is the one you will hit. When you do: **split the file, or shorten what
you added. Do not raise the number.** If you genuinely must raise it, say so in
the commit message in a full sentence.

Checks 1, 2 and 6 exist because the first version of this ratchet passed
happily over an empty file list.

---

## 3. The rules that cost the most to learn

### 3.1 Guard the guard

*The single most repeated fault in this codebase: a check whose rule is
narrower than what it claims to verify.*

It has happened at least five times — a one-direction ratchet, a sweep that
covered five archetypes out of twelve, `next lint --file` instead of the whole
tree, a drift guard comparing only the source-keyed half, a scan over an empty
list.

So every guard needs a second test that fails when the guard is vacuous:

- asserting a list is non-empty before asserting things about its contents
- an opposite-direction case (a rule that always says "hide" would satisfy a
  test that only checks hiding)
- deliberately break the code, watch the guard fail, restore it — **before**
  you trust it green. Do this every time. Write it in the commit message.

### 3.2 One fact, one rendering

Never keep a second copy of a rule the backend already owns.

The frontend kept its own edit/void verdicts. It drifted **twice**, both times
found by the owner rather than a test: Edit was withheld from exactly the
entries the backend had just been taught to correct, and a partner-funded
salary stayed void-only on the strength of a stale comment.

If two places must agree, either make one read the other, or write a test that
compares the two sources — not one that checks their outputs happen to match
today. See `subledger-actions-match-backend.test.ts` and
`edit-forms-keep-their-account.test.ts`.

### 3.3 Read the definition, not the caller beside it

Inferring a function's signature from a neighbouring call produced
`amount_minor` where the parameter was `cash_minor`. Before writing a call,
open the definition. Every time.

### 3.4 Fix the shape, not the instance

When a bug is reported, grep for its shape and enumerate every occurrence
before fixing anything. A dropped payment account was reported on staff; it
was actually wrong in **three of four** correction forms, and had been
silently rewriting accounts on the General ledger for months.

Reporting "fixed" after patching the reported instance is how the same bug
comes back under a different name.

### 3.5 Entity context and the ORM

RLS is enforced by a GUC set inside `entity_context`, which is re-entrant.

- **Reading an ORM instance after its context closes** refreshes with no entity
  set, matches nothing, and raises `ObjectDeletedError` about a row that is
  perfectly present. Read fields before the context closes, or reopen a
  context around the read.
- **Any commit expires every instance in the session.** If you add a call that
  commits, everything the caller was holding is now stale. This broke ten tests
  at once.

### 3.6 Effective rows

Voided and superseded rows must be excluded from every total. **Every** ledger
row carries a `running_balance_kurus`, so "has a running balance" is not a
filter for effective rows — use `display_kind == EFFECTIVE` or
`effective_entries()`. The wrong filter passed four tests before it was caught.

### 3.7 Corrections rebuild every leg

One journal entry can own several subledger rows. `session.scalar` returns an
arbitrary one. If a correction rebuilds a single row, it silently drops the
rest. Either handle all of them, or refuse — and if you refuse, say so on
screen rather than hiding the button.

For multi-row entries the pattern is **void whole and re-run the original
poster**, so the split arithmetic stays owned by one place.

### 3.8 No dead code, and no orphan routes

Removing a button means removing its dialog, its state, its service function,
its route and its schema. A route left registered behind a removed button will
still accept a request and post an entry the app can no longer explain.

---

## 4. Money and books — non-negotiable

- Integers in kuruş. Never float, never `parseFloat`-and-truncate.
- Void and reverse. Never hard-delete, never edit a posted amount in place.
- Every write is entity-stamped, every read is entity-filtered.
- Every money movement posts through the one posting boundary and ties to a
  control account. If you add a subledger, add its tie.
- A warning may be shown; it must not block the owner from recording.
- Never let the UI weaken a backend rule: stable idempotency key per submit
  intent, reused on retry.

---

## 5. Working style the owner expects

- **Show before changing UI.** Describe or mock the change first.
- **Build globally.** No fix that works for one entity, one wallet, one person.
  New wallets, staff, partners and customers must inherit styling and rules
  automatically.
- **No assumptions, no stories.** Read the real code before explaining a cause.
  A plausible narrative that the numbers don't support is worse than "I don't
  know yet".
- **Report what is not fixed.** When a change fixes a mechanism but not the
  owner's specific record, say so plainly in the same message.
- **One agent, one slice, one working tree.** Never two agents on this repo at
  once. Never two `pytest` runs at once — they share one test database.
- Commit messages explain **why**, name the symptom in the owner's words where
  there was one, and say what was verified.

---

## 6. Before you say it is done

- [ ] Full backend suite, full frontend suite, tsc, eslint over the tree, real
      `next build`, ratchet 6/6
- [ ] Every new guard watched failing before being trusted green
- [ ] Grepped for the bug's shape, not just its reported instance
- [ ] No new copy of a rule that already lives somewhere
- [ ] Dead code, routes, schemas and tests for removed features deleted
- [ ] `ROADMAP.md`, `CHANGELOG.md`, `BUGLOG.md`, `DECISIONS.md` updated
- [ ] Said plainly what this does **not** fix
