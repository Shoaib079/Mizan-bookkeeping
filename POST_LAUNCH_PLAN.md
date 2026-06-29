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

---

## 🔨 Build queue (each = one slice)

### ~~P1 — Expense account picker: show names, not GL codes~~ **DONE**

### P2 — Auto-categorize manual expenses (AI + learning)  *(larger; needs OpenAI key)*
**Why:** owner types "rent" / "peynir" / "repair machinery" and the right expense account is chosen for them. Spelling variants/synonyms must resolve to ONE account.

**Key rules:** suggest-and-confirm (pre-fill, owner can override — never silent); learned mappings first, AI fallback; "peynir"/"paneer"/"payneer" (TR↔EN) → same account + same canonical item (no per-spelling split — accounts are a fixed list; the text is just the entry memo/item).

**Cursor prompt:**
```
Add AI + learning expense auto-categorization to the manual expense form.

Backend:
- New endpoint: given an expense description, return a suggested expense account for the current entity.
  Order: (1) LEARNED — match the normalized description against learned mappings (reuse/extend expense_items + expense_item_aliases; per-entity, normalized) and return the mapped account if found; (2) AI FALLBACK — call the OpenAI model already configured for receipts (settings.expense_receipt_vision_*) with the description + the entity's list of expense accounts (code, name_en, name_tr) and have it return the best-fit account code. Return {account_id, source: "learned"|"ai", confidence}.
- On expense create/confirm: record description→account as a learned mapping (upsert canonical item + alias, normalized) so future variants of the same thing resolve to the SAME account/item. Spelling variants/synonyms must map to one canonical item (no duplicates).
- Migration if a new learning table/column is needed; otherwise extend expense_items/expense_item_aliases.
- Never auto-post silently: the endpoint only SUGGESTS; posting still requires the submitted account.

Frontend (manual-expense-form.tsx):
- As the user types the description (debounced ~400ms), call the suggest endpoint and pre-fill the expense account with the suggestion, visibly marked "suggested" and editable/overridable.
- On submit, the confirmed account is what posts (and triggers the learning record).

Tests: learned-match path, AI-fallback path (mock the AI), variant spellings resolve to one account, suggest never posts on its own. Money-adjacent — keep coverage solid.
Commit: "feat(expenses): AI + learning auto-categorization (suggest-and-confirm)".
```
**Dependency:** an OpenAI API key set on Railway (`EXPENSE_RECEIPT_VISION_*` / equivalent). Tell me when starting and we'll wire the key.

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

### Decisions (no build, your call)
- **Neon 7-day instant restore** (~$5/mo) — upgrade for finer point-in-time DB recovery on top of nightly off-site backups. Optional.
- **Restore-verify** — occasionally run `python -m app.features.backups.cli verify` (restores latest backup into a scratch DB + checks the books tie) for peace of mind.

---

**How to use:** pick a slice → paste its Cursor prompt → Cursor builds + tests + commits → push → Railway/Netlify auto-deploy → test live. Tell me when you start P2/P3/P5/P6 and I'll expand the spec or walk the ops steps.
