# Post-Launch Build Queue

Actionable companion to `ROADMAP.md`. **Done** items are recorded so they are never rebuilt. **To-build** items are written as slices — each has a ready-to-paste **Cursor prompt**. Build one slice at a time; commit + push after each.

Live app (staging-mode): Frontend **Vercel** (migrated from Netlify) · API **Render** (`render.yaml`) · DB Neon (PG18) · Auth Clerk (dev keys) · Backups → Cloudflare R2 (nightly).

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
- **Partner advance / drawing (FP)** (`v0.73.23-partner-advance-drawing`) — drawing + repayment movements; bidirectional partner balance; partner page + Record hub.
- **Salary period + advance UX (FS)** (`v0.73.24-salary-period-advance-ux`) — accrual period fields (migration `060`); ledger advance totals; payment preview + `advance_applied_minor` on API response.
- **Supplier invoice expense-account learning** (`v0.73.44-invoice-supplier-expense-learning`) — migration `066` `supplier_expense_account_rules`; learns on post; HIGH confidence preselects expense account on draft review.
- **Invoice one-click post (IC-E slice 1)** (`v0.73.46-invoice-one-click-post`) — `POST confirm-and-post` when supplier linked + classification HIGH + expense account HIGH; atomic confirm+post; trusted UI replaces separate Confirm step.
- **Invoice auto-post on upload (IC-E slice 2)** (`v0.73.48-invoice-supplier-auto-post`) — entity setting `invoice_supplier_auto_post` (off by default); supplier invoices only; all HIGH gates; `RULE_AUTO` audit; failures → needs review.
- **Supplier invoice Edit (fix)** — Edit only on current posted row; prefill expense account from ledger (not 5200 default); resolve void/reversal chain; learns expense account on edit.
- **Supplier invoice number uniqueness** — live posted guard on `(supplier, invoice_number)`; upload marks `duplicate`; post/auto-post/one-click blocked; edit/correct exempt.
- **Supplier activity void display** — İptal rows show negative amounts; invoice totals count live rows only; draft amounts sync on edit.
- **IE-A — never reject PDF extraction** (`v0.74.0-invoice-never-reject-pdf`) — PDF upload failures → `needs_review` draft with stored file; partial field harvest; `assumed_vat`/`net_adjusted` force review and block one-click/auto-post.
- **IE-B — AI vision PDF extraction** (`v0.74.1-invoice-vision-extraction`) — optional vision OCR fallback for no-text/scanned PDFs; VKN checksum validation; vision never auto-posts.
- **IE-C — Extraction hardening** (`v0.74.2-invoice-extraction-hardening`) — PyMuPDF primary text extraction (lazy, pypdf fallback); VKN checksum on heuristic PDF extractions blocks invalid supplier auto-creation; structured `invoice_draft_created` telemetry log. IE arc complete.

---

## 📋 Master build order (pre-launch — do in this sequence)

| Priority | ID | Slice | Status |
|----------|-----|-------|--------|
| — | IC-A→D | Invoice classification & e-Fatura routing | **Done** (`v0.73.20`–`.26`) |
| — | FP / FS | Partner advance / drawing · Salary period | **Done** (`v0.73.23` / `.24`) |
| — | IE-A→C | Invoice PDF never-reject + vision + hardening | **Done** (`v0.74.0`–`.2`) |
| — | SEC-1→4 | Security audit fixes (POS guards, /users, actor, entity-switch, +4) | **Done** (`v0.75.0`–`.3`) |
| — | Telecom | KDV Matrah + ÖİV extraction | **Done** (`v0.76.0`) |
| — | Learning | Invoice learning pipeline + commission one-click | **Done** |
| **0** | **DEPLOY** | **Deploy catch-up: ship 72 commits + Netlify→Vercel cleanup** | **Config done** — owner: env vars + deploy + smoke |
| **1** | **UX-A** | Retire "New" menu, rename Record → "Add", unify dashboard shortcuts | **Done** (`v0.uxa-retire-new`) |
| **2** | **UX-B** | Data-first global search (suppliers + commodities, names only) | Phase 13 |
| **3** | **DASH-A** | Dashboard composition charts (free — existing data) | Phase 13 |
| **4** | **UX-C** | Unified "Add document" upload (auto-detect + confirm) | Phase 13 |
| **5** | **DASH-B** | Time-series aggregation endpoint + trend charts | Phase 13 |
| **6** | **SRCH-B** | Spend totals in search (reuses DASH-B) | Phase 13 |
| **7** | **UX-D** | Self-curating "Most used" in Add | Phase 13 |
| — | P3 / P5 / P8 | Upload backup · Delete company UI · Groceries path | Queued |
| — | P4, P7 | Backup prune, lint | Optional |

**Rule:** one slice at a time, in the numbered order. Phase 13 slices assume the app is LIVE — every backend addition must be entity-scoped (RLS) and date-range bounded like the rest.

---

## 🚀 Phase 13 — Post-launch UX & insights

**Context:** App is live. Goal is to make it feel professionally built and easy to navigate — one place to record, one place to find, a dashboard that shows how the business is doing. Follow the UX GLOBAL RULES (reuse forms/handlers/APIs, ONE action source, redirects, NO accounting changes, keep auth/role/toggle gates, update nav tests). One slice at a time. Cursor writes tests but does NOT run them — owner runs locally.

**Sequencing logic:** UX-A and UX-B both touch the top bar / command-palette → sequential, never parallel. DASH-B builds a by-day/by-category aggregation endpoint ONCE; it powers both the trend charts AND the SRCH-B search spend-totals — do not build that aggregation twice. UX-A is the quick win that resolves the "New vs Record" redundancy.

**Decisions locked (owner):** create surface stays in the sidebar (renamed from "Record" — working name **"Add"**; owner may rename). "New" menu is retired (it's a strict subset of Record — verified). Top search bar = data-first FIND (suppliers + commodities), separate from Add. Active restaurant name stays visible (sidebar top + top-right switcher — unchanged). Dashboard is the post-login landing page and keeps its daily shortcut buttons.

### UX-A — Retire "New", rename Record → "Add", unify dashboard shortcuts
Frontend only, no backend. Remove the sidebar "New" dropdown (`new-menu.tsx`) + `NEW_COMMAND_QUICK_ACTIONS` + the `quickAction` duplicate entries in `app-routes.ts` — every item already exists in `RECORD_ACTIONS` (verified: New = strict subset). Rename the "Record" sidebar hub + surface to "Add" (owner to confirm label). Keep the dashboard's Daily sales / Add expense / Close day buttons but point ALL of them at the same `openRecordAction` source (today "Close day" is a `<Link>`, the other two are dialogs — unify). Keep the entity switcher untouched. Tests: no orphaned New refs; dashboard buttons + Add surface share one action source; gated actions still hidden for view-only.

### UX-B — Data-first global search
Frontend; uses EXISTING endpoints. Rewrite the top-bar search (`command-palette.tsx`) as one box, ranked: **Suppliers** (GET `.../suppliers?q=` — already searches name+VKN) → **Items/commodities** (expense-items `?q=` — already normalized, so "milk"/"süt" tolerance works) → **Pages** (appRoutes) → **Actions** (RECORD_ACTIONS, role-gated). Empty query = pages+actions only. Placeholder "Search suppliers, items, pages…". Debounce ~250ms, entity-scoped, discard stale responses on keystroke/entity switch (reuse the SEC-3 stale-guard pattern). NO spend totals yet — leave a subtitle slot on result rows for SRCH-B. Tests: supplier by name; "milk"/"süt" finds the item; stale entity results don't render; role-gated actions hidden.

### DASH-A — Dashboard composition charts (free)
Frontend only; data already in the dashboard payload. Add: **Sales mix** (cash/POS card/delivery/other — donut or bar), **Sales vs expenses vs net** (3-bar), **Owed/owing** (payables/receivables/TRY position). Use the frontend chart lib already in the stack. Keep the dashboard as landing page. No backend change. Tests: charts render from the existing DashboardRead fields; empty/zero states clean.

### UX-C — Unified "Add document" upload
Backend + frontend. Backend: extend `detect_source_type` into a shared `detect_document_type(content, filename, content_type) → (type, confidence)` classifying invoice (XML/PDF) / bank_statement (CSV/XLS/XLSX) / expense_receipt (image) / pos_daily_summary; reuse `resolve_statement_format` and the invoice detector — don't duplicate. New thin dispatch endpoint. Frontend: ONE "Add document" drop zone replacing the per-type upload cards; on drop → detect → "We read this as **<type>** — Confirm or change"; low confidence → type picker (never fail). Route to the EXISTING upload/review forms via `initialFile` passthrough. **Bank statements:** thread the dropped file through to the import page (don't make the user re-upload) — if the column-mapping step blocks true passthrough, state it as a known tradeoff. Manual posting actions stay OUT (files only). Redirects for removed upload routes. Tests: each type routes right; ambiguous shows picker; wrong guess correctable; existing upload tests green.

### DASH-B — Time-series aggregation + trend charts
Backend + frontend. New entity-scoped, date-range-bounded endpoint returning sales and expenses grouped by day (and expenses by category) over the selected range. Frontend: sales/expenses/net trend line(s) on the dashboard. **This aggregation is the shared foundation for SRCH-B — build it to also answer "total per expense item/commodity over range."** Tests: aggregation is RLS-scoped (entity A can't see B), sums match the totals DASH-A shows, empty range clean.

### SRCH-B — Spend totals in search ✅ `v0.srchb-spend-search`
Small backend (reuse DASH-B aggregation) + frontend. Fill the result-row subtitle slot from UX-B: "Peynir — ₺4,200 this period", supplier spend likewise. Type "cheese"/"peynir" → see the number. Tests: totals match the by-category aggregation; entity-scoped; period-aware.

### UX-D — Self-curating "Most used" in Add ✅ `v0.uxd-most-used`
Frontend polish (small usage tracking — localStorage per entity, or a light backend count). Top of the Add surface shows the owner's most-used/most-recent actions automatically (Close day, expense, sales, Add document typically), full grouped list below. Replaces the value the old "New" curated list gave, without manual upkeep. Tests: ordering reflects recorded usage; falls back to a sensible default set when no history.

---

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

#### IC-C — Review UX (minimal friction) ✅ `v0.73.22-invoice-review-confidence-ux`

**Spec:** Preview + badge (**Supplier expense** / **Delivery commission**). HIGH confidence → suggest type + one Confirm. `needs_review` only → Accept suggestion or Change type. Unconfirm on confirmed. Do **not** ask type on every upload once IC-B is green.

**Acceptance:** Happy path upload → confirm → post (≤3 clicks); review path only when `needs_review`.

**Tag target:** `v0.73.22-invoice-review-confidence-ux`

---

#### IC-D — Per-entity classification learning ✅ `v0.73.26-unified-document-learning`

**Spec:** Same pattern as statement classification (`v0.71.14`): per-entity rules (seller VKN + text tokens → kind); learn on user override/unconfirm+reclassify; suggest after N confirms at HIGH confidence; correction downgrades bad rules. **Never auto-post.** No global cross-restaurant rule pool. Unified `learning_correction_events` audit across bank, invoice, and expense intakes.

**Acceptance:** After one manual fix of an edge-case PDF, next similar invoice is auto-suggested correctly.

**Tag target:** `v0.73.26-unified-document-learning`

---

#### IC-E — Invoice one-click post & optional auto-post ✅

**Slice 1 — One-click confirm+post** ✅ `v0.73.46-invoice-one-click-post`

When supplier linked, invoice kind HIGH, and learned expense account HIGH: single **Post invoice & payable** (confirm+post atomically). Two-step Confirm → Post remains for untrusted drafts.

**Slice 2 — Opt-in auto-post on upload** ✅ `v0.73.48-invoice-supplier-auto-post`

Entity setting `invoice_supplier_auto_post` (Set up → Restaurant, off by default). When on and all trust gates pass, upload confirm+posts with `RULE_AUTO` audit. Commission / uncertain drafts unchanged.

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

**Done — do not rebuild:**

- **FP — Partner advance / drawing** (`v0.73.23-partner-advance-drawing`) — drawing + repayment; bidirectional balance UX.
- **FS — Salary period + advance UX** (`v0.73.24-salary-period-advance-ux`) — accrual period (migration `060`); ledger advance totals; payment preview; auto-clear was already in posting — correction path with `advance_applied` sibling still blocked (known since `v0.69.3`).

---

**How to use:** pick a slice from the **Master build order** → build + test + commit/tag → push → deploy → test live. **Next:** **P3** (upload backup). UX reorg **UX1–UX7 done** — do not rebuild.

**Session recovery:** read `ROADMAP.md` **Current status** + `PROGRESS.md` **Current** + this file **Master build order** — git tag wins over stale doc lines.
