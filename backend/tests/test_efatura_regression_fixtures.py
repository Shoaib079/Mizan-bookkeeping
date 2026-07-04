"""Real-world e-Fatura PDF regression corpus (POST_LAUNCH_PLAN IC-B)."""

from __future__ import annotations

from pathlib import Path

import pytest

from app.adapters.ocr_ai.efatura import extract_efatura_pdf
from app.core.delivery.commission_detect import classify_efatura_intake
from app.features.invoices.models import InvoiceKind
from tests.fixtures.efatura.regression_constants import (
    REGRESSION_FIXTURE_BUYER_VKN,
    TURKTELEKOM_OIV_55,
)

FIXTURES = Path(__file__).resolve().parent / "fixtures" / "efatura" / "regression"

REGRESSION_CASES = (
    pytest.param("24.pdf", InvoiceKind.DELIVERY_COMMISSION.value, id="trendyol-commission"),
    pytest.param("54.pdf", InvoiceKind.DELIVERY_COMMISSION.value, id="yemeksepeti-commission"),
    pytest.param("57.pdf", InvoiceKind.DELIVERY_COMMISSION.value, id="migros-commission"),
    pytest.param("58.pdf", InvoiceKind.DELIVERY_COMMISSION.value, id="getir-commission"),
    pytest.param(
        "getir_supply.pdf",
        InvoiceKind.SUPPLIER.value,
        id="getir-supply",
    ),
    pytest.param(
        "migros_supply_13.pdf",
        InvoiceKind.SUPPLIER.value,
        id="migros-supply-feb",
    ),
    pytest.param(
        "trendyol_retail_17.pdf",
        InvoiceKind.SUPPLIER.value,
        id="trendyol-retail-feb",
    ),
)

TURKTELEKOM_FIXTURE = FIXTURES / "turktelekom_oiv_55.pdf"


@pytest.mark.parametrize("filename,expected_kind", REGRESSION_CASES)
def test_regression_fixture_classification(filename: str, expected_kind: str) -> None:
    pdf_bytes = (FIXTURES / filename).read_bytes()
    extraction = extract_efatura_pdf(
        pdf_bytes, buyer_vkn=REGRESSION_FIXTURE_BUYER_VKN
    )
    text = extraction.raw.get("text_sample") if extraction.raw else None
    classification = classify_efatura_intake(extraction, pdf_text=text)
    assert classification.invoice_kind == expected_kind
    if expected_kind == InvoiceKind.DELIVERY_COMMISSION.value:
        assert classification.confidence == "high"


@pytest.mark.skipif(
    not TURKTELEKOM_FIXTURE.exists(),
    reason="turktelekom_oiv_55.pdf fixture not placed yet",
)
def test_turktelekom_oiv_55_amounts() -> None:
    """Türk Telekom bill with ÖİV — net + KDV + ÖİV = gross."""
    pdf_bytes = TURKTELEKOM_FIXTURE.read_bytes()
    extraction = extract_efatura_pdf(
        pdf_bytes, buyer_vkn=REGRESSION_FIXTURE_BUYER_VKN
    )
    expected = TURKTELEKOM_OIV_55
    assert extraction.invoice_number == expected["invoice_number"]
    assert extraction.invoice_date == expected["invoice_date"]
    assert extraction.supplier_vkn == expected["supplier_vkn"]
    assert extraction.net_kurus == expected["net_kurus"]
    assert extraction.gross_kurus == expected["gross_kurus"]
    assert extraction.other_taxes_kurus == expected["other_taxes_kurus"]
    assert (
        extraction.net_kurus
        + sum(v["vat_kurus"] for v in extraction.vat_breakdown)
        + extraction.other_taxes_kurus
        == extraction.gross_kurus
    )
