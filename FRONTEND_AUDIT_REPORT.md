# Frontend Audit Report

**Date:** 2026-08-24  
**Scope:** Full discovery audit of `frontend/src` before any v3 build work  
**Mode:** Read-only — **no application code or guards changed**  
**Baseline commit:** `4952d79` / tag `v0.sales-page-visuals`

**Resuming slice:** Frontend audit · **step:** Discovery → Record keeping

---

## Executive verdict

The frontend is shippable and currently green. The main pre-v3 risks are **file-size debt** (statement-import + invoice-draft + manual-expense panels **redeemed**), a **preview kit** that is not wired into the live product, a handful of **lib helpers used only by tests**, and **parallel UI patterns** for periods / downloads / cash close. No systemic `apiFetch` misuse or hard-coded API base URLs showed up.

---

## Green light (this audit)

| Check | Result |
|-------|--------|
| `npm run test` (vitest) | **Pass** — 216 files, 1402 tests |
| `npm run lint` (eslint) | **Pass** |
| `npx tsc --noEmit` | **Pass** (ran in same gate) |
| `npm run build` (real Next build, mocked Google fonts) | **Pass** |

Guards were not modified. `FILE_SIZE_BASELINE.json` already tracks several mega-files; this report flags them for split work, not for raising the ratchet.

---

## Task 1 — `apiFetch()` inventory

```text
rg -n 'apiFetch\(' frontend/src --glob '*.{ts,tsx}'
```

| Metric | Count |
|--------|------:|
| Call sites (`apiFetch(`) | ~**100** |
| Files with at least one call | ~**79** |

**Concentration:** Heavy use under `components/forms/*` (one POST/GET per form is expected). Also: review panels, settings/team, banking cash, split, month-close, reports year-end, invoice/receipt review.

**Healthy patterns observed:**
- Shared client in `lib/api.ts` — almost all network I/O goes through `apiFetch`.
- No widespread hard-coded absolute `http(s)://…` API hosts in call sites.
- Sales Posted KPIs correctly call `GET …/reports/sales-summary` (API kept after UI summary block removal).

**Not a bug:** Redirect-only App Router pages (`/balances/*`, `/uploads`, `/expenses`, etc.) correctly avoid `apiFetch`; they only `redirect(…)`.

---

## Oversized files (>400 lines, non-test)

**Progress (2026-08-24):**
- `statement-import-panel.tsx` **889 → 115** — `v0.fe-split-statement-import` (redeemed from baseline)
- `invoice-draft-review.tsx` **883 → 80** — `v0.fe-split-invoice-draft` (redeemed from baseline). Types + capabilities libs; hook; summary (incl. GlEntryActions); action forms.
- `manual-expense-form.tsx` **832 → ~150** — `v0.fe-split-manual-expense` (redeemed). Draft/submit libs; hook; fields + salary panel; reuses existing typeahead/category/toggle.
- `staff-salary-payment-dialog.tsx` **838 → ~269** — `v0.fe-split-staff-salary` (redeemed). Hook + period/settle UI + open/validate/settle libs; reuses funding/FX/submit.
- `opening-balances/page.tsx` **775 → ~118** — `v0.fe-split-opening-balances` (redeemed). Draft lib + hook + lines panel/row + journal preview.
- `statement-classify-bar.tsx` **770 → ~279** — `v0.fe-split-statement-classify` (redeemed). Hook + target control + correct dialog; reuses classify payload helpers.
- `statement-line-review-row.tsx` **632 → ~126** — `v0.fe-split-statement-line-review` (redeemed). Hook + header/actions/correct dialog.
- `nav-sections.ts` **608 → ~40** — `v0.fe-split-nav-sections` (redeemed). Types + sections data + route registry + path helpers; barrel re-exports.

**Remaining** production files still over 400 (see live tree / baseline). Top offenders after these splits:

| Lines | Path |
|------:|------|
| ~~889~~ | ~~`components/banking/statement-import-panel.tsx`~~ → **split** (`v0.fe-split-statement-import`) |
| ~~883~~ | ~~`components/invoice-draft-review.tsx`~~ → **split** (`v0.fe-split-invoice-draft`) |
| ~~832~~ | ~~`components/forms/manual-expense-form.tsx`~~ → **split** (`v0.fe-split-manual-expense`) |
| ~~838~~ | ~~`components/forms/staff-salary-payment-dialog.tsx`~~ → **split** (`v0.fe-split-staff-salary`) |
| ~~775~~ | ~~`app/onboarding/opening-balances/page.tsx`~~ → **split** (`v0.fe-split-opening-balances`) |
| ~~770~~ | ~~`components/statement-classify-bar.tsx`~~ → **split** (`v0.fe-split-statement-classify`) |
| ~~632~~ | ~~`components/statement-line-review-row.tsx`~~ → **split** (`v0.fe-split-statement-line-review`) |
| ~~608~~ | ~~`lib/nav-sections.ts`~~ → **split** (`v0.fe-split-nav-sections`) |
| ~~589~~ | ~~`components/forms/cash-drawer-close-day-form.tsx`~~ → **split** (`v0.fe-split-cash-close-day`) |
| ~~580~~ | ~~`components/forms/group-sale-form.tsx`~~ → **split** (`v0.fe-split-group-sale`) |
| ~~538~~ | ~~`components/review/general-ledger-panel.tsx`~~ → **split** (`v0.fe-split-general-ledger`) |
| ~~517~~ | ~~`components/ui/date-input.tsx`~~ → **split** (`v0.fe-split-date-input`) |
| ~~512~~ | ~~`app/banking/cash/page.tsx`~~ → **split** (`v0.fe-split-banking-cash`) |
| ~~498~~ | ~~`app/split/page.tsx`~~ → **split** (`v0.fe-split-split-page`) |
| ~~466~~ | ~~`lib/statement-classification-options.ts`~~ → **split** (`v0.fe-split-statement-classification-options`) |
| ~~455~~ | ~~`components/layout/account-menu.tsx`~~ → **split** (`v0.fe-split-account-menu`) |
| ~~446~~ | ~~`components/forms/customer-payment-form.tsx`~~ → **split** (`v0.fe-split-customer-payment`) |
| 436 | `components/command-palette.tsx` |
| 430 | `components/statement-bulk-action-bar.tsx` |
| 427 | `components/banking/fx-hub-page-content.tsx` |
| 421 | `app/(customers-section)/customers/[id]/page.tsx` |
| 417 | `lib/record-actions.ts` |
| 414 | `components/record/people-record-dialog.tsx` |
| 410 | `components/forms/partner-profit-allocation-form.tsx` |
| 406 | `components/forms/partner-record-form.tsx` |

**Recommendation:** Continue the existing split pattern. Next: `components/command-palette.tsx` (~436).

---

## Dead / preview-only / orphan suspects

### Preview kit (intentional sandbox, not live product)

| Area | Notes |
|------|--------|
| `app/preview/page.tsx` | Owner/cashier-gated walkthrough |
| `components/preview/*` | Phone screens + sample data + theme gallery |
| `MeaningChip` | **UI usage only in preview** (type reused by `mobile-card-list`) |
| `PeriodSegmentedChips` | Preview / design exploration; live sales uses `FilterChips` + `SalesPeriodChips` |

**Decision needed for v3:** keep `/preview` as a design lab, or archive and delete once v2 is locked.

### Lib helpers — production importers missing

These modules appear imported **only from tests** (not from app/forms/components):

| Module | Evidence |
|--------|----------|
| `lib/fx-ledger-description.ts` | Only `ledger-rich-description.test.ts` |
| `lib/partner-ledger-description.ts` | Only `ledger-rich-description.test.ts` |
| `lib/staff-ledger-description.ts` | Only `ledger-rich-description.test.ts` |
| `lib/transfer-ledger-description.ts` | Only its own `*.test.ts` |

**Likely story:** write-time compose lives on the backend; FE helpers remain for parity tests / future client display. **Wire or drop** before a large FE rewrite so they do not rot.

### Redirect stubs (not dead — keep)

Legacy routes that only redirect (`/balances`, `/uploads`, `/expenses`, `/close-day`, receivables/payables aliases, etc.) are still useful for bookmarks and old links.

---

## Duplicate / parallel logic

### 1. Period / filter chip UIs

| Pattern | Where |
|---------|--------|
| `FilterChips` | Sales status + other list filters |
| `SalesPeriodChips` | Posted period (This / Last / Custom) |
| `SegmentedControl` | Shared control |
| `PeriodSegmentedChips` | Preview only |
| `ExpenseRecordKindToggle` | Manual expense — hand-rolled, not `SegmentedControl` |

**Risk:** Visual drift (sales already fixed filled-primary active chips under v2). Unify on one chip language.

### 2. Download / export menus

Shared core: `components/ui/download-menu.tsx` + thin wrappers:

- `report-download-menu.tsx`
- `delivery-download-menu.tsx`
- `subledger-download-menu.tsx`
- `expenses-review-export-menu.tsx`
- `general-ledger-export-menu.tsx`

**Special cases:** `supplier-activity-export-button.tsx`; cash-book still composes `DownloadMenu` inline. Not broken — but export UX should stay one pattern.

### 3. Cash drawer close

Two forms coexist:

- `cash-drawer-close-form.tsx`
- `cash-drawer-close-day-form.tsx` → **split** (`v0.fe-split-cash-close-day`; shell ~129 + hook/body/done)

Wired from record desk / cash page / action modals. Older `cash-drawer-close-form.tsx` (session-based) still coexists — consolidate UX later if desired.

### 4. Money formatting

Canonical path is `lib/money.ts` (`formatKurus`, parse helpers). Surrounding domain helpers (`fx-money`, `staff-salary`, `menu-prefill`, balances display) correctly import it — **good**. Watch for any new local “kurus → input string” copies when splitting mega-forms.

---

## Design / token inconsistencies

Hard-coded hex still appears outside (or as fallbacks for) CSS variables:

| Location | Example |
|----------|---------|
| `lib/balances-overview-display.ts` | `#16A34A` / `#DC2626` / `#0B1526` |
| `components/dashboard/cash-bank-snapshot-card.tsx` | `#3D4A63`, `#0B1526`, `#E6EAF2` |
| `components/dashboard/dashboard-v2-header.tsx` | `#0B1526` |
| `components/ui/button.tsx` (`positive`) | `#16A34A` |
| `app/manifest.ts` | theme/background colors |
| Icon / meaning fallbacks | `stat-card`, `icon-square`, `meaning-card` (`var(--token, #hex)`) |

Many of these are **accepted-live** from recent dashboard/balances slices. For v3: prefer tokens with one source of truth; keep mutation tests if colors are intentional.

---

## Structural notes (not defects)

- **Sales summary:** Backend report remains; FE KPIs on Posted use the same API. Former top-of-page `SalesSummaryBlock` correctly removed (`v0.sales-summary-ui-off`).
- **ListPage:** `summary` above `filters` — intentional after sales visuals.
- **Nav:** `lib/nav-sections.ts` is large by nature (608 lines); split by section if edited often.
- **Command palette:** Known deferred gaps (staff/partners/transaction search) — ROADMAP A6; not audit-new.

---

## Recommended cleanup order (future slices — do not implement in this audit)

1. ~~**Split `statement-import-panel`**~~ — **DONE** `v0.fe-split-statement-import`
2. ~~**Split `invoice-draft-review`**~~ — **DONE** `v0.fe-split-invoice-draft`
3. ~~**Split `manual-expense-form`**~~ — **DONE** `v0.fe-split-manual-expense`
4. ~~**Split `staff-salary-payment-dialog`**~~ — **DONE** `v0.fe-split-staff-salary`
5. ~~**Split `opening-balances/page`**~~ — **DONE** `v0.fe-split-opening-balances`
6. ~~**Split `statement-classify-bar`**~~ — **DONE** `v0.fe-split-statement-classify`
7. ~~**Split `statement-line-review-row`**~~ — **DONE** `v0.fe-split-statement-line-review`
8. ~~**Split `nav-sections`**~~ — **DONE** `v0.fe-split-nav-sections`
9. **Decide preview kit fate** — keep lab vs archive/delete  
10. **Unify period chips** — one component language for This/Last/Custom + status filters  
11. **ExpenseRecordKindToggle → SegmentedControl** (or shared chip)  
12. **Normalize export wrappers** — keep `DownloadMenu` as the only interactive shell  
13. **Split remaining mega-files** — cash-close, group-sale, GL panel, …  
14. **Cash close UX consolidation**  
15. **Tokenize remaining accepted hex** (without visual regressions)  
16. **Ledger-description FE libs** — wire for display or delete + keep backend as source of truth  

---

## Out of scope / explicitly not done

- No guard edits  
- No product behavior changes  
- No `FILE_SIZE_BASELINE` raises  
- No deletion of preview or orphan libs in this slice  

---

## Appendix — how to re-run discovery

```bash
# apiFetch
rg -n 'apiFetch\(' frontend/src --glob '*.{ts,tsx}'

# oversized (non-test)
cd frontend/src && python3 -c "
from pathlib import Path
rows=[]
for p in Path('.').rglob('*'):
  if p.suffix not in {'.ts','.tsx'}: continue
  if any(x in p.name for x in ('.test.','.spec.')): continue
  if 'test-support' in p.parts: continue
  n=sum(1 for _ in open(p, encoding='utf-8', errors='ignore'))
  if n>400: rows.append((n,str(p)))
for n,p in sorted(rows, reverse=True): print(f'{n:4d}  {p}')
"

# orphan-ish lib importers
rg -l 'fx-ledger-description|partner-ledger-description|staff-ledger-description|transfer-ledger-description' frontend/src
```
