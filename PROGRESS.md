# PROGRESS

## Current

| Field | Value |
|-------|-------|
| **Phase** | 1 — Ledger core + supplier invoices |
| **Last completed slice** | Read e-Fatura invoice (PDF) into draft |
| **Next slice** | Phase 2 — Supplier master (after owner sign-off) |
| **Branch** | `main` |
| **Last tag** | `v0.9.0-phase1-efatura-draft` (`a952821`) |

## Resume point

After sign-off: start Phase 2 — Supplier master (per entity).

## Session notes

- **Invoice drafts:** `invoice_drafts` table with RLS; SHA256 `file_fingerprint` per entity; status `draft` / `duplicate` / `needs_review`
- **Extraction:** UBL-TR XML via `adapters/ocr_ai/efatura.py` (stdlib `xml.etree`); PDF v1 via fixture registry + optional `pypdf` text heuristics; full vision OCR deferred
- **Validation:** integer kuruş math — `net + sum(vat) == gross`; duplicate upload → HTTP 409
- **API:** `POST .../invoices/efatura/draft` (multipart), `GET .../invoices/drafts`, `GET .../invoices/drafts/{id}`
- **Storage:** `adapters/storage/local.py` → `data/uploads/{entity_id}/{fingerprint}.{ext}`
- **Alembic:** `008_invoice_drafts`
- **70 pytest** green
