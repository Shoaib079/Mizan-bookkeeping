# BUGLOG

Bugs: symptom, root cause, fix, guarding test (see CURSOR_RULES.md §8).

## 2026-06-23 — Fresh `pip install -e ".[dev]"` failed on clean machine

**Symptom:** On a new venv, `pip install -e ".[dev]"` in `backend/` failed with setuptools error: *Multiple top-level packages discovered in a flat-layout: `app`, `data`, `alembic`*.

**Root cause:** Default setuptools package discovery treated `alembic/` (migrations) and `data/` (fixtures) as installable top-level packages alongside `app/`.

**Fix:** `backend/pyproject.toml` — `[tool.setuptools.packages.find] include = ["app*"]` so only the application package is installed.

**Guarding test:** `backend/scripts/verify_fresh_install.sh` + `.github/workflows/ci.yml` (clean venv, `pip install -e ".[dev]"`, boot, full pytest).

## 2026-06-23 — Staff advance applied twice on partial salary payments

**Symptom:** Accrue 100k, advance 50k, pay 30k then 20k — both 1300 and 2250 showed −50k wrongly.

**Root cause:** `SALARY_PAYMENT` recorded only cash paid; `outstanding_advance_minor` never reduced on apply.

**Fix:** `ADVANCE_APPLIED` movement; full payable clearance on payment; FX path aligned.

**Guarding test:** `test_partial_salary_payment_applies_advance_only_once`, staff tie test. Tag `v0.47.14`. **Money-critical — owner sign-off.**

## 2026-06-23 — Payables adjustments posted without GL

**Symptom:** ADJUSTMENT/OPENING_BALANCE via API with `journal_entry_id=None`.

**Root cause:** Subledger API bypassed posting boundary.

**Fix:** `post_supplier_manual_movement()` with GL counterpart. Tag `v0.47.15`. **Money-critical — owner sign-off.**

## 2026-06-23 — POS daily totals double-counted tips as revenue

**Symptom:** Full total credited to 4000 while tips also hit 2260.

**Root cause:** No tips at intake; gross posted to revenue.

**Fix:** `tips_kurus` intake; revenue = total − tips at confirm. Tag `v0.47.17`. **Money-critical — owner sign-off.**

## 2026-06-23 — POS/delivery settlements not idempotent

**Symptom:** Duplicate settlement posts / re-classify could double-count.

**Fix:** UNIQUE batch id + dedup + bank link-existing. Tag `v0.47.16`.

## 2026-06-23 — FX purchase classified as operating cash flow

**Fix:** Investing bucket + registry guard. Tag `v0.47.18`.

## 2026-06-23 — Subledger immutability not registry-guarded

**Fix:** `IMMUTABLE_SUBLEDGER_TABLES` + raw SQL tests. Tag `v0.47.19`.

## 2026-06-23 — Period lock audit trail mutable at database layer

**Symptom:** `period_lock_audit_events` and `period_locks` had no append-only/delete protection unlike ledger audit tables.

**Root cause:** Slice 4 added tables but did not extend the canonical immutability trigger tail; no registry guard for audit tables.

**Fix:** `IMMUTABLE_AUDIT_TABLES` registry + `apply_audit_immutability()` (append-only on all `*_audit_events` tables); `period_locks_no_delete` trigger; migration `042_period_lock_immutability`; table-existence checks so migration 038 can run before period-lock tables exist.

**Guarding test:** `test_immutable_audit_registry_covers_all_audit_tables`, `test_immutable_audit_tables_have_append_only_triggers`, `test_period_locks_table_has_delete_protection_trigger` in `test_security_invariants.py`; provisioning tests in `test_db_provisioning.py`; raw SQL tests in `test_period_locks.py`.

## 2026-06-23 — FastAPI file-upload routes missing runtime dependency

**Symptom:** After editable install, importing the app or hitting upload endpoints failed with FastAPI’s `python-multipart` requirement error.

**Root cause:** `python-multipart` was not listed in `[project] dependencies` despite multipart/form upload routes (invoices, POS, bank statements, etc.).

**Fix:** `backend/pyproject.toml` — added `python-multipart>=0.0.9` to `dependencies`.

**Guarding test:** Manual — empty venv install then `uvicorn app.main:app` or pytest suite (upload tests exercise multipart).

## 2026-06-23 — PDF export top-level reportlab import broke fresh install / test collection

**Symptom:** With `reportlab` missing or not yet installed, `import app.main` and full pytest collection failed because `pdf_export.py` imported reportlab at module top and `api.py` imported `pdf_export` at module top.

**Root cause:** Optional-feeling PDF dependency wired as a hard import-time dependency on the entire API.

**Fix:** Lazy-import reportlab inside PDF build functions only (`_require_reportlab()`). Bundle DejaVu Sans TTF fonts in `app/assets/fonts/` for Unicode (₺, ğ, ı, İ, ş); `assert_text_renderable()` fails loudly on missing glyphs. Bold totals use `DejaVuSans-Bold`.

**Guarding test:** `test_pdf_export_has_no_top_level_reportlab_import`, `test_bundled_pdf_fonts_ship_with_package`, `test_app_main_imports_after_editable_install` in `test_security_invariants.py`; `test_pdf_renders_turkish_entity_name_and_glyphs` + strict ₺ assertions in `test_pdf_export.py`; `backend/scripts/verify_fresh_install.sh` + `.github/workflows/ci.yml`.
