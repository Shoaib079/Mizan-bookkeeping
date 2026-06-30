"""Spice Corner e-Fatura classification fixtures (POST_LAUNCH_PLAN IC-B)."""

from __future__ import annotations

from pathlib import Path

import pytest

from app.adapters.ocr_ai.efatura import extract_efatura_pdf
from app.core.delivery.commission_detect import classify_efatura_intake
from app.features.invoices.models import InvoiceKind

FIXTURES = Path(__file__).resolve().parent / "fixtures" / "efatura" / "spice_corner"
BUYER_VKN = "7342656849"

SPICE_CORNER_CASES = (
    pytest.param("24.pdf", InvoiceKind.DELIVERY_COMMISSION.value, id="trendyol-commission"),
    pytest.param("54.pdf", InvoiceKind.DELIVERY_COMMISSION.value, id="yemeksepeti-commission"),
    pytest.param("57.pdf", InvoiceKind.DELIVERY_COMMISSION.value, id="migros-commission"),
    pytest.param("58.pdf", InvoiceKind.DELIVERY_COMMISSION.value, id="getir-commission"),
    pytest.param(
        "getir_supply.pdf",
        InvoiceKind.SUPPLIER.value,
        id="getir-supply",
    ),
)


@pytest.mark.parametrize("filename,expected_kind", SPICE_CORNER_CASES)
def test_spice_corner_fixture_classification(filename: str, expected_kind: str) -> None:
    pdf_bytes = (FIXTURES / filename).read_bytes()
    extraction = extract_efatura_pdf(pdf_bytes, buyer_vkn=BUYER_VKN)
    text = extraction.raw.get("text_sample") if extraction.raw else None
    classification = classify_efatura_intake(extraction, pdf_text=text)
    assert classification.invoice_kind == expected_kind
    if expected_kind == InvoiceKind.DELIVERY_COMMISSION.value:
        assert classification.confidence == "high"
