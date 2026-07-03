"""IE-A — PDF upload intake routes extraction failures to needs_review."""

from __future__ import annotations

from pathlib import Path

import pytest

from app.adapters.ocr_ai.efatura import extract_efatura_pdf_for_intake
from tests.test_efatura_pdf_heuristics import METRO_PDF_SNIPPET

NO_TEXT_PDF = b"""%PDF-1.4
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj
3 0 obj<</Type/Page/MediaBox[0 0 3 3]/Parent 2 0 R>>endobj
xref
0 4
0000000000 65535 f 
0000000009 00000 n 
0000000052 00000 n 
0000000101 00000 n 
trailer<</Size 4/Root 1 0 R>>
startxref
149
%%EOF"""

PARTIAL_LAYOUT_SNIPPET = """
ACME SUPPLY LTD
VKN: 1234567890
Fatura No: PART-2026-01
Random body text without totals or dates.
"""


def test_no_text_pdf_intake_returns_review_reason() -> None:
    result = extract_efatura_pdf_for_intake(NO_TEXT_PDF)
    assert result.review_reason == "pdf_no_text_layer"
    assert result.extraction.invoice_number == ""
    assert result.extraction.net_kurus == 0
    assert result.extraction.gross_kurus == 0


def test_upload_no_text_pdf_creates_needs_review_draft(client, restaurant_a) -> None:
    response = client.post(
        f"/entities/{restaurant_a.id}/invoices/efatura/draft",
        files={"file": ("blank.pdf", NO_TEXT_PDF, "application/pdf")},
    )
    assert response.status_code == 201
    body = response.json()
    assert body["status"] == "needs_review"
    assert "pdf_no_text_layer" in body["review_reason"]
    assert body["has_stored_document"] is True
    assert Path(body["extraction_payload"]["stored_path"]).is_file()


def test_upload_partial_layout_pdf_creates_needs_review_with_fields(
    client, restaurant_a, monkeypatch
) -> None:
    monkeypatch.setattr(
        "app.adapters.ocr_ai.efatura._extract_pdf_text",
        lambda _content: (PARTIAL_LAYOUT_SNIPPET, "pypdf"),
    )
    response = client.post(
        f"/entities/{restaurant_a.id}/invoices/efatura/draft",
        files={"file": ("partial.pdf", b"%PDF-1.4 partial", "application/pdf")},
    )
    assert response.status_code == 201
    body = response.json()
    assert body["status"] == "needs_review"
    assert "pdf_fields_missing" in body["review_reason"]
    assert body["invoice_number"] == "PART-2026-01"
    assert body["supplier_vkn"] == "1234567890"
    assert body["has_stored_document"] is True


def test_assumed_vat_pdf_needs_review_and_blocks_one_click(
    client, restaurant_a, monkeypatch
) -> None:
    monkeypatch.setattr(
        "app.adapters.ocr_ai.efatura._extract_pdf_text",
        lambda _content: (METRO_PDF_SNIPPET, "pypdf"),
    )
    response = client.post(
        f"/entities/{restaurant_a.id}/invoices/efatura/draft",
        files={"file": ("metro.pdf", b"%PDF-1.4 metro", "application/pdf")},
    )
    assert response.status_code == 201
    body = response.json()
    assert body["status"] == "needs_review"
    assert "pdf_assumed_vat" in body["review_reason"]
    assert body["classification_confidence"] == "low"
    assert body["one_click_post_eligible"] is False


def test_metro_assumed_vat_heuristic_review_reason() -> None:
    from app.adapters.ocr_ai.efatura import _parse_pdf_heuristics, _pdf_heuristic_review_reason

    extraction = _parse_pdf_heuristics(METRO_PDF_SNIPPET)
    assert _pdf_heuristic_review_reason(extraction) == "pdf_assumed_vat"


@pytest.mark.parametrize(
    "exc_message,missing,expected",
    [
        ("Could not find invoice date in PDF text", ["invoice_date"], "pdf_fields_missing:invoice_date"),
        ("PDF contains no extractable text", [], "pdf_no_text_layer"),
    ],
)
def test_pdf_intake_failure_reason(exc_message, missing, expected) -> None:
    from app.adapters.ocr_ai.efatura import (
        EfaturaPdfUnsupportedError,
        _pdf_intake_failure_reason,
    )

    exc = EfaturaPdfUnsupportedError(exc_message)
    assert _pdf_intake_failure_reason(exc, missing) == expected
