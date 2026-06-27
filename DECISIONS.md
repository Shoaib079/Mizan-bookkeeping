# DECISIONS

Significant technical choices and rationale (see CURSOR_RULES.md §8). Product decisions live in Restaurant_Bookkeeping_App_Decisions.md.

## 2026-06-27 — Production hosting stack (Phase 12 Slice 12.1)

**Choice:** Split hosting by layer — **Netlify** for Next.js frontend (`netlify.toml`, monorepo `base=frontend`); **Render** for FastAPI web + Celery worker + Celery beat (`render.yaml`, `backend/Dockerfile`). Managed **Postgres** (Neon/Supabase) and **Upstash Redis** via env URLs. **S3-compatible** storage (R2/S3) for off-site backup bundles only; **uploads stay on persistent disk** mounted at `/app/data/uploads` on the API host (no cheap Netlify Blobs adapter for runtime uploads).

**CORS:** `CORS_ORIGINS` comma-separated env replaces hardcoded localhost in `main.py` — required for browser calls from Netlify to Render.

**Out of scope this slice:** Production `alembic upgrade head`, Clerk live keys, live deploy — owner steps in `DEPLOY.md`; execution in Slice 12.2.

## 2026-06-27 — Production provisioning (Phase 12 Slice 12.2)

**Choice:** Canonical production schema = **`alembic upgrade head` only** (no `init_database` / schema drop). `run_production_migrations()` runs migrate + `mizan_app` grants; `verify_production_database()` asserts Alembic head, RLS on every `RLS_TABLES` entry, named lookup policies, and immutability triggers.

**Readiness:** `GET /health/ready` pings Postgres (503 if unreachable); Render health check and pre-deploy migrate/verify on API deploy.

**Boot guards:** `APP_ENV=production` rejects localhost CORS default, Clerk test keys (`sk_test_`/`pk_test_`), disabled auth enforcement, and missing JWT verification env.

**Owner runbook:** `DEPLOY.md` + `scripts/smoke_staging.sh`; Clerk JWT template must include `email` + `email_verified`.

**Alternatives considered:** `create_all` bootstrap for prod (rejected — drift from Alembic chain); init_database on boot (rejected — non-idempotent, bypasses migration history).

**Alternatives considered:** Railway (equivalent to Render — documented in DEPLOY.md); Netlify Functions for API (rejected — FastAPI + Celery + pg_dump need a long-running host).

## 2026-06-24 — Card-tip day ops guidance (Phase 8.8 H4)

**Choice:** When Z ≠ system card, Needs Review `review_reason` explains the owner workflow instead of a generic mismatch line. If Z exceeds system card: on re-confirm, reallocate cash→card so card equals Z (same daily total), record the tip on the expense paper (`Dr 5700 / Cr cash`), then confirm again. Decisions §9 operator note documents the same steps.

**What changed:** `_z_mismatch_review_reason()` in `daily_summary_service.py`; Decisions §9 operator note; integration test in `test_pos_card_tips.py`.

**Not in slice:** Frontend copy (Phase 9 Slice 2d).

## 2026-06-24 — Z report match-or-review; no POS tip posting (supersedes Slice B1 tip basis)

**Canonical Z description (`v0.57.0`).** Single source of truth for card-terminal Z handling — supersedes original Slice B1 (`v0.49.0`) `system`/`z_report`/`ask` GL model below.

**Choice:** Simplify POS daily-summary confirm per owner direction: tips are **only** on the expense list (`Dr 5700 / Cr cash` via `post_expense_entry`), never derived or posted at POS. When `card_tips_z_report_enabled` is on, the owner enters the card-terminal **Z report** with the intake; the app compares **Z to system card sale** — **match → post** cash + card as on the system slip; **mismatch → Needs Review** (owner corrects figures). Removed `card_sale_basis` / `expected_tip_kurus` from confirm APIs; `card_sale_basis` entity setting is **deprecated** (ignored). Removed `POS_CARD_TIP` posting from `confirm_pos_daily_summary`; card clearing (`1400`) debits **system card sale** only. `JournalEntrySource.POS_CARD_TIP` retained in the registry for voiding any historical rows. Ops workflow when Z > system card: Phase 8.8 H4 (reallocate cash→card, expense-paper tip, re-confirm).

**GL:** Sales gross — `Dr cash / Cr 4000` + `Dr 1400 / Cr 4000` (card = system slip). Tips on expense paper roll into P&L (`5700`) and reduce cash on the balance sheet — same as any expense line.

**Tests:** `test_pos_card_tips.py` rewritten for match-or-review; `test_expense_receipt` asserts P&L + balance sheet after multi-line confirm.

**Status:** money-critical — owner sign-off required.

## 2026-06-24 — Expense receipt OCR multi-line + manual daily sales (Phase 8.7; owner decision)

**Choice:** Supersedes Slice C tip-only OCR with a **parent intake** model (`expense_receipt_intakes` + `expense_receipt_lines`). One uploaded photo → N draft lines → atomic confirm posts N `ExpenseEntry` rows via existing `post_expense_entry` (`source=expense_entry`, no new `JournalEntrySource`). Fingerprint dedup moves to the intake table; migration `048` drops the per-row unique on `expense_entries.source_document_fingerprint` (blocked multi-line from one photo).

**Receipt OCR:** `adapters/ocr_ai/expense_receipt.py` — fixture registry → UTF-8 heuristics → vision OCR (strict JSON, env-gated). One line per item; tip → `5700`, others → `5200`. Cash-only (`money_account_id` must be cash). Review-first; deterministic Needs Review guards (no lines, zero amounts, fuzzy items, optional total mismatch).

**API:** `POST/GET .../expense-receipts`, `POST .../confirm`, `POST .../reject`. Legacy `POST .../expenses/tip-photos` delegates to unified intake.

**Manual sales:** `POST .../pos/manual-daily-sales` — typed cash + card; reuses `confirm_pos_daily_summary` posting path; optional Z-report tip when entity enabled.

**Frontend (Phase 9):** **New** dropdown — manual expense, manual daily sales, expense receipt upload; receipt review screen (photo + editable lines).

**Status:** money-critical — independent review + owner sign-off per slice.

## 2026-06-24 — Expense-photo OCR cash-tip (Slice C; owner ask)

**Choice:** Reuse the existing **expenses pipeline** to capture a cash tip read from an uploaded receipt photo, rather than build a new intake table. A tip is already a cash expense (`Dr 5700 Tips Expense / Cr cash`, Slice A); the only new need is reading the tip off a photo and holding it for review. The photo upload creates an `ExpenseEntry` in `needs_review` pointed at `5700`; confirm posts it through the unchanged `post_expense_entry` boundary with `source=expense_entry`. Because no new `JournalEntrySource` is introduced, the correction registry, cash-flow categorization, and RLS registries need **no changes** (connected-surface audit).

**Reader:** `adapters/ocr_ai/expense_photo.py` mirrors the POS daily-summary reader — a fixture registry (deterministic tests) first, then UTF-8 text heuristics; real binary images raise `ExpensePhotoUnsupportedError` and route to Needs Review until vision OCR lands. Tip labels: `Bahşiş` / `Bahsis` / `Servis(  Ücreti)` / `Tip` / `Gratuity`. Amounts use the canonical `core/money.parse_try_loose` (no duplicate Turkish-number parser). Scope is deliberately the **tip only** — the general receipt total / line-item read stays the manual expenses pipeline's job (no speculative scope).

**Review-first:** nothing posts on upload. The draft carries a review reason ("Tip read from expense photo: 50,00 ₺ — confirm or correct" or, when nothing is found, "No tip detected — enter the tip amount"). Confirm (`ConfirmTipPhotoRequest`) may correct the **amount, cash/bank account, and date**. A zero/empty tip cannot post (`ExpenseNotReviewableError`); confirming a non-photo expense via this route is refused (`NotATipPhotoError`); confirming twice is blocked by the `needs_review` status guard (no double-post).

**Storage / dedup:** new nullable columns `expense_entries.source_document_fingerprint` (SHA-256) + `source_document_path`, with a unique `(entity_id, source_document_fingerprint)` constraint. Per-entity dedup (NULLs stay distinct, so manual expenses without a photo never collide; the same photo is allowed in different restaurants). The pre-insert `select` plus a commit-time `IntegrityError → DuplicateExpenseDocumentError` makes a concurrent-upload race a clean 409, not a 500.

**API:** `POST /entities/{id}/expenses/tip-photos` (multipart: `file` + `money_account_id` + `actor_id`) → draft; `POST /entities/{id}/expenses/tip-photos/{expense_id}/confirm` → posted. Migration `047_expense_source_document` (additive/nullable). Considered and rejected: a dedicated `expense_documents` intake table (over-built for a tip-only slice) and a shared OCR text-parsing module that would have refactored the money-critical POS reader (unnecessary blast radius — reused `parse_try_loose` instead).

**Status:** money-critical (touches the posting boundary + a migration) — independent review + owner sign-off required.

## 2026-06-24 — Card commission via total clearance (Slice B2; owner decision)

**Choice:** Hidden bank commission is derived as the **card-clearing residual** — no configuration. Both banks' card deposits credit the one card-clearing account `1400`; whatever remains after the owner records net deposits is the commission. The owner explicitly rejected a `commission_recognition` cadence setting ("keep it the way it was — I don't have to do anything"): record net deposits, then press one button when all deposits are in.

**Trigger:** owner decision — one button, **no period** (`ondemand_nodate`). Books whatever is currently in `1400`. (Considered and rejected: a per-period one-click and a fully-automatic month-end post.)

**GL:** `Dr 5300 Bank Charges / Cr 1400 Card Sales Clearing` for the current `1400` debit balance; `source=pos_commission_sweep`. Zeros the clearing account. No subledger row and **no migration** — a standalone GL journal (like a manual journal / opening-balance post).

**Guards:** reject a **zero** balance (`NothingToClearError` → 422 "nothing to clear") and a **negative** balance (deposits exceed card sales — review deposits first). **Phase 8.8 H1:** reject when reconciliation shows `in_transit_kurus > 0` and **no bank deposits recorded** (`pos_settlement_count == 0`) — `InTransitCardSalesError` → 422 with a clear message — so undeposited card sales cannot be swept as commission. After net deposits are in, `in_transit_kurus` may still reflect the commission residual in clearing (Slice B2 workflow); sweep is allowed once at least one settlement exists. **Repeatable** by design: each press clears the current leftover, so a later sales/deposit cycle is swept by pressing again (no per-period idempotency marker needed).

**Interplay with per-settlement commission:** unchanged and complementary — if a settlement already recorded commission (explicit or inferred from a linked batch), it credited `1400` by the gross, so the residual the sweep books is only the still-unaccounted commission. No double count.

**API:** `POST /entities/{id}/pos/clearing-reconciliation/clear-commission` → `{commission_kurus, clearing_balance_before_kurus, clearing_balance_after_kurus, clearance_date, journal_entry_id}`. Core: `post_card_commission_clearance()`. New `JournalEntrySource.POS_COMMISSION_SWEEP` (cash-flow operating; correction void-and-reenter).

## 2026-06-24 — Card tips via the card-terminal Z report (Slice B1; owner decision)

> **SUPERSEDED (`v0.49.0` → removed in `v0.57.0`).** Canonical model: see **"Z report match-or-review; no POS tip posting"** above. Do **not** re-implement `card_sale_basis`, `system`/`z_report`/`ask` GL legs, or `POS_CARD_TIP` posting at confirm. Historical record only.

**Choice:** Restaurants that collect tips on the card terminal reconcile them with the terminal's **Z report**. Z report total = system card sale + card tips, so the day's card tip is `tip = Z − system card sale`. Whether and how this is applied is **per-entity** (every restaurant runs differently — some take platform sales as cash on the Z report, some are card-only, etc.).

**Settings (`entity_settings`):**
- `card_tips_z_report_enabled` (`true`/`false`, default off) — when off, the daily summary posts gross card sales exactly as before; a passed `z_report_kurus` is ignored.
- `card_sale_basis` (`system` | `z_report` | `ask`, default **`ask`**) — how to treat a tip-bearing day:
  - `system` — book the POS system card sale as revenue; the tip is a **pass-through** (received via card clearing, paid to staff from the drawer); no P&L impact.
  - `z_report` — book the **Z total** as revenue; expense the tip to `5700` (paid to staff from the drawer).
  - `ask` — never auto-post a tip-bearing day; route to Needs Review so the owner decides per entry.

**GL model (anchor: `1400` card clearing must always be debited the full Z deposit so deposits + the commission sweep clear it to zero).** Worked example — system card sale 1000, tip 100, Z 1100, hidden commission 30, bank deposit 1070:

- **system basis:** card sale `Dr 1400 1000 / Cr 4000 1000`; tip pass-through `Dr 1400 100 / Cr cash 100`. `1400` = 1100. Revenue = 1000.
- **z_report basis:** card sale `Dr 1400 1100 / Cr 4000 1100`; tip expense `Dr 5700 100 / Cr cash 100`. `1400` = 1100. Revenue = 1100, tip expense = 100.
- both: deposit `Dr bank 1070 / Cr 1400 1070`; commission `Dr 5300 30 / Cr 1400 30` → `1400` = 0.

The `card_sales_batch.gross_amount_kurus` is stored as the full **Z** total (the amount that will be deposited) so clearing reconciliation and settlement/commission matching operate on the deposited figure. The tip leg is its own journal with `source=pos_card_tip` (separate from the `card_sales` sale journal) to keep cash-flow classification and corrections clean.

**Needs Review (nothing with a tip discrepancy auto-posts):** `ask` basis + tip > 0; `tip < 0` (Z below system sale); Z entered with no card sale; and an optional `expected_tip_kurus` cross-check that does not equal `Z − card`. The owner re-confirms with an explicit per-entry `card_sale_basis` override (and/or corrected figures) to post.

**What changed:** `features/pos/settings.py` (settings + `CardSaleBasis`); `ConfirmPosDailySummaryRequest` gains `z_report_kurus`, `card_sale_basis`, `expected_tip_kurus`; `PosDailySummary.z_report_kurus` (+ read schema); `confirm_pos_daily_summary` posts the tip leg per basis; the intake service resolves Z+basis and routes to Needs Review. New `JournalEntrySource.POS_CARD_TIP` (cash-flow operating; correction void-and-reenter). Migration `046_pos_card_tips_z_report` adds the nullable `z_report_kurus` column (additive).

**Not in slice:** commission recognition cadence (`commission_recognition`: per-settlement vs month-end) and the month-end **total-clearance** commission sweep (`1400` residual → `5300`) — Slice B2. Decisions doc §9/§14 updated.

## 2026-06-23 — Tips are an expense, not a pass-through liability (Slice A; owner decision)

**Choice:** A tip is an **expense paid from cash**, and sales are recorded **gross**. This reverses two prior signed-off decisions: Phase 6 "Tips (pass-through, not revenue/expense)" (`v0.35.0`) and Phase 8.6 Item 4 "carve tips from POS revenue at confirm" (`v0.47.17`).

**What changed:** New expense account `5700 Tips Expense / Bahşiş Gideri` (EXPENSE/DEBIT). Removed the entire Tips Payable liability subsystem: `2260 Tips Payable` account, `tip_accruals`/`tip_payouts` tables, `features/tips/`, `core/tips/posting.py`, `JournalEntrySource.TIP_ACCRUAL`/`TIP_PAYOUT` (+ correction registry entries + `correct_tip_accrual/payout`), the `tip_accruals` control-account tie, the `tip_accruals`/`tip_payouts` RLS entries, and the cash-flow TIP_* source classifications. POS daily-summary confirm now posts **gross** revenue (removed `_accrue_pos_tips`/`_tip_split`/`tips_kurus` plumbing and the `pos_daily_summaries.tips_kurus` column). A tip is now recorded through the existing expenses pipeline against `5700` from a cash money account (`Dr 5700 / Cr cash`). Migration `045_tips_expense_not_liability` drops the tables/column and removes `2260`, guarded to abort if any tip rows or `2260` postings exist (pre-launch: none; if real data existed it would be reversed via the posting boundary, never hard-deleted).

**Phase 8.8 H2 guard:** `post_expense_entry` rejects account `5700` unless `money_account` is cash (`InvalidExpensePostingError` → 422 "tips expense must be paid from a cash account"). Receipt intake was already cash-only at upload; this closes the adversarial gap on generic `POST .../expenses` and any other caller of the posting boundary.

**Not in slice:** Z-report ↔ system ↔ bank total-clearance reconciliation (card tip vs hidden bank commission) and the expense-photo OCR — separate later slices (B and C). Decisions doc §9/§14 updated.

## 2026-06-23 — Flexible dates + soft period locks (Phase 8.5 Slice 4)

**Choice:** User-entered **calendar dates** for all transaction dates (`entry_date`, movement dates, void/reversal dates). No timezone setting; audit timestamps UTC via `utcnow()`. Default entry date when omitted: `datetime.now(timezone.utc).date()` (not local machine tz). Go-live floor from `entity_settings.go_live_date` — reject earlier dates at posting boundary (422).

**Soft locks:** `period_locks` table (`lock_kind` day|month, `period_start`/`period_end`, `closed_at`/`closed_by`, `reopened_at`/`reopened_by`, `dirty`). `period_lock_audit_events` for close, reopen, unlock_write. Active lock (`reopened_at IS NULL`) blocks post/void/correct for non-owners when any checked date falls in range. Owner may write with required `period_unlock_reason` (body field on mutation requests) — audited. Owner-only close/reopen via `require_owner_members`. `dirty` set when writes touch a period that was ever closed. Central guard `assert_entry_dates_allowed()` in `core/period_locks/guards.py` called from `prepare_journal_entry`, void, and `_correct_journal_entry_in_transaction` (checks original entry_date, void_date, corrected entry_date).

## 2026-06-23 — Correct/amend whitelist guard (Phase 8.5 Slice 2)

**Choice:** Generic ledger correct uses a **whitelist** (`GENERIC_CORRECTABLE_SOURCES = {MANUAL, BANK_FEE}`), not a blocklist of known subledger sources. Every other `JournalEntrySource` is either in `DEDICATED_CORRECTION_ROUTES` (type-specific flow) or `VOID_AND_REENTER_SOURCES` (409 with “void and re-enter”). `verify_correction_source_registry_complete()` + permanent test ensure new enum values fail CI until classified.

## 2026-06-23 — Subledger-safe correct/amend (Phase 8.5 Slice 2 follow-up)

**Choice:** Generic ledger correct is manual-only; subledger-backed journal sources must use type-specific correction flows in `app/core/ledger/correction.py`. Each flow atomically: GL correct via `_correct_journal_entry_in_transaction`, append reversing subledger row on reversal JE (opposite sign, immutable), append new subledger row on corrected JE, update mutable detail tables where applicable (`expense_entries`, `invoice_drafts`, `tip_accruals`/`tip_payouts`). Dedicated HTTP endpoints for supplier payment, customer payment, FX purchase; core helpers also cover credit sale, supplier invoice, expense entry, staff, partner, tips, FX conversion/spend.

**Not in slice:** Per-feature HTTP endpoints for every type (staff/partners/tips/invoices/expenses use core correction helpers; add routes when frontend needs them).

## 2026-06-23 — Pagination + search + filters (Phase 8.5 Slice 3)

**Choice:** Shared `app/core/listing/` module — limit/offset pagination (default 50, max 200), `PaginatedListOut` response shape (`items`, `total`, `limit`, `offset`). Free-text `q` uses Turkish-aware normalization (same rules as expense-item matching: I→ı, İ→i, casefold). Consistent filter param names: `q`, `from`, `to`, `min_amount`, `max_amount`, `status`, plus resource-specific `*_id` filters. All entity-scoped list endpoints updated; new `GET .../ledger/entries` for journal entry search. Payables/receivables summaries paginate row lists but compute aggregate totals over full filtered set.

**Not in slice:** Cursor-based pagination; normalized search columns in DB (SQL `turkish_fold` helper used instead).

## 2026-06-23 — Atomic correct/amend (Phase 8.5 Slice 2)

**Choice:** One backend operation `correct_journal_entry()` — void + reversal + corrected post in a single DB transaction. Never client-orchestrated void-then-create. Generic ledger endpoint `POST .../ledger/entries/{id}/correct` (not per-feature amend routes). Links via `amends_entry_id` / `amended_by_entry_id`; corrected preserves original `source`. Audit: VOID on original, POST on reversal and corrected, AMEND on corrected.

**Not in slice:** Per-feature amend endpoints; pagination; UI.

## 2026-06-23 — Idempotency on writes (Phase 8.5 Slice 1)

**Choice:** Central `IdempotencyMiddleware` (not per-route) intercepts POST/PATCH/PUT/DELETE. Client sends `Idempotency-Key` UUID per distinct submission; scope = `user_id` + method + path + key (anonymous sentinel when auth off). Repeated key returns stored JSON + status; different keys with same payload both post. `idempotency_enforcement` env setting (default true; false in pytest). Table `idempotency_records` (not entity-scoped, no RLS). Alembic `039`.

**Not in slice:** Near-duplicate detection / soft "possible duplicate?" prompt (separate UX concern).

## 2026-06-23 — Phase 8 owner sign-off

**Status:** Phase 8 (roles, backups, security hardening, launch readiness, auth hardening, DB provisioning) owner signed off. Backend v1 complete at tag `v0.47.2-phase8-db-provisioning` (423 pytest). Next work: Phase 8.5 pre-frontend API hardening before Phase 9 frontend.

## 2026-06-22 — Auth hardening + pre-sign-off (Phase 8 Slice 5)

**Production guards:** Boot refuses `CLERK_TEST_MODE=true` when `APP_ENV=production`. `CLERK_AUDIENCE` required alongside `CLERK_JWKS_URL` and `CLERK_ISSUER` when auth enforcement is on and not in test mode.

**Clerk claims:** `_extract_email` requires explicit `email_verified=true` in JWT — no fallback to unverified `email` or `primary_email_address`.

**Permanent guard tests:** Route-guard inventory (every entity-scoped FastAPI route must depend on a auth guard); single posting boundary (no `JournalEntry` construction outside `core/ledger`); RLS registry parity + live policy check against PostgreSQL.

**RLS fix:** Completed `RLS_TABLES` for tables already migrated; `_apply_entity_guc` + delivery platform lookup re-sync GUC after connection churn post-commit.

**Not in slice:** Alembic revision id length fix (`006_ledger_immutability_bootstrap` > 32 chars blocks empty-DB `upgrade head` — pre-existing).

## 2026-06-22 — Clerk launch readiness (Phase 8 Slice 4)

**Choice:** Replace `X-User-Id` transport with verified Clerk session JWT (`Authorization: Bearer`). Verification via Clerk JWKS — signature, issuer, audience, expiry. Keys from env only (`CLERK_JWKS_URL`, `CLERK_ISSUER`, `CLERK_AUDIENCE`); no hardcoded secrets.

**Provisioning:** Invite-only. Local `users` row pre-created by admin; first Clerk sign-in links `external_auth_id` when verified email matches. No self-service signup. Unverified email, unknown email, identity conflict, or inactive user → denied with audit event.

**Enforcement:** `AUTH_ENFORCEMENT` default `true`. Production boot (`APP_ENV=production`) refuses start if enforcement off or Clerk keys missing when not in test mode. Existing permission guards unchanged — only identity resolution changed.

**Test mode:** `CLERK_TEST_MODE=true` accepts deterministic tokens `test:{clerk_id}:{email}` for pytest (no live Clerk).

**Schema:** `users.external_auth_id` (unique, nullable); `auth_audit_events` for login success/denial/token invalid. Alembic `037`.

**Not in slice:** Clerk frontend UI, webhooks, orgs, OAuth provider config (Clerk Dashboard), password flows.

## 2026-06-22 — Entity roles & permissions (Phase 8 Slice 1)

**Choice:** Per-entity roles via `entity_memberships` (FK to global `users` table). Four roles: `owner`, `partner`, `cashier`, `partner_view_only` — matching Decisions §18. Extensible `Permission` string enum with `ROLE_PERMISSIONS` map. v1 identity transport: `X-User-Id` header (UUID) — no JWT/login/password/OAuth this slice.

**Enforcement:** `settings.auth_enforcement` / env `AUTH_ENFORCEMENT=true` for production. Default `false` so existing tests and dev workflows pass without headers. When on: guarded routes require header + membership + permission.

**Permissions (v1):**
- `financial_reports:read` — P&L, balance sheet, cash flow, period comparison (+ exports). Owner, partner, partner_view_only. **Not** cashier (DESIGN_SYSTEM).
- `operations:write` — posting/mutations. Owner, partner, cashier.
- `reports:read` — dashboard, KDV input, delivery sales. All roles including cashier.
- `admin:manage_members` — list/add/patch memberships. Owner, partner.

**Guarded routes (this slice):** financial report GET + export endpoints only. Dashboard, KDV, delivery sales unguarded. Pattern: `financial_reports_guard` dependency — no-op when enforcement off.

**API:** `POST/GET /users`; `GET/POST/PATCH /entities/{id}/members`. User bootstrap open (no password).

**Not in slice:** JWT/Clerk/OAuth, month locking for cashier write restrictions (deferred), enforcing permissions on every endpoint, UI, RLS on `users`.

## 2026-06-22 — Daily expenses + spelling tolerance (Phase 6 Slice 6)

**Choice:** Daily handwritten and manual typed expenses are first-class `expense_entries` — post Dr expense / Cr bank or cash via `post_expense_entry()` (`JournalEntrySource.EXPENSE_ENTRY`). `has_source_document=false` when no receipt attached. Item descriptions use canonical `expense_items` + `expense_item_aliases` with Turkish-aware normalization (`normalize_expense_item_text`) and fuzzy match (≥0.85 → `needs_review` until owner confirms; confirm remembers alias). Only `posted` expenses hit GL.

**Bank classify `rent_utility`:** Outflow only; owner supplies `expense_account_id` (e.g. `5000` rent, `5200` utility); same posting path; links `expense_entry_id` on statement line.

**API:** `POST/GET /entities/{id}/expense-items`, `POST .../expense-items/merge`, `POST/GET /entities/{id}/expenses`, `POST .../expenses/{id}/confirm-item`.

**Not in slice:** OCR for handwritten papers, document upload/archive, credit card statement extraction, UI, locked-period enforcement, expense sub-categories.

## 2026-06-22 — Bank feed adapter (read-only, deferred)

**Choice (future):** Add a **read-only** bank feed as an additional **input adapter** — account-information / transaction pull only. **Never payment-initiation**; the app never moves money. Output is the same normalized transaction row shape as the manual statement importer (`bank_statement_lines`), feeding the **same** downstream pipeline: classify → clearing → near-match → anti-double-count. No parallel classification or posting logic.

**Manual upload permanent:** CSV/statement file upload remains the universal fallback (every bank; feed connection down or unavailable). Feed and manual upload **coexist** — the feed does not replace upload.

**Design notes for implementation (when scoped):**
- Dedup on the bank's unique transaction ID (daily pulls overlap).
- Handle consent / token expiry and reconnect flows.
- Reconcile feed transactions to statement balance.
- Confirm connection route (direct bank API vs aggregator) before build.

**Scheduling:** Later enhancement — after core build (Phase 6–8 + sign-off). Not in current slice order.

## 2026-06-22 — Tips pass-through (Phase 6 Slice 5)

**Choice:** Tips are **pass-through**, not revenue or expense. Chart account **`2260` Tips Payable** (liability, credit normal balance) holds the "tips owed to staff" pot. **Card tip accrual** Dr `1400` Card Sales Clearing / Cr `2260`. **Cash tip accrual** (tips held in drawer) Dr cash GL / Cr `2260`. **Tip payout to staff** Dr `2260` / Cr cash GL — reject if pot balance insufficient. P&L unaffected.

**Why:** Decisions §9 — card tips are not sales; cash paid to staff is not expense; net zero on P&L.

**API:** `POST/GET /entities/{id}/tips/accruals`, `POST/GET /entities/{id}/tips/payouts`, `GET /entities/{id}/tips/balance`.

**Not in slice:** POS auto-extraction of tips, UI, locked-period enforcement.

## 2026-06-22 — User-managed delivery platforms (Phase 6 refactor)

**Choice:** Replace fixed `DeliveryPlatform` enum and hardcoded clearing codes (`1410`/`1420`/`1430`) with per-entity **`delivery_platforms`** table. Owner can **add**, **rename**, and **deactivate** platforms when `delivery_enabled`. Each platform row owns a **clearing GL sub-account** auto-created under parent **`1450` Delivery Platform Clearing** (same sub-account pattern as bank/card `money_accounts`). `delivery_reports`, `delivery_settlements`, bank classify `delivery_settlement`, commission posting, and clearing reconciliation all reference **`delivery_platform_id`** — iterate the entity's platform list, not a global enum. Remove comma-separated `delivery_platforms` entity setting (module toggle `delivery_enabled` only). Migration `032` seeds platforms from legacy clearing accounts and reparents them under `1450`.

**Why:** Decisions §9 — per-restaurant platform list varies; fixed enum does not scale; clearing sub-accounts mirror existing money-account pattern.

**API:** `POST/GET/PATCH /entities/{id}/delivery/platforms`; reports/settlements bodies use `delivery_platform_id`; statement classify uses `delivery_platform_id`.

**Prerequisite for:** commission e-Fatura clearing credit and Phase 7 delivery sales report (both keyed by managed platforms).

## 2026-06-22 — Delivery commission e-Faturas (Phase 6 Slice 3)

**Choice:** Reuse existing e-Fatura intake (`invoice_drafts` / UBL-TR pipeline) for platform commission invoices. Platform remains a **vendor for document intake** (VKN, e-Fatura metadata) but commission posting does **not** use the supplier payables path. On post: **Dr** commission expense `5500` (net) + **Dr** Input VAT `1500` (per `vat_breakdown`) / **Cr** linked platform's clearing GL sub-account for commission **gross** (net + VAT). **Do not** credit `2000` Accounts Payable — commission was already deducted from the bank payout (`post_delivery_settlement()` credits clearing by net).

**Clearing lifecycle (per platform):** (1) report → Dr clearing / Cr `4000` gross; (2) settlement → Dr bank / Cr clearing net; (3) commission e-Fatura → Dr commission expense + Dr input VAT / Cr clearing commission gross → clearing balance **zero**.

**Why:** Decisions §9 — commission netted from payout, not a separate liability; AP would misstate payables and leave clearing unreconciled.

**Draft typing:** `invoice_kind` (`supplier` | `delivery_commission`), nullable `delivery_report_id` FK on `invoice_drafts` (Alembic `031`). Linking sets kind; gross mismatch vs report `commission_kurus` → `needs_review`; post blocked until aligned.

**Posting:** `post_delivery_commission_draft()` in `core/delivery/commission_posting.py` — separate from `post_confirmed_draft()` (supplier AP path unchanged). On success, `commission_journal_entry_id` stored on `delivery_report`; partial unique index prevents double commission post per report.

**Reconciliation:** `GET .../delivery/clearing-reconciliation` extended with `total_commission_posted_kurus`, `commission_posted_count`; `in_transit_kurus` = gross − settled net − commission posted; clearing balance → 0 when all three legs done.

**API:** `POST .../invoices/drafts/{id}/link-delivery-report`; existing `POST .../post` routes by `invoice_kind`; `JournalEntrySource.DELIVERY_COMMISSION`.

**Migration:** Alembic `031` — draft columns, report `commission_journal_entry_id`, `5500` expense account seed.

**Not in slice:** New OCR beyond existing e-Fatura adapters, tips, general expenses, UI, locked-period enforcement.

## 2026-06-22 — Delivery sales report (Phase 7)

**Choice:** Read-only **Delivery sales report** per entity — gross delivery sales **per configured platform** (from `delivery_platforms`) plus a **combined total**, filterable by **`from` / `to` date range** (inclusive on `delivery_reports.report_date`). **Source of truth:** `delivery_reports` with `status = posted` only — aggregate `gross_kurus` grouped by `delivery_platform_id`. Exclude draft, `needs_review`, and rejected rows. All entity platforms listed (active + inactive); zero gross when no posted reports in range.

**API:** `GET /entities/{id}/reports/delivery-sales?from=YYYY-MM-DD&to=YYYY-MM-DD` — one row per entity platform plus `total_gross_kurus`; `delivery_enabled` guard; `from <= to` validation.

**Why:** Decisions §9 / §10 — period view of delivery channel sales for dashboard and owner review; portal report intake remains authoritative.

**Not in slice:** Commission/net breakdown, Excel export (separate Phase 7 slice), UI, multi-entity roll-up.

## 2026-06-22 — Entity dashboard (Phase 7)

**Choice:** Read-only **entity dashboard** per Decisions §23 — single endpoint aggregating period metrics (`from`/`to` inclusive on `journal_entries.entry_date`, posted only) and point-in-time balances. **Sales:** GL credits to `4000` split by `journal_entries.source` (`cash_movement`, `card_sales`, `delivery_report`, other e.g. `customer_credit_sale`). **Expenses:** sum debits on `account_type = expense` (optional `expense_account_id`). **Net result:** total sales − total expenses (snapshot, not full P&L). **Payables:** reuse `list_payables()` total; preview top 5 suppliers by balance (`supplier_id` filter limits preview row only). **Receivables:** reuse `list_receivables()` total. **Delivery:** platform gross via `get_delivery_sales_report()`; in-transit via `get_delivery_clearing_reconciliation()` clearing balances — only when `delivery_enabled`. **Money:** sum active TRY bank+cash GL balances (`money_account_id` → single account); FX wallets with `native_quantity` + `try_cost_kurus` listed separately (not converted into TRY total). **Needs review:** current queue counts (invoice drafts, duplicates, bank lines, POS summaries, delivery reports, expenses). **Deferred:** tax-department payments (`null`).

**API:** `GET /entities/{id}/dashboard?from=&to=` — tag `dashboard`; `from <= to` → 422; missing entity → 404.

**Why:** Owner-facing restaurant snapshot before P&L/Balance Sheet slices; reuses existing services, no duplicate ledger logic.

**Not in slice:** Period comparison, Excel export, P&L/Balance Sheet, UI, tax-department payments.

## 2026-06-22 — P&L & Balance Sheet (Phase 7)

**Choice:** Read-only **Profit & Loss** and **Balance Sheet** per entity from posted GL. Shared `core/ledger/balances.py` — `period_activity_kurus()` (inclusive date range, natural sign by normal balance) and `balance_as_of_kurus()` (cumulative through `as_of`). **Posted only** (`status=posted`); **void reversals excluded** (`reverses_entry_id IS NULL`) so voided originals net to zero without double-counting the reversal entry.

**P&L:** All active `revenue` + `expense` accounts (including zero activity), ordered by `code`. Totals: `total_revenue_kurus`, `total_expenses_kurus`, `net_income_kurus`.

**Balance Sheet:** Active `asset`, `liability`, `equity` accounts in sections with subtotals. **Unclosed net income:** no year-end closing entries yet — cumulative revenue minus expense through `as_of` exposed as `unclosed_net_income_kurus` in the equity section (synthetic line, not a GL account). `total_liabilities_and_equity_kurus` = liabilities + equity GL + unclosed net income; `accounting_equation_balanced` when assets equal that sum.

**API:** `GET /entities/{id}/reports/profit-and-loss?from=&to=`; `GET /entities/{id}/reports/balance-sheet?as_of=`; tag `reports`; `from > to` → 422; missing entity → 404.

**Why:** Decisions §10 — ledger rolls up into financial statements; owner needs formal P&L and balance sheet before cash flow and export slices.

**Not in slice:** Cash flow statement, trial balance report, period comparison, Excel export, UI, year-end closing entries.

## 2026-06-22 — Cash flow statement (Phase 7)

**Choice:** Read-only **cash flow statement** per entity from posted GL on **TRY liquid** accounts only — active `money_accounts` with `account_kind` in `bank`, `cash` (not `foreign_currency`, not `credit_card`). Shared `core/ledger/balances.py` extended with `net_cash_effect_on_accounts()`; opening/closing via `balance_as_of_kurus()` (opening = day before `from`, closing = `to` inclusive). **Posted only**; **void reversals excluded** (`reverses_entry_id IS NULL`).

**Direct method:** Period journals touching TRY liquid GL lines categorized by `journal_entries.source` — debit to cash/bank = inflow, credit = outflow. **Transfers** between own accounts excluded (net zero at entity level). **Opening balance** journals excluded from operating/financing lines; in-range `opening_balance` net cash is **folded into `opening_cash_kurus`** so the first period that includes go-live still reconciles (`reconciled_to_categories`). Operating sources: POS/delivery settlements, supplier payments, expenses, fees, staff/partner/tip cash movements, FX spend on TRY accounts, manual, etc. Financing: `credit_card_payment`. Investing: empty (v1). `by_source` detail rows; `reconciled_to_categories` flag (category nets vs `net_change_kurus`).

**API:** `GET /entities/{id}/reports/cash-flow?from=&to=`; tag `reports`; `from > to` → 422; missing entity → 404. Tag `v0.40.0-phase7-cash-flow`.

**Why:** Decisions §10 / §15 — formal cash flow from ledger; TRY liquid scope matches owner cash position; inter-account transfers are not operating cash flow.

**Not in slice:** FX wallet native-currency flows, indirect method, period comparison, Excel export, UI, owner draw (no source yet).

## 2026-06-22 — Per-rate KDV input report (Phase 7)

**Choice:** Read-only **purchase / input KDV report** per entity — per-rate breakdown (1%/10%/20%/0% etc.) from posted e-Fatura `vat_breakdown` on `invoice_drafts`. **Source of truth:** `invoice_drafts` with `status = posted` only; includes `invoice_kind` `supplier` and `delivery_commission` (both post input VAT to `1500`). Excludes draft, needs_review, confirmed (unposted), duplicate, rejected. Inclusive `from`/`to` on `invoice_date`. Aggregate each draft's `vat_breakdown` entries by `rate_percent` (float key, sorted ascending); per rate: `base_kurus`, `vat_kurus`, `invoice_count` (distinct posted drafts at that rate — one invoice with two lines at same rate counts once).

**API:** `GET /entities/{id}/reports/kdv-input?from=YYYY-MM-DD&to=YYYY-MM-DD`; tag `reports`; `from > to` → 422; missing entity → 404. Tag `v0.41.0-phase7-kdv-input-report`.

**Why:** Decisions §11 — capture and show per-rate purchase KDV; input VAT only (not tax-authority payments); ready for future VAT return module.

**Not in slice:** Output VAT, VAT declaration, Excel export, UI, period comparison.

## 2026-06-22 — Excel export (Phase 7)

**Choice:** `openpyxl>=3.1` for Phase 7 read-report exports only (v1). Shared helpers in `core/excel/workbook.py`; per-report builders in `features/reports/excel_export.py`. Integer kuruş in cells (no Turkish locale formatting v1). One sheet per export; row 1 metadata + bold headers; `StreamingResponse` with `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`.

**API:** `GET .../reports/profit-and-loss/export`, `balance-sheet/export`, `cash-flow/export`, `kdv-input/export`, `delivery-sales/export`, `period-comparison/export` — same params and error handling as JSON routes.

**Not in slice:** PDF, supplier ledger/payables/bank/backup exports, UI download buttons, multi-entity roll-up, Turkish number formatting in cells.

## 2026-06-23 — PDF export for financial statements (Phase 8.5)

**Choice:** `reportlab>=4.0` for **P&L, balance sheet, cash flow** PDF exports only (shareable statements; other reports stay Excel-only v1). Builders in `features/reports/pdf_export.py`; reuses `format_try()` from `core/money.py` for Turkish display (`1.234,56 ₺`) at the render edge only. Entity name fetched from `entities` table for header; period + UTC generated timestamp. Same report service calls as JSON/Excel — no recomputation. `StreamingResponse` with `application/pdf` and `Content-Disposition` attachment filenames via shared `export_filename(..., extension=".pdf")`.

**API:** `GET .../reports/profit-and-loss/export/pdf`, `balance-sheet/export/pdf`, `cash-flow/export/pdf` — same query params and error handling as JSON/Excel routes. `financial_reports_guard` (cashier blocked).

**Not in slice:** PDF for KDV/delivery/period comparison; frontend download UI (Phase 9 Slice 8); multi-entity roll-up.

## 2026-06-22 — Period comparison report (Phase 7)

**Choice:** Read-only **period-over-period comparison** per entity — current window vs prior window. **Metrics** reuse existing report services (no duplicated GL logic): dashboard sales/expenses/net result, P&L `net_income_kurus`, KDV input `total_vat_kurus`, cash flow `net_change_kurus`, delivery gross (only when `delivery_enabled`). **Prior window default:** same inclusive length immediately before current (`period_days = (to - from).days + 1`; `prior_to = from - 1`; `prior_from = prior_to - (period_days - 1)`). Optional `prior_from`/`prior_to` override (both required if either set). Per metric: `current_kurus`, `prior_kurus`, `change_kurus`, `change_percent` (null when prior zero).

**Omitted v1:** Payables, receivables, TRY cash position — live subledger balances at query time, not true period-over-period without as-of ledger history.

**API:** `GET /entities/{id}/reports/period-comparison?from=YYYY-MM-DD&to=YYYY-MM-DD`; optional `prior_from`/`prior_to`; `from > to` or partial prior params or `prior_from > prior_to` → 422; missing entity → 404. Tag `v0.42.0-phase7-period-comparison`.

**Why:** Decisions §24 — reports wrapper includes period comparison (this vs last).

**Not in slice:** Excel export, UI, payables/receivables/TRY position comparison, budgets vs actuals.

## 2026-06-22 — Delivery platform reports (Phase 6 Slice 2)

**Choice:** `delivery_reports` table (entity RLS, unique `entity_id` + `file_fingerprint`, partial unique on posted `entity_id` + `delivery_platform_id` + `report_date`). Manual JSON intake stores gross/commission/net kuruş; math check `gross - commission = net` — mismatch → `needs_review` (post blocked until corrected). `post_delivery_report()` posts **Dr** platform clearing GL / **Cr** `4000` Sales Revenue for **gross only** — commission stored on report row for reconciliation but **not** posted yet (deferred to commission e-Fatura slice). Platforms are **user-managed** (`delivery_platforms` + sub-accounts under `1450`); legacy fixed codes migrated in `032`. `delivery_settlements` + `post_delivery_settlement()` **Dr** bank / **Cr** platform clearing for net payout. Entity setting `delivery_enabled` guards intake. Bank statement classify `delivery_settlement` (inflow only, `delivery_platform_id` required).

**Why:** Decisions §9 — per-platform portal reports are authoritative; clearing pattern mirrors card sales; irregular payout schedules reconciled via clearing balance.

**Migration:** Alembic `030` — `delivery_reports`, `delivery_settlements`, `delivery_settlement_id` on `bank_statement_lines`, clearing account seed.

**API:** `POST/GET .../delivery/reports`; `GET .../{id}`; `POST .../{id}/post`; `POST .../{id}/reject`; `POST/GET .../delivery/settlements`; `GET .../delivery/clearing-reconciliation`.

**Not in slice:** Commission e-Fatura posting, OCR/portal import, UI, locked-period enforcement.

## 2026-06-22 — POS daily-summary photo intake (Phase 6 Slice 1)

**Choice:** `pos_daily_summaries` table (entity RLS, unique `entity_id` + `file_fingerprint`). OCR v1 in `adapters/ocr_ai/pos_summary.py` — fixture registry (SHA256) + UTF-8 text heuristics for Turkish POS Z-report labels (Nakit/Kart/Toplam). Upload creates `draft` when cash + card = total, else `needs_review` with reason. Confirm (draft or needs_review with corrected `cash_kurus`/`card_kurus`) calls `confirm_pos_daily_summary()` — single transaction: card portion → `post_card_sales_batch()` pattern (Dr `1400` / Cr `4000`); cash portion → `post_cash_movement()` IN (Dr cash GL / Cr `4000`). **Never** posts POS aggregate total as one GL line. Links `card_sales_batch_id` and `cash_movement_id` on summary row. Reject → `rejected`. Duplicate upload → 409.

**Why:** Decisions §9 — primary sales source from POS daily summary photo; math check before posting; cash and card posted separately to revenue.

**Migration:** Alembic `028` — `pos_daily_summaries` with entity RLS.

**API:** `POST/GET .../pos/daily-summaries`; `GET .../{id}`; `POST .../{id}/confirm`; `POST .../{id}/reject`.

**Not in slice:** Real vision OCR/ML, delivery platforms, tips, manual sales entry, UI, locked-period enforcement.

## 2026-06-21 — Card sales → bank deposit reconciliation (Phase 4)

**Choice:** Manual `card_sales_batches` intake posts **Dr** `1400` Card Sales Clearing / **Cr** `4000` Sales Revenue (`JournalEntrySource.CARD_SALES`). Extend `post_pos_settlement()` with optional `commission_kurus` and `card_sales_batch_id`. Net-only (commission 0/null, no inference): unchanged 2-line journal (backward compat). With commission: single 3-line entry — **Dr** bank (net), **Dr** `5300` Bank Charges (commission), **Cr** `1400` (gross = net + commission). Inferred commission when batch linked and `commission_kurus` omitted: `commission = batch.gross - net`, `commission_inferred=True`; reject if gross < net. Reconciliation read API: clearing GL balance, total sales, total settled gross, in-transit (sales − settled gross), batch/settlement counts.

**Why:** Decisions §13 — card sales debit clearing, settlements credit clearing, commission as shortfall; reconcile clearing balance against sales vs deposits.

**Migration:** Alembic `021` — `card_sales_batches` table with entity RLS; `card_sales_batch_id`, `commission_inferred` on `pos_settlements`.

**API:** `POST/GET .../pos/card-sales`; extended `POST .../pos/settlements` body; `GET .../pos/clearing-reconciliation`.

**Not in slice:** POS photo OCR (Phase 6), near-match for settlements, `bank_fee` GL classify, UI.

## 2026-06-22 — FX spend / conversion (Phase 5 Slice 2b)

**Choice:** Average-cost spend from FX wallets via `compute_spend_at_average_cost()` (`try_cost = spend_native × total_try_cost // total_native`; full balance when spending all). **FX → TRY conversion:** `post_fx_conversion()` — Dr bank/cash (owner-entered `try_received_kurus`) / Cr FX GL (average cost) / Cr `4200` FX Gain or Dr `5600` FX Loss for realized difference; `fx_ledger` `SPEND` row (negative quantity + cost). **Direct FX expense:** `post_fx_expense_spend()` — Dr expense / Cr FX GL at average cost; no gain/loss line. Chart: split `4200` FX Gain (revenue) and `5600` FX Loss (expense); removed combined `5500`.

**Why:** Decisions §15 — spending/conversion at average book cost; realized gain/loss only when converting to TRY (owner enters TRY received); holdings never revalued (deferred).

**API:** `POST .../fx/conversions`; `POST .../fx/expense-spends`.

**Control accounts:** unchanged — `SUM(try_cost_kurus)` and `SUM(native_quantity)` still tie GL and wallet after spend.

**Not in slice:** FX holding revaluation, live rates, UI.

## 2026-06-21 — Forex purchase (Phase 5 Slice 2)

**Choice:** `MoneyAccountKind.FOREIGN_CURRENCY` with nullable `currency` column (`USD`/`EUR`/`GBP`) on `money_accounts`. FX wallets are GL sub-accounts under chart buckets `1010`/`1020`/`1030`; GL holds **TRY book cost in kuruş** (DEBIT normal balance). Native quantity tracked separately in append-only `fx_ledger_entries` subledger (`native_quantity` in foreign minor units, `try_cost_kurus` per movement). `post_fx_purchase()` atomically posts **Dr Cash&lt;CUR&gt; GL / Cr TRY cash GL** plus one subledger row. Tree API adds `foreign_currency` branch (`usd`/`eur`/`gbp`) with `native_quantity` on leaves — never live-converted.

**Why:** Decisions §15 — track FX by quantity in native currency; owner-entered TRY cost only; no online rates; average-cost foundation via per-purchase `try_cost_kurus`.

**Migration:** Alembic `024` — extend `money_account_kind`, `currency` column, `fx_ledger_entries` with entity RLS + immutability triggers.

**API:** `POST .../fx/purchases`; `GET .../fx/accounts/{id}/ledger`; `GET .../fx/accounts/{id}/balance`; FX wallet creation via existing `POST .../banking/accounts` with `account_kind=foreign_currency` + `currency`.

**Control accounts:** `SUM(fx_ledger_entries.try_cost_kurus)` = FX GL balance; `SUM(native_quantity)` = wallet quantity balance.

**Not in slice:** ~~Spending FX, conversion back to TRY~~ (see FX spend slice), salaries, ~~gain/loss~~ (realized on conversion only), live rates, FX opening balances (quantity model), UI.

## 2026-06-25 — FX purchase: cash drawer only (owner revision, Phase 10.8)

**Choice:** `post_fx_purchase()` TRY source is **TRY cash drawer** (`MoneyAccountKind.CASH`) **only**. **Bank** (`BANK`) is **not** accepted — bank movements enter via statement import/classify, not manual FX buy. Keep `_validate_try_cash_money_account` and `test_rejects_bank_as_try_payment_account`. UI (`fx-purchase-form`) must list **cash accounts only** (remove erroneous bank merge). Phase 10.8 adds `CashMovement` OUT on purchase (same `journal_entry_id`) so `/banking/cash` shows FX buys.

**Why:** Owner 2026-06-24 — bank is statement-driven; owner buys FX with physical TRY from the drawer. Aligns with Decisions §15.

**Unchanged:** `post_fx_conversion()` may credit bank **or** cash when FX→TRY (owner-entered TRY received) — separate money movement from FX purchase.

## 2026-06-27 — Tips are a normal expense (de-special-case 5700; owner revision)

**Reaffirms the 2026-06-23 intent ("a tip is recorded on the expense list like any other line") — the build had drifted.** The implementation special-cased tips: a dedicated "Cash tip" New-menu shortcut, auto-forcing account `5700`, and a manual-expense category picker limited to `5200`/`5700`. Owner: treat a tip as **any other expense**.

**Choice:** No "Cash tip" menu shortcut; **account `5700 Tips Expense` removed entirely** from the default chart and the picker (owner: "I don't need that"). The manual-expense category picker offers the **full expense chart**; a cash tip is recorded under a general expense category (e.g. `5200`), owner's choice — no dedicated tips account. Ledger mechanics unchanged — `Dr <chosen expense> / Cr cash`, no liability, gross sales unchanged. (Trade-off accepted: no separate "total tips paid" line on the P&L — tips sit within general expenses.) Also removes the standalone "Card sales batch" New-menu item (Daily sales already records the card portion into clearing `1400`; standalone = redundant + double-count confusion). Build: Phase 12 Slice 0a. **Pre-launch — no real data posted to `5700`, safe to drop.**

---

## 2026-06-26 — Cash drawer: optional session + owner-reopen (Phase 11.13 revision)

**Revises the 2026-06-21 Cash drawer decision below.** Owner workflow review found the session model forces a drawer open on every cash entry and **hard-blocks once a day is closed** ("drawer day is closed — no further movements allowed", `daily_summary_posting.py:91`, `cash/posting.py:196`) with **no reopen** — inconsistent with period locks, and a one-way trap.

**Choice:** (1) Daily sales + cash movements **post without requiring or force-opening a session**; the session becomes an **optional** EOD count/reconcile. (2) A **closed** drawer day is **owner-reopenable**, reusing the **exact period-lock owner-unlock + audit pattern** (`period_unlock_reason`, owner-only, audited) — the dead-end "no further movements" block is removed. One lock model across the app.

**Why:** Decisions §14 (revised) — entry must never be gated by a session; closing is optional and reversible by the owner. Money-critical (posting + lock model) → reviewer + owner sign-off.

---

## 2026-06-21 — Cash drawer (Phase 5) *(session-gating + hard day-lock SUPERSEDED 2026-06-26, see above)*

**Choice:** `post_cash_movement()` in `core/cash/posting.py` — cash in Dr cash GL / Cr offset; cash out Dr offset / Cr cash GL. Auto-open `cash_drawer_sessions` per `(money_account_id, session_date)` on first movement. `close_cash_drawer_session()` reads GL expected balance, compares owner counted balance; over posts Dr cash / Cr `5400`, short posts Dr `5400` / Cr cash; zero variance = no close journal; session status → closed (~~no further movements~~ → **owner-reopenable as of 2026-06-26**). Reuses Phase 3 `MoneyAccountKind.CASH` under bucket `1000`.

**Why:** Decisions §14 — running drawer balance via GL; EOD Z-close with over/short and day lock.

**Migration:** Alembic `023` — `cash_drawer_sessions`, `cash_movements` with entity RLS.

**API:** `POST/GET .../cash/movements`; `GET .../cash/drawer-sessions`, `GET .../{id}`, `POST .../{id}/close`.

**Not in slice:** Typed movement categories (cash sales, tips, owner draw), FX purchases, UI, locked-period enforcement beyond session close.

## 2026-06-21 — Credit card clearing accounts (Phase 4)

**Choice:** Extend `MoneyAccountKind` with `CREDIT_CARD`; reuse `create_money_account()` to create GL sub-accounts `2101+` under parent `2100` Credit Card Payable (LIABILITY, CREDIT normal balance, `accepts_opening_balance=True`). Tree API returns `credit_cards` branch alongside `banks`/`cash`. Opening balance lines via `money_account_id` post on the GL account's `normal_balance` side (not hardcoded DEBIT) — CREDIT for credit cards, DEBIT for bank/cash. Reject aggregate `2100` when active credit card money accounts exist (mirrors `1100`/`1000` rule). Metadata: `bank_name` as card issuer label, `last_four` for card digits.

**Why:** Decisions §12 — credit cards branch in banking hub; OPENING_BALANCES.md — per-card sub-accounts under liability bucket `2100`.

**Migration:** Alembic `020` — extend `money_account_kind` enum length for `credit_card` value.

**Not in slice:** Credit card statement import, `credit_card_payment` GL classify, card sales reconciliation, UI.

## 2026-06-21 — POS settlement intake (Phase 4)

**Choice:** `post_pos_settlement()` in `core/pos/posting.py` — single atomic transaction through `prepare_journal_entry(..., source=pos_settlement)`. GL pattern: **Dr** bank GL sub-account (from `money_account_id`), **Cr** `1400` Card Sales Clearing. Persist `pos_settlements` row with unique `journal_entry_id`. Statement classify `pos_settlement` requires inflow (`amount_kurus > 0`) and `actor_id`; posts GL (not classify-only). Optional `commission_kurus` column on model for future slice 3 — net deposit only in this slice.

**Why:** Decisions §13 — card settlement deposits reduce the clearing receivable; money movement must flow through the single posting boundary to financial statements.

**Migration:** Alembic `019` — `pos_settlements` table with entity RLS; `pos_settlement_id` FK on `bank_statement_lines`; `StatementLineClassification.POS_SETTLEMENT`.

**API:** `POST/GET /entities/{id}/pos/settlements`, `GET .../pos/settlements/{id}`.

**Not in slice:** Credit card clearing sub-accounts, commission GL split, card sales debit to 1400 (Phase 6), near-match linking for settlements.

## 2026-06-21 — Near-match payment/transfer detection (Banking)

**Choice:** Supplier payment and transfer auto-match uses **exact date first**, then **near-match** within ±`NEAR_MATCH_DATE_WINDOW_DAYS` (3). Exact match → auto-link (no GL post). Near-match (same supplier/amount or same transfer accounts/amount, date within window but not exact) → `status=needs_review` with `review_reason` and optional `candidate_*_id` — **never posts a second entry**. Owner confirms link via classify PATCH with `confirm_supplier_ledger_entry_id` or `confirm_account_transfer_id`. Multiple near candidates → needs_review without single candidate; owner picks on confirm.

**Why:** Decisions §12 / CURSOR_RULES §1 — manually recorded payments often clear on a different bank date; exact-only matching caused double-count risk.

**Migration:** Alembic `018` — `review_reason`, candidate FK columns on `bank_statement_lines`; `StatementLineStatus.NEEDS_REVIEW`.

## 2026-06-21 — Statement classification GL posting policy (Banking)

**Choice:** Every statement-line classification that represents a real GL event must **post or link** to an existing journal in its delivery slice — none left classify-only indefinitely. See ROADMAP Phase 3 “Banking classification GL posting policy” table. Current temporary exceptions: `bank_fee` and `unknown` (classify-only until their GL slices land). `supplier_payment`, `transfer`, and opening balances already dual-write or link.

**Why:** Decisions §1 / §12 — classify-only lines do not flow to financial statements; owner requirement as banking continues.

**Next GL slices:** `bank_fee` → Phase 4; delivery settlement → Phase 4/6; rent/utility → Phase 6; tax/owner/customer/partner → Phase 5+. `pos_settlement` done in Phase 4 Slice 1.

## 2026-06-21 — Opening balances posting (Phase 3)

**Choice:** `post_opening_balances()` in `core/onboarding/posting.py` — single atomic transaction through `prepare_journal_entry(..., source=opening_balance)` with `3900` Opening Balance Equity offset. Validate + post accept three mutually exclusive line targets: aggregate `account_code` (whitelist), `money_account_id` (debit bank/cash GL sub-account), `supplier_id` (credit aggregated AP `2000` control line). Per-supplier subledger rows via `persist_supplier_opening_entry()` with `journal_entry_id`. Reject aggregate `1100`/`1000` when active bank/cash money accounts exist; reject aggregate `2000` combined with supplier lines. One-time guard: 409 if entity already has posted `opening_balance` journal. Store `go_live_date` in `entity_settings` on post. No new tables — guard checks existing `journal_entries` by source.

**Why:** Decisions §19 — day-one go-live figures per entity through the single posting boundary; GL AP control account must match supplier subledger sum.

**API:** Extended `POST .../opening-balances/validate`; new `POST .../opening-balances/post`.

**Not in slice:** FX quantity model, partner `2150`, per-card sub-accounts, void opening balance, trial balance UI.

**Migration:** None (Alembic `018` not needed).

## 2026-06-21 — Own-account transfer linking (Phase 3)

**Choice:** `post_account_transfer()` in `core/banking/posting.py` — single GL journal (`JournalEntrySource.TRANSFER`): debit destination money account GL sub-account, credit source (asset-to-asset only; no revenue/expense). `account_transfers` table links from/to money accounts, journal entry, and optional statement line FKs (`from_statement_line_id`, `to_statement_line_id`); `bank_statement_lines.account_transfer_id` for line lookup. Classify `transfer` on outflows: post transfer from statement account to `counterpart_money_account_id`. Inflows: match existing transfer (`to_money_account` = current, same amount/date, `to_statement_line_id` NULL, outflow already posted) → `status=linked`, no new GL; else post with counterpart as source. Manual transfers via dedicated API. Posted/linked lines cannot be re-classified.

**Why:** Decisions §12 — transfers between own accounts are one movement, not income/expense.

**API:** `POST/GET .../banking/transfers`; classify PATCH accepts `counterpart_money_account_id` when `classification=transfer`.

**Not in slice:** opening balances, multi-entity transfers, FX conversion, UI, auto-detect from description.

**Migration:** Alembic `017`.

## 2026-06-21 — Bank statement import & classify (Phase 3)

**Choice:** `bank_statements` + `bank_statement_lines` (entity RLS). CSV v1 format: `transaction_date` (YYYY-MM-DD), signed `amount_kurus` (outflows negative), `description`, optional `reference`. Parser in `adapters/bank_parsers/csv_simple.py`. Import rejects duplicate `(entity_id, file_fingerprint)` and overlapping periods for the same bank money account. Classify `supplier_payment` on outflows: first match existing `SupplierLedgerEntry` (`movement_type=payment`, same supplier, `abs(amount)`, exact date); if found → `status=linked` with FKs, no GL post; else → `post_supplier_payment()` with `payment_account_id` = money account GL sub-account and `reference_type=bank_statement_line`. `bank_fee` / `unknown` set `status=classified` only (no GL this slice). Posted/linked lines cannot be re-classified.

**Why:** Decisions §12 statement-first banking; Phase 3 constraint — never double-post supplier payments.

**API:** `POST/GET .../banking/accounts/{money_account_id}/statements`, `GET .../banking/statements/{statement_id}`, `PATCH .../statements/{id}/lines/{line_id}/classify`.

**Not in slice:** transfers, opening balances, credit card statements, PDF/OFX, auto-classify, UI.

**Migration:** Alembic `016`.

## 2026-06-21 — Bank/cash account tree (Phase 3)

**Choice:** `features/banking/` — `money_accounts` table (entity RLS) links named bank/cash accounts to auto-created GL sub-accounts under bucket `1100` (bank TRY) / `1000` (cash TRY). `accounts.parent_account_id` FK to bucket; codes auto-assigned `1101+` / `1001+`; inherit type/normal balance; `accepts_opening_balance=true`. Parent bucket balance in tree API = sum of active child GL balances (rollup helper). Aggregate `1100`/`1000` remain valid `payment_account_id` targets for backward compat.

**Why:** Decisions §12 — banking hub tree per entity; `docs/OPENING_BALANCES.md` wizard step 4 (named sub-accounts).

**API:** `POST/GET/PATCH /entities/{id}/banking/accounts`, `GET .../tree`. Create requires seeded chart (409 if not).

**Not in slice:** credit cards (`2100`), FX cash, statement import, transfers, opening balance posting, UI.

**Migration:** Alembic `015`.

## 2026-06-21 — Entity isolation via PostgreSQL RLS

**Choice:** Enforce multi-restaurant isolation at the **database** with PostgreSQL row-level security (`FORCE ROW LEVEL SECURITY`) on every entity-scoped table, plus application `entity_context()` setting `app.current_entity_id`.

**Why:** CURSOR_RULES §1 requires DB-level enforcement so no code path can leak across entities. RLS applies to ORM and raw SQL.

**Pattern for new tables:** inherit `EntityScopedMixin`, add table name to `app/db/rls.py` `RLS_TABLES`, include in Alembic migration.

## 2026-06-21 — Opening balances offset via Opening Balance Equity

**Choice:** User enters natural-side opening figures per balance-sheet account; system generates **Opening Balance Equity (`3900`)** offset so the day-one journal balances.

**Why:** Decisions §19 — running business go-live; standard accounting practice.

**Plan:** `docs/OPENING_BALANCES.md`. Posting lands in Phase 1 `core/ledger`.

## 2026-06-21 — Single posting boundary in core/ledger

**Choice:** All ledger writes go through `post_journal_entry()` in `core/ledger/posting.py`. Journal tables inherit `EntityScopedMixin`; amounts are integer kuruş; validation rejects unbalanced entries, zero lines, inactive/unknown accounts, and cross-entity account references.

**Why:** Decisions §1 / CURSOR_RULES §1 #10 — one boundary prevents bypass paths. Feature APIs delegate to core; no direct journal inserts elsewhere.

**Cross-entity account check:** RLS normally hides other entities' accounts. Posting uses transaction-local `app.posting_lookup` + `accounts_posting_lookup` SELECT policy so the boundary can detect entity mismatch without exposing accounts to normal queries.

## 2026-06-21 — Posted journal immutability + void/reverse + audit

**Choice:** Posted `journal_entries` and lines are immutable at ORM (event listeners) and PostgreSQL (BEFORE UPDATE/DELETE triggers). Corrections only via `void_journal_entry()`, which posts a balanced reversing entry linked to the original. Every post and void writes a row to `ledger_audit_events` with `actor_id`, timestamp, and optional reason.

**Why:** Decisions §1 / CURSOR_RULES §1 #3 — void → reverse → audit; no in-place edits to posted amounts. `actor_id` is a plain UUID parameter until auth lands (no over-engineered ActorContext).

**Void metadata:** Original entry `status=voided`, `reversed_by_entry_id` set; reversal `reverses_entry_id` points at original. Both entries remain visible; net ledger effect is zero.

**API:** `POST .../ledger/entries` requires `actor_id`; `POST .../ledger/entries/{entry_id}/void` with optional `reason` and `void_date`. No PATCH/DELETE on entries.

## 2026-06-21 — Ledger DB immutability bootstrap + void gate

**Choice:** Centralize PostgreSQL immutability triggers in `apply_ledger_immutability()` (bootstrap + Alembic `006`). Void metadata (`status`, `reversed_by_entry_id`, `voided_at`) updates require transaction-local `set_config('app.journal_void_update', '1', true)` — set by `journal_void_update_allowed(session)` during `void_journal_entry()`. `ledger_audit_events` is append-only at DB (no UPDATE/DELETE).

**Why:** v0.7.0 triggers existed only via Alembic; test/dev bootstrap used `create_all` without triggers, so raw SQL could bypass ORM listeners. Hardening closes that gap without new product surface.

## 2026-06-21 — Manual journals via dedicated API + entry source typing

**Choice:** Add `JournalEntrySource` on `journal_entries` (`manual`, `opening_balance`, `invoice`, `system`). Accountant adjustments use `features/manual_journals/` with `POST/GET /entities/{id}/manual-journals` (list/get/void). All posts go through `post_journal_entry(..., source=...)`. Void reversals stamp `source=system`.

**Why:** Decisions §1 — manual journals are a distinct, audited flow; source typing lets list/filter exclude automated entries (invoices, opening balances, void reversals) without ad-hoc flags.

**API migration:** Removed generic `POST .../ledger/entries` (no source typing). Kept `POST .../ledger/entries/{id}/void` for ledger-wide void; manual-journals also exposes `POST .../manual-journals/{id}/void` with enriched response (account code/name on lines).

**Immutability:** `source` is immutable after post (ORM + DB trigger). No PATCH on entries.

## 2026-06-21 — e-Fatura read into draft (no posting)

**Choice:** `features/invoices/` with `invoice_drafts` table (entity-scoped RLS). Upload via `POST .../invoices/efatura/draft` (multipart). Prefer UBL-TR XML (`extract_efatura_xml`); PDF v1 uses fixture registry for tests and optional `pypdf` text + regex heuristics for common GİB layouts. Unknown/unreadable PDFs return 422 — full vision OCR deferred.

**Why:** Decisions §7 — supplier invoices from e-Fatura; prefer XML, fall back to PDF; per-rate KDV breakdown; net + VAT = gross check. Decisions §8 — SHA256 `file_fingerprint` for duplicate detection per entity. Slice is **read into draft only** — no ledger posting, payables, or supplier master.

**Duplicate handling:** Same fingerprint + entity → HTTP 409 with `existing_draft_id`. Cross-entity: same file allowed (fingerprint scoped per entity).

**Math:** `validate_invoice_totals()` — integer kuruş, zero tolerance.

**Storage:** `adapters/storage/local.py` writes to configurable `upload_dir` (default `data/uploads/`).

## 2026-06-21 — Opening balance validate API blocks unmodeled categories

**Choice:** Whitelist aggregate codes only; refuse FX (`1010`–`1030`), partner (`2150`), and future sub-account codes with explicit **not supported yet** errors.

**Why:** Block, don't guess — especially FX as plain kuruş (Decisions §15 quantity model).

## 2026-06-21 — Supplier master per entity (Phase 2)

**Choice:** `features/suppliers/` with `suppliers` table (entity-scoped RLS). One supplier record per VKN per entity; same real-world supplier across restaurants = separate rows. VKN is 10–11 digits, immutable after create. Deactivate via `is_active=false` only — no hard delete.

**Why:** Decisions §8 — suppliers tracked per restaurant/entity; VKN from e-Fatura for matching; no heavy name-matching. Slice is **master data only** — no payables ledger, posting, or payments yet.

**API:** `POST/GET/PATCH /entities/{id}/suppliers`; `GET .../suppliers/by-vkn/{vkn}` for future draft→supplier linking. Duplicate VKN within entity → HTTP 409.

**Unique constraint:** `(entity_id, vkn)`. Cross-entity: same VKN allowed (separate books per entity).

## 2026-06-21 — Payables ledger & balance (Phase 2)

**Choice:** `core/payables/` with `supplier_ledger_entries` table (entity-scoped RLS, append-only). Single write boundary: `record_supplier_movement()`. Signed integer kuruş: positive increases payable, negative decreases. Movement types include `opening_balance`, `adjustment`, `invoice`, `payment`, `credit_note`; only `opening_balance` and `adjustment` writable via API this slice.

**Why:** Decisions §8 — ledger/balance-based payables; running supplier ledger; payables page shows all supplier balances + total; no invoice-by-invoice payment allocation. No GL posting from payables movements this slice.

**Immutability:** ORM event listeners + PostgreSQL BEFORE UPDATE/DELETE triggers (`apply_payables_immutability()`). Corrections via reversing adjustment movement (future).

**API:** `GET /entities/{id}/payables` (total + per-supplier balances); `GET .../suppliers/{id}/ledger`; `POST .../suppliers/{id}/ledger/movements` with `actor_id`, `movement_date`, `movement_type`, `amount_kurus`, `description`.

**Balance:** `current_balance_kurus(supplier_id)` = SUM(`amount_kurus`); entity total = sum across active suppliers.

## 2026-06-21 — Draft → supplier linking (Phase 2)

**Choice:** Nullable `supplier_id` FK on `invoice_drafts` → `suppliers`. On upload, auto-link when extracted VKN matches an existing supplier via `find_by_vkn`. Manual link via `POST .../link-supplier` (explicit `supplier_id` or auto by draft VKN); unlink via `POST .../unlink-supplier`.

**Why:** Decisions §8 — match e-Fatura supplier VKN to supplier master before review/posting. No ledger posting this slice.

**API:** Draft responses include `supplier_id`, `linked_supplier_name`, `linked_supplier_vkn` when linked.

## 2026-06-21 — Draft review / confirm workflow (Phase 2)

**Choice:** Extend `InvoiceDraftStatus` with `confirmed`. Confirm requires linked `supplier_id`, status `draft` or `needs_review`, and `actor_id`; stamps `confirmed_at` / `confirmed_by`. Reject sets `needs_review` with optional `review_reason`. Confirmed drafts are immutable (no relink/unlink/reject).

**Why:** Decisions §7/§8 — review gate before posting; confirmed = ready for future draft-to-ledger slice.

**API:** `POST .../confirm`, `POST .../reject`; list drafts supports `?status=`.

## 2026-06-21 — Payment reduces payable (Phase 2)

**Choice (superseded):** Initial slice used payables-only subledger movement without GL. Replaced by supplier payment GL posting slice below.

**Why:** Interim step before banking phase; GL integration now complete.

## 2026-06-21 — Supplier payment GL posting (Phase 2)

**Choice:** `core/payables/posting.py` — `post_supplier_payment()` atomically: balanced GL journal via `prepare_journal_entry(..., source=payment)` (debit AP `2000`, credit caller-selected bank/cash asset) + negative payables movement via `persist_supplier_payment_entry()` with linked `journal_entry_id`. Removed `record_supplier_payment()` from ledger boundary.

**Why:** Decisions §8/§11 — supplier payments must post to double-entry ledger and reduce payable in one transaction; AP control account must reconcile to subledger total.

**GL pattern:** Debit AP for payment amount; credit active ASSET account (`payment_account_id`). Non-asset accounts rejected.

**Subledger:** Payment stored as negative kuruş with type `payment`; `journal_entry_id` FK links to GL entry. Invoice subledger rows also require `journal_entry_id`.

**API:** `POST /entities/{id}/suppliers/{supplier_id}/payments` with `payment_date`, `amount_kurus`, `description`, `actor_id`, **`payment_account_id`** (required), optional `reference`. Returns `journal_entry_id`, `supplier_ledger_entry`, `payable_balance_kurus`.

**Overpayment policy:** Reject if `current_balance - payment < 0` (unchanged).

**Not GL-posted:** `opening_balance` and `adjustment` subledger movements remain payables-only; control-account tests use invoice post + payment path.

**Phase 3 constraint:** Bank-statement supplier payment classification reuses `post_supplier_payment()` OR links to an existing payment (match supplier/amount/date) — never posts twice.

**Migration:** Alembic `014` adds nullable `journal_entry_id` FK on `supplier_ledger_entries`.

## 2026-06-21 — Invoice draft-to-ledger posting (Phase 2)

**Choice:** `core/invoices/posting.py` — `post_confirmed_draft()` atomically: balanced GL journal via `prepare_journal_entry(..., source=invoice)` + supplier payables via `persist_supplier_invoice_entry()` (type `invoice`, positive gross kuruş). Draft status becomes `posted` with `journal_entry_id` FK — prevents re-post.

**Why:** Decisions §7/§11 — confirmed supplier invoice posts to double-entry ledger and increases payable; one transaction, one posting boundary per subsystem.

**GL pattern:** Credit AP `2000` (gross); debit caller-selected expense account (net); debit Input VAT `1500` — one line per `vat_breakdown` entry (or aggregated if breakdown empty but gross − net > 0). Integer kuruş; debits = credits validated before post.

**Chart:** Added `1500` Input VAT to default chart (`accepts_opening_balance=false`). Alembic `013` idempotently inserts `1500` for entities that already have a chart.

**API:** `POST /entities/{id}/invoices/drafts/{draft_id}/post` with `actor_id`, `expense_account_id`. Returns posted draft, journal entry summary, supplier ledger entry id, payable balance.

**Guards:** Confirmed + linked supplier only; expense account must be active EXPENSE type; already-posted rejected.

**Not in scope:** void posted invoice; auto expense categorization; bank payment GL.

**Updated:** Supplier payment GL posting slice adds bank/cash GL credit via `post_supplier_payment()` — see DECISIONS payment GL entry.

## 2026-06-21 — Staff salary vs advance (Phase 5 Slice 3, Decisions §16)

**Choice:** Mirror supplier payables pattern — entity-wide control accounts (`2250` Salaries Payable, `1300` Employee Advances) reconciled to per-employee `staff_ledger_entries` subledger. Expense hits `5100` once: at accrual for TRY workers; at payment for FX workers (owner-entered `try_cost_kurus`).

**Why:** Decisions §16 — salary is the cost; advance and payment are settlement movements. AP-style liability (`2250`) avoids double-counting expense on payment. FX ledger stays in native minor units for stability; TRY wage reporting uses `try_cost_kurus` captured at payment (and advance) time.

**GL patterns (TRY):**
1. Accrual: Dr `5100` / Cr `2250`; subledger `+amount_minor` (kuruş)
2. Advance: Dr `1300` / Cr bank/cash GL; subledger `-amount_minor`
3. Payment: Dr `2250` (payable cleared = cash + advance applied) / Cr `1300` (advance portion) / Cr cash (remainder); subledger `-amount_minor`; **no `5100` line**

**GL patterns (FX):**
1. Accrual: subledger `+amount_minor` (native cents) only — no GL
2. Advance: Dr `1300` (try_cost) / Cr FX GL; `fx_ledger` spend (negative quantity/cost); subledger `-amount_minor`
3. Payment: Dr `5100` (try_cost + advance try recognized) / Cr `1300` if advance / Cr FX GL; `fx_ledger` spend; subledger `-amount_minor`

**Chart:** Added `2250` Salaries Payable (`accepts_opening_balance=true`). Alembic `025` backfills for existing entities.

**API:** `/entities/{id}/staff/employees` CRUD; `POST .../accruals`, `.../advances`, `.../payments`; `GET .../ledger`.

**Deferred:** Staff opening balances wizard; payroll/SGK; tips; reports UI; per-employee GL sub-accounts.

## 2026-06-22 — Partner reimbursements (Phase 5 Slice 4, Decisions §17)

**Choice:** Mirror supplier payables / staff pattern — entity-wide control account `2150` Partner Reimbursements Payable reconciled to per-partner `partner_ledger_entries` subledger. **Not capital tracking** — light master (`partners`: name, `is_active`) only.

**Why:** Decisions §17 — partner pays business expense out of pocket → business owes partner → repaid → cleared. Expense hits the chosen expense account **once** at fronting; reimbursement is settlement only (no second expense).

**GL patterns:**
1. Expense fronted: Dr expense (owner picks `5000` rent, `5200` utility, etc.) / Cr `2150`; subledger `+amount_kurus`
2. Reimbursement paid: Dr `2150` / Cr bank/cash GL; subledger `-amount_kurus`; **no expense line**

**Opening balances:** Per-partner via `partner_id` lines on onboarding post (aggregate `account_code=2150` still rejected — use subledger). `2150` `accepts_opening_balance=true` for chart consistency; OB wizard uses `partner_id` like `supplier_id`.

**API:** `/entities/{id}/partners` CRUD; `POST .../expenses-fronted`, `POST .../reimbursements`; `GET .../ledger`.

**JournalEntrySource:** `partner_expense_fronted`, `partner_reimbursement_paid`.

**Deferred:** Partner reimbursement bank-statement classify; reports UI; capital/equity tracking.

## 2026-06-22 — Customer receivables (Phase 5 Slice 5, Decisions §10)

**Choice:** Mirror supplier payables pattern — entity-wide control account `1200` Accounts Receivable reconciled to per-customer `customer_ledger_entries` subledger. Light master (`customers`: name, optional `identifier`, `is_active`) only — no invoicing module.

**Why:** Decisions §10 — credit sale increases what customer owes; later payment reduces it. Revenue hits `4000` **once** at credit sale; payment is settlement only (no second revenue).

**GL patterns:**
1. Credit sale: Dr `1200` / Cr `4000` Sales Revenue (or owner-selected revenue account); subledger `+amount_kurus`
2. Payment received: Dr bank/cash GL / Cr `1200`; subledger `-amount_kurus`; **no revenue line**

**Opening balances:** Per-customer via `customer_id` lines on onboarding post (aggregate `account_code=1200` still allowed when no per-customer lines; cannot combine aggregate `1200` with `customer_id` lines). Subledger `opening_balance` row linked to opening journal.

**Bank statement:** `customer_payment` classification on bank **inflow** — Dr bank / Cr AR via `post_customer_payment()`; links `customer_id` and `customer_ledger_entry_id` on statement line.

**API:** `/entities/{id}/customers` CRUD; `POST .../credit-sales`, `POST .../payments`; `GET .../ledger`; `GET .../receivables` summary.

**JournalEntrySource:** `customer_credit_sale`, `customer_payment_received`.

**Immutability:** ORM event listeners + PostgreSQL triggers (`apply_receivables_immutability()`). Alembic `027`.

**Deferred:** Invoicing module; e-Fatura for customers; receivables reports UI.

