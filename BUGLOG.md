# BUGLOG

Bugs: symptom, root cause, fix, guarding test (see CURSOR_RULES.md §8).

## 2026-06-23 — Fresh `pip install -e ".[dev]"` failed on clean machine

**Symptom:** On a new venv, `pip install -e ".[dev]"` in `backend/` failed with setuptools error: *Multiple top-level packages discovered in a flat-layout: `app`, `data`, `alembic`*.

**Root cause:** Default setuptools package discovery treated `alembic/` (migrations) and `data/` (fixtures) as installable top-level packages alongside `app/`.

**Fix:** `backend/pyproject.toml` — `[tool.setuptools.packages.find] include = ["app*"]` so only the application package is installed.

**Guarding test:** `backend/scripts/verify_fresh_install.sh` + `.github/workflows/ci.yml` (clean venv, `pip install -e ".[dev]"`, boot, full pytest).

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
