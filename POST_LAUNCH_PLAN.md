# Post-Launch Build Queue

Actionable companion to `ROADMAP.md`. **Done** items are recorded so they are never rebuilt. **To-build** items are written as slices — each has a ready-to-paste **Cursor prompt**. Build one slice at a time; commit + push after each.

Live app (staging-mode): Frontend `jovial-licorice-be572c.netlify.app` · API `mizan-api-production-e574.up.railway.app` · DB Neon (PG18) · Auth Clerk (dev keys) · Backups → Cloudflare R2 (nightly).

---

## ✅ Done (do not rebuild)

- **Production go-live** — Neon Postgres + Railway API + Netlify frontend + Clerk auth, `APP_ENV=staging`.
- **Open self-signup** (`6c6bf92`) — first verified sign-in auto-provisions a user; `SELF_SIGNUP_ENABLED` flag; invites still work; new user becomes owner on first company.
- **Auth/deploy enablement** — `CLERK_AUDIENCE` optional; managed-Postgres (Neon) role-hardening tolerance + RLS verify; cold-load 401 fix (auth provider waits for token + `AuthReadyGate` + 401 retry); Netlify Next.js runtime; Dockerfile pip retries; `pg_dump 18` in image.
- **Entity fixes** (`0411d54`) — reliable company-list load (no false "register" prompt); block duplicate company names per user (409); land on dashboard on company switch.
- **First-run onboarding + Fix D** (`dc115a4`) — onboarding modal (full name, business name, optional legal name); migration `056_entity_legal_name`; `PATCH /users/me`; dismissible dashboard setup checklist.
- **Automated DB backups** — nightly `pg_dump` → R2 via the `mizan-backup` Railway cron (`0 3 * * *`).
- **P1 — Expense account picker labels** — Turkish name first, GL code in parentheses (`formatExpenseAccountLabel`); manual expense, correct expense, partner-fronted, FX spend, receipt review, day closeout.
- **P2 — AI + learning expense auto-categorize** — `GET /expenses/suggest-account` (learned aliases → AI fallback); migration `057` `default_expense_account_id` on expense items; manual expense form debounced suggest-and-confirm.
- **Turkish e-Fatura PDF parsing** (`bad0de6`) — Metro, utility, delivery-commission GİB layouts; supplier VKN heuristics (SAYIN / inverted); `test_efatura_pdf_heuristics.py`.
- **Entity company profile + VKN** (`v0.73.7-company-profile-efatura-suppliers`) — migration `058` `entities.vkn`; required on create; editable in Set up → Restaurant; first-run onboarding VKN field; PDF parse excludes buyer VKN when entity VKN set.
- **e-Fatura auto-create suppliers** (`v0.73.7-company-profile-efatura-suppliers`) — `find_or_create_supplier_for_efatura` on upload; draft linked immediately; bank statement supplier create stays manual-only.
- **Delivery monthly gross + platform commission** (`v0.73.18-delivery-monthly-sales`) — one posted gross per platform/month (KDV dahil); commission e-Fatura linked by platform; migration `059`; `balance_left_kurus` reconciliation.
- **Supplier activity timeline + inline invoice preview** (`v0.73.19-supplier-activity-invoice-preview`) — chronological supplier Activity tab + Excel export; PDF preview on Review / supplier activity / draft review; document download API; partial commission confirm fix; duplicate discard (draft/duplicate only).

---

## 📋 Master build order (pre-launch — do in this sequence)

| Priority | ID | Slice | Status |
|----------|-----|-------|--------|
| **1** | **IC-A → IC-D** | **Invoice classification & e-Fatura routing** (below) | **IC-B done** — IC-C next |
| 2 | FP | Partner advance / drawing | Queued |
| 3 | FS | Salary period + auto-clear advance | Queued |
| 4 | P3 | Off-site backup of uploads | Queued |
| 5 | P5 | Delete company UI | Queued |
| 6 | P6 | Production cutover (ops) | Owner |
| 7 | P8 | Groceries / no-invoice card spend | Design TBD |
| — | P4, P7 | Backup prune, lint | Optional |

**Rule:** Finish **IC-A through IC-C** before FP/FS. **IC-D** (learning) only after IC-C is stable in production for a few weeks.

---

## 🔨 Build queue (each = one slice)

### IC — Invoice classification & e-Fatura routing  *(PRIORITY — before FP/FS)*

**Why:** Platform commission vs supplier expense must be correct before post. Getir uses **one VKN** for groceries (supply) and Komisyon (commission). Yemeksepeti commission invoices **do not contain the word “komisyon”** (they use *Sipariş İletim Hizmet Bedeli*, *Dağıtım Hizmet Bedeli*). **Fatura Tipi SATIS** appears on both types — useless for routing. Owner audit (Spice Corner May 2026 PDFs) confirmed gaps.

**Goal:** Correct kind on upload for the 95% case; recoverable when wrong; learning only for edge cases. **Never auto-post** — confirm remains the human gate.

**Permanent fixture corpus** (copy into `backend/tests/fixtures/efatura/spice_corner/` when building IC-B; CI must keep green):

| File (owner source) | Platform | Expected `invoice_kind` |
|---------------------|----------|-------------------------|
| `24.pdf` | Trendyol | `delivery_commission` |
| `54.pdf` | Yemeksepeti | `delivery_commission` (**currently MISSED by detector**) |
| `57.pdf` | Migros Yemek | `delivery_commission` |
| `58.pdf` | Getir | `delivery_commission` |
| Getir supply (`Fatura Yazdır…pdf`, May 2026) | Getir Perakende | `supplier` (never commission) |

**Classification rules (deterministic — implement in IC-B):**

- **Commission:** Komisyon Bedeli / Komisyon Faturası; YS *Hizmet Bedeli* lines + VKN 9470457468; Migros *Komisyon Faturası*; Trendyol *Komisyon Faturası* / GCF belge.
- **Supply override:** `Depo:`; ≥3 product SKU lines (food/packaging); mixed low KDV (1%/10%) on Getir groceries.
- **Never:** classify from platform name, Fatura Tipi SATIS, or Getir VKN alone.
- **Never:** linking delivery platform silently forces `delivery_commission` on supplier expense.

**Known gaps in shipped code (`v0.73.19`) — fix in IC slices, do not rebuild activity/preview:**

- Confirmed drafts cannot be rejected or unconfirmed (stuck if misclassified).
- `link_delivery_platform_to_draft` forces `delivery_commission` kind.
- Commission **post** still requires `supplier_id` though **confirm** does not.
- Post API may not map period-lock / delivery-disabled errors → opaque client NetworkError.
- Yemeksepeti commission (`54.pdf`) not detected; supply-layout check false-positive on table headers.

---

#### IC-A — Unconfirm / redo (safety net) ✅ `v0.73.20-invoice-unconfirm-redo`

**Spec:** Confirmed-but-not-posted → **Send back to review** (status `draft`/`needs_review`, keep PDF + extraction). Then: reject/discard, reclassify supplier ↔ commission, re-link supplier/platform. Audit who/when.

**Acceptance:** Owner can recover a stuck confirmed invoice without DB surgery.

**Tag target:** `v0.73.20-invoice-unconfirm-redo`

---

#### IC-B — Deterministic classification + fixtures + post fixes ✅ `v0.73.21-invoice-classification-fixtures`

**Spec:**

1. Fix `commission_detect.py` — Yemeksepeti Hizmet Bedeli patterns; tighten supply layout (ignore header-only *Mal/Hizmet* + *Miktar Birim* hits; require Depo or product rows).
2. Intake confidence: HIGH → auto kind; MEDIUM/LOW → `needs_review` + reason; no auto platform link on supplier expense.
3. Stop platform link from forcing commission without explicit commission intent.
4. Align commission post with confirm (no supplier required when platform linked).
5. Post API: catch `DeliveryNotEnabledError`, period-lock errors → 422 with clear message.
6. Add Spice Corner fixture tests (five PDFs above).

**Acceptance:** All five fixtures pass in pytest; upload simulation classifies correctly without user picking type.

**Tag target:** `v0.73.21-invoice-classification-fixtures`

---

#### IC-C — Review UX (minimal friction)

**Spec:** Preview + badge (**Supplier expense** / **Delivery commission**). HIGH confidence → suggest type + one Confirm. `needs_review` only → Accept suggestion or Change type. Unconfirm on confirmed. Do **not** ask type on every upload once IC-B is green.

**Acceptance:** Happy path upload → confirm → post (≤3 clicks); review path only when `needs_review`.

**Tag target:** `v0.73.22-invoice-review-confidence-ux`

---

#### IC-D — Per-entity classification learning  *(defer until IC-C stable)*

**Spec:** Same pattern as statement classification (`v0.71.14`): per-entity rules (seller VKN + text tokens → kind); learn on user override/unconfirm+reclassify; suggest after N confirms at HIGH confidence; correction downgrades bad rules. **Never auto-post.** No global cross-restaurant rule pool.

**Acceptance:** After one manual fix of an edge-case PDF, next similar invoice is auto-suggested correctly.

**Tag target:** `v0.73.23-invoice-classification-learning`

---

### ~~P1 — Expense account picker: show names, not GL codes~~ **DONE**

### ~~P2 — Auto-categorize manual expenses (AI + learning)~~ **DONE**

### P3 — Off-site backup of uploads (receipt images)  *(backup gap)*
**Why:** nightly backup covers the DB only; uploaded receipt files live on the API disk and aren't backed up.
**Spec:** add upload-file sync to R2 — simplest is to have the API periodically (or on upload) mirror `UPLOAD_DIR` to the R2 bucket under an `uploads/` prefix, or attach the uploads volume to the `mizan-backup` job so its tar includes them. Confirm restore path. (Ask me for a full Cursor prompt when ready.)

### P4 — Backup retention / pruning  *(housekeeping)*
**Why:** the cron only runs `cli run`; old backups accumulate in R2 forever.
**Spec:** schedule `python -m app.features.backups.cli prune` (the retention logic already exists — 14 daily / 8 weekly) as a second Railway cron (e.g. weekly), same env as `mizan-backup`. No code change expected.

### P5 — "Delete company" (and member/role management) in the UI  *(missing self-service)*
**Why:** no in-app way to delete a company (had to use SQL). 
**Spec:** owner-only "Delete company" in Settings with a typed-name confirmation; backend `DELETE /entities/{id}` guarded to owner, cascades (FKs already `ON DELETE CASCADE`). Consider also surfacing existing member add/remove/role endpoints if not fully wired. (Ask me for a full Cursor prompt when ready.)

### P6 — Full production cutover  *(ops, not Cursor — owner steps)*
**Why:** currently staging-mode (Clerk dev keys, `APP_ENV=staging`).
**Steps (when you have a domain):** buy/point a custom domain → Netlify custom domain + Railway custom domain (HTTPS) → Clerk **production instance** + live keys (`pk_live_`/`sk_live_`) → set `APP_ENV=production`, live Clerk keys, and `CORS_ORIGINS` to the real domain on Railway → set `NEXT_PUBLIC_*` to live values on Netlify → re-run smoke. (Ask me to walk it step-by-step.)

### P7 — Lint cleanup  *(cosmetic, optional)*
**Cursor prompt:**
```
Remove ESLint "defined but never used" warnings across frontend/src (unused imports/vars, e.g. entity-access.test.ts). No runtime behavior change. Run frontend lint + tests green. Commit: "chore(frontend): remove unused imports".
```

### P8 — Groceries / no-invoice card spend (Migros, BİM, etc.)  *(future)*
**Why:** daily purchases paid by card/bank with no e-Fatura — not supplier payables.
**Spec:** petty-cash / expense-only path (not auto-supplier from bank). Design slice TBD.

### Decisions (no build, your call)
- **Neon 7-day instant restore** (~$5/mo) — upgrade for finer point-in-time DB recovery on top of nightly off-site backups. Optional.
- **Restore-verify** — occasionally run `python -m app.features.backups.cli verify` (restores latest backup into a scratch DB + checks the books tie) for peace of mind.

---

## 🧭 UX Reorg — "one home for everything" (from `UX_AUDIT_PROPOSAL.md`)

**Status: DONE (`v0.73.5`–`v0.73.7`, UX1–UX7). Do not rebuild.** Kept below as reference only.

Goal: stop the back-and-forth and the "why is this page here?" confusion. Reorganize the app around what the owner does, give every action/page exactly **one home**, and remove/merge duplicate pages — **without changing any accounting behavior**.

### Target structure (preview — what it becomes)

Sidebar = 6 intents (old domain pages become drill-downs inside these, reachable via redirects):

| Sidebar | Route | What's on it |
|---|---|---|
| **Dashboard** | `/` | KPIs, **Recent entries**, **Needs-review** count (→ Review), onboarding checklist |
| **Record** | `/record` | ONE hub to post everything — card grid by workflow. Opens existing forms. People cards (staff/partner/customer) use a **person picker** so you never pre-navigate. New button + ⌘K open the same actions. |
| **Review** | `/review` | ONE needs-review queue — tabs: Bank & card · Sales · Receipts · Invoices · Delivery · **All posted** (general ledger) |
| **Balances** | `/balances` | Who owes whom — tabs: Suppliers (payables) · Customers (receivables) · Staff · Partners · Cash & bank. Detail pages still hold ledger history + record-payment. |
| **Reports** | `/reports` | Financial statements only — P&L, Balance sheet, Cash flow, KDV, Period comparison |
| **Set up** | `/setup` | Settings, Members, Opening balances, Delivery platforms, Bank/cash/FX/card accounts, Expense-item merge, Backups info, masters |

**Record hub card groups:** Today (Close day · Daily sales · Manual expense) · Upload & extract (POS photo · Receipt · e-Fatura · Delivery report · Bank statement) · Cash & FX (Cash movement · Buy/Convert/Spend FX · Transfer) · Sales & cards *(Card batch · POS settlement · Clear commission — collapsible "Advanced")* · People (Staff accrual/advance/payment · Partner expense/reimbursement · Customer credit sale/payment — each via person picker) · Suppliers (New supplier · Record payment).

### Pages that get MERGED / REMOVED (one home each — redirect old URLs)

- `/uploads` ("Documents") → **removed**; upload actions live in **Record**, pending items in **Review**. Redirect → `/record`.
- Duplicate **Upload** buttons on Sales / Delivery / Supplier headers → replaced by a link to **Record**.
- Dashboard quick buttons → call the **same** Record actions (no duplicate logic).
- `/cards` card-clearing recon → **Balances → Card clearing** tab (cross-link from Sales).
- `/reports/ledger` (general ledger) → **Review → All posted**; manual journals → **Set up → Accountant**. Reports = statements only.
- Top-level domain sidebar items (Sales, Expenses, Suppliers, Staff, Partners, Customers, Banking, Delivery) → reachable from the hubs; old routes redirect.

### Decisions (baked in — build to these)

Q1 daily path = **Close day + POS photo when Z-tracking on**. Q2 card batch/settlement = **Advanced collapsible** in Record. Q3 ledger → **Review → All posted**; manual journals → **Set up → Accountant**. Q4 people payments = **person picker in Record**. Q5 sidebar = **add hubs first, retire old domain nav in the LAST slice** (no big-bang). Q6 = **drop `/uploads`/"Documents"**. Q7 = **one Manual Expense with a payment-mode toggle** (cash vs partner-fronted).

### GLOBAL RULES for every UX slice (Cursor must follow all — prevents rework & breakage)

```
- REUSE existing forms/components/APIs verbatim. Do NOT fork, rewrite, or duplicate any form — only add new hub SHELLS + person-picker WRAPPERS and move call sites. Every existing function/feature must stay wired to its form.
- NO accounting/booking/posting changes. Behavior-preserving; GL posting tests must be unchanged.
- For every route you move or remove, add a REDIRECT from the old path to the new one (keep ≥6 months). Nothing should 404 or lose a bookmark.
- Keep ALL auth/role gates (shouldShowNewMenu, canWriteOperations, financial-report gating) and feature toggles (delivery_enabled, card-tips) applied on the new hubs/cards.
- New menu, ⌘K command palette, and the Record hub must share ONE action source — do not duplicate handlers.
- Update nav config (nav-sections.ts / app-routes.ts) AND their tests; add a reachability test for each new hub. Keep frontend build + pytest green.
- ONE UX slice at a time, sequential. Do not run other nav-touching work in parallel. Commit + push after each slice.
```

### UX slices (build in this order)

**UX1 — Record hub + people pickers** *(highest value; absorbs the old "S1")*
```
Create /record — a single hub page listing every posting action as a card grid grouped by workflow (Today; Upload & extract; Cash & FX; Sales & cards [Advanced collapsible]; People; Suppliers). Each card opens the EXISTING modal/form (or navigates to the existing full-page form) — reuse the same handlers the New menu uses (no new forms, no new APIs). For People cards (staff accrual/advance/payment, partner expense-fronted/reimbursement, customer credit-sale/payment) add a person-picker wrapper (reuse Combobox + the existing detail forms) so the owner picks the employee/partner/customer in the dialog instead of pre-navigating. Add "Record" to the sidebar. Keep the New menu + ⌘K working and pointed at the same actions. Apply all auth/role/toggle gates to the cards. Tests: each card opens, person picker drives the right form/entity_id, gated actions hidden for non-owners. Follow the GLOBAL RULES above. Commit: "feat(ux): Record hub with person pickers".
```

**UX2 — Balances hub**
```
Create /balances with tabs: Suppliers (move /payables table), Customers (move /receivables table), Staff (employee list + balance column), Partners (partner list + balance column), Cash & bank (entry card → existing /banking tree). Reuse existing tables/endpoints; for staff/partner balance columns use a lightweight read-only summary (or per-row fetch) — no posting changes. Detail pages (/suppliers/[id] etc.) stay for ledger history + record payment, linked from the tables. Redirect /payables and /receivables to /balances tabs. Add "Balances" to sidebar. Follow GLOBAL RULES. Commit: "feat(ux): Balances hub (payables, receivables, staff, partners)".
```

**UX3 — Review hub (unified needs-review)**
```
Rename/extend /banking/review → /review (redirect old path). Add tabs reusing existing list endpoints/pages: Bank & card (current), Sales (pos daily-summaries needs_review → /sales/[id]), Receipts (expense-receipts → /review/receipts/[id]), Invoices (invoice drafts → /review/invoices/[id]), Delivery (delivery reports → /delivery/reports/[id]), and "All posted" (general ledger from /reports/ledger). Lazy-load each tab. Dashboard "Needs review" → /review with the right tab. Add "Review" to sidebar. Follow GLOBAL RULES. Commit: "feat(ux): unified Review hub".
```

**UX4 — Reports = statements only**
```
Reduce /reports to financial statements (P&L, Balance Sheet, Cash flow, KDV, Period comparison, delivery sales). Move General ledger to Review→All posted (UX3) and Manual journals to Set up→Accountant (UX5) — redirect the old report cards/routes. Keep existing role gating. Follow GLOBAL RULES. Commit: "feat(ux): Reports trimmed to financial statements".
```

**UX5 — Set up hub**
```
Create /setup merging the Settings hub + master/config entry points: Restaurant & toggles, Opening balances, Members, Expense-item merge, Delivery platforms (move from under Delivery), Bank/cash/FX/card accounts (link to banking accounts), Manual journals (Accountant), Backups info. Rename sidebar "Settings" → "Set up"; redirect /settings and /delivery/platforms. Follow GLOBAL RULES. Commit: "feat(ux): Set up hub".
```

**UX6 — Collapse sidebar + remove duplicates (LAST)**
```
Now that the hubs exist, collapse the sidebar to the 6 intents (Dashboard, Record, Review, Balances, Reports, Set up). Remove the standalone domain sidebar items (Sales, Expenses, Suppliers, Staff, Partners, Customers, Banking, Delivery) — they remain reachable via the hubs + redirects. Remove the /uploads page content (redirect → /record) and the duplicate Upload buttons on Sales/Delivery/Supplier headers (replace with a link to Record). Update nav tests + add reachability tests for every old route's redirect. Follow GLOBAL RULES. Commit: "feat(ux): collapse sidebar to intents; remove duplicate pages".
```

---

## 🧩 Feature gaps (separate from UX reorg — after IC-A–IC-C)

These add capability the reorg doesn't (the reorg only relocates). **Build after invoice classification (IC) slices** — IC blocks daily e-Fatura workflow.

- **FP — Partner advance / drawing (partner OWES the business).** Today the partner ledger only tracks "business owes partner" (expense fronted + reimbursement). Add advance/drawing movements so a partner can owe the business, and show the balance in either direction ("owes you" vs "you owe"). Backend movement + posting + ledger sign; partner page + Record card. *(Ask for full Cursor prompt when ready.)*
- **FS — Salary period + auto-clear advance.** Add a salary **period/month** to the accrual; when paying salary, surface the employee's **outstanding advance** and auto-deduct it (the posting layer supports `advance_applied`; service currently passes 0 — wire it). *(Ask for full Cursor prompt when ready.)*

---

**How to use:** pick a slice from the **Master build order** → build + test + commit/tag → push → deploy → test live. **Next:** **IC-A → IC-B → IC-C** (then FP/FS). UX reorg **UX1–UX7 done** — do not rebuild. Tell me when you start any slice and I'll expand the spec or walk the ops steps.

**Session recovery:** read `ROADMAP.md` **Current status** + `PROGRESS.md` **Current** + this file **Master build order** — git tag wins over stale doc lines.
