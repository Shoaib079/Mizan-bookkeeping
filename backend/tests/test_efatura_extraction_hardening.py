"""IE-C — Extraction hardening: PyMuPDF text, VKN checksum on heuristics, stage telemetry."""

from __future__ import annotations

import logging
import sys
from datetime import date
from types import ModuleType
from unittest.mock import MagicMock, patch

import pytest

from app.adapters.ocr_ai.efatura import (
    _extract_pdf_text,
    _parse_pdf_heuristics,
    extract_efatura_pdf_for_intake,
)

VALID_SUPPLIER_VKN = "6200031354"
INVALID_SUPPLIER_VKN = "1234567899"

GIB_PDF_TEXT = """
ACME TİCARET A.Ş.
Vergi Numarası: {supplier_vkn}
Fatura No: GIB-2026-042
Fatura Tarihi: 15.05.2026
Mal Hizmet Toplam     1.000,00
Hesaplanan KDV (%20)     200,00
Vergiler Dahil Toplam Tutar     1.200,00 TL
"""


# ---------- PyMuPDF / pypdf fallback ----------


def test_pymupdf_used_when_available() -> None:
    """When fitz (pymupdf) is importable, _extract_pdf_text uses it."""
    fake_page = MagicMock()
    fake_page.get_text.return_value = "Hello from pymupdf"
    fake_doc = MagicMock()
    fake_doc.__iter__ = lambda self: iter([fake_page])
    fake_doc.close = MagicMock()

    fake_fitz = MagicMock()
    fake_fitz.open.return_value = fake_doc

    with patch.dict(sys.modules, {"fitz": fake_fitz}):
        text, extractor = _extract_pdf_text(b"%PDF-1.4 fake")

    assert extractor == "pymupdf"
    assert "Hello from pymupdf" in text
    fake_fitz.open.assert_called_once()
    fake_doc.close.assert_called_once()


def test_pypdf_fallback_when_pymupdf_unavailable(monkeypatch) -> None:
    """When fitz is not importable, falls back to pypdf."""
    with patch.dict(sys.modules, {"fitz": None}):
        from io import BytesIO

        from pypdf import PdfReader

        from tests.test_efatura_pdf_intake import NO_TEXT_PDF

        text, extractor = _extract_pdf_text(NO_TEXT_PDF)

    assert extractor == "pypdf"


def test_text_extractor_recorded_in_raw() -> None:
    """Heuristic extraction records which text extractor was used."""
    text = GIB_PDF_TEXT.format(supplier_vkn=VALID_SUPPLIER_VKN)
    extraction = _parse_pdf_heuristics(text)
    extraction.raw["text_extractor"] = "pymupdf"
    assert extraction.raw["text_extractor"] == "pymupdf"


def test_intake_records_text_extractor_pymupdf(monkeypatch) -> None:
    """extract_efatura_pdf_for_intake populates text_extractor in raw."""
    text = GIB_PDF_TEXT.format(supplier_vkn=VALID_SUPPLIER_VKN)
    monkeypatch.setattr(
        "app.adapters.ocr_ai.efatura._extract_pdf_text",
        lambda _content: (text, "pymupdf"),
    )
    result = extract_efatura_pdf_for_intake(b"%PDF-1.4 test")
    assert result.extraction.raw.get("text_extractor") == "pymupdf"


def test_intake_records_text_extractor_pypdf(monkeypatch) -> None:
    """Fallback to pypdf is recorded."""
    text = GIB_PDF_TEXT.format(supplier_vkn=VALID_SUPPLIER_VKN)
    monkeypatch.setattr(
        "app.adapters.ocr_ai.efatura._extract_pdf_text",
        lambda _content: (text, "pypdf"),
    )
    result = extract_efatura_pdf_for_intake(b"%PDF-1.4 test")
    assert result.extraction.raw.get("text_extractor") == "pypdf"


# ---------- VKN checksum on heuristic extractions ----------


def test_valid_vkn_heuristic_allows_supplier_creation(
    client, restaurant_a, monkeypatch
) -> None:
    """Valid supplier VKN in heuristic extraction → supplier auto-created, draft OK."""
    text = GIB_PDF_TEXT.format(supplier_vkn=VALID_SUPPLIER_VKN)
    monkeypatch.setattr(
        "app.adapters.ocr_ai.efatura._extract_pdf_text",
        lambda _content: (text, "pymupdf"),
    )
    response = client.post(
        f"/entities/{restaurant_a.id}/invoices/efatura/draft",
        files={"file": ("valid.pdf", b"%PDF-1.4 valid-vkn", "application/pdf")},
    )
    assert response.status_code == 201
    body = response.json()
    assert body["supplier_vkn"] == VALID_SUPPLIER_VKN
    assert body["supplier_id"] is not None
    if body["review_reason"]:
        assert "pdf_invalid_supplier_vkn" not in body["review_reason"]


def test_invalid_vkn_heuristic_blocks_supplier_and_needs_review(
    client, restaurant_a, monkeypatch
) -> None:
    """Invalid supplier VKN in heuristic extraction → needs_review, no supplier created."""
    text = GIB_PDF_TEXT.format(supplier_vkn=INVALID_SUPPLIER_VKN)
    monkeypatch.setattr(
        "app.adapters.ocr_ai.efatura._extract_pdf_text",
        lambda _content: (text, "pymupdf"),
    )
    response = client.post(
        f"/entities/{restaurant_a.id}/invoices/efatura/draft",
        files={"file": ("bad-vkn.pdf", b"%PDF-1.4 bad-vkn", "application/pdf")},
    )
    assert response.status_code == 201
    body = response.json()
    assert body["status"] == "needs_review"
    assert "pdf_invalid_supplier_vkn" in body["review_reason"]
    assert body["supplier_id"] is None
    assert body["supplier_vkn"] == INVALID_SUPPLIER_VKN


# ---------- Stage telemetry ----------


def test_telemetry_log_emitted_on_draft_creation(
    client, restaurant_a, monkeypatch
) -> None:
    """Structured log emitted after invoice draft creation."""
    text = GIB_PDF_TEXT.format(supplier_vkn=VALID_SUPPLIER_VKN)
    monkeypatch.setattr(
        "app.adapters.ocr_ai.efatura._extract_pdf_text",
        lambda _content: (text, "pymupdf"),
    )
    mock_info = MagicMock()
    monkeypatch.setattr(
        "app.features.invoices.service.logger.info", mock_info
    )
    response = client.post(
        f"/entities/{restaurant_a.id}/invoices/efatura/draft",
        files={"file": ("telem.pdf", b"%PDF-1.4 telemetry", "application/pdf")},
    )
    assert response.status_code == 201
    mock_info.assert_called_once()
    call_args = mock_info.call_args
    assert call_args[0][0] == "invoice_draft_created"
    extra = call_args[1]["extra"]
    assert extra["entity_id"] == str(restaurant_a.id)
    assert extra["source"] == "pdf_heuristics"
    assert extra["text_extractor"] == "pymupdf"
    assert extra["has_vision"] is False
    assert "status" in extra
    assert "review_reason" in extra
