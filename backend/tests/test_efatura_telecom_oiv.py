"""Telecom/utility e-Fatura extraction — KDV Matrah pattern, ÖİV, supplier VKN heuristics."""

from __future__ import annotations

from datetime import date
from pathlib import Path

import pytest

from app.adapters.ocr_ai.efatura import (
    EInvoiceExtraction,
    _amount_to_kurus,
    _normalize_tr_amount,
    _parse_pdf_heuristics,
    _supplier_name_from_pdf,
    _supplier_vkn_from_pdf,
    extract_efatura_pdf,
    sanitize_supplier_name,
)
from app.features.invoices.validation import (
    InvoiceTotalsError,
    validate_invoice_totals,
)
from tests.fixtures.efatura.regression_constants import (
    REGRESSION_FIXTURE_BUYER_VKN,
    TURKTELEKOM_OIV_55,
)

FIXTURES = Path(__file__).resolve().parent / "fixtures" / "efatura" / "regression"


# --- validate_invoice_totals with other_taxes ---

def test_validate_totals_with_other_taxes_passes() -> None:
    breakdown = [{"rate_percent": 20, "base_kurus": 66077, "vat_kurus": 13215}]
    validate_invoice_totals(66077, 85900, breakdown, other_taxes_kurus=6608)


def test_validate_totals_with_other_taxes_rejects_bad_math() -> None:
    breakdown = [{"rate_percent": 20, "base_kurus": 66077, "vat_kurus": 13215}]
    with pytest.raises(InvoiceTotalsError):
        validate_invoice_totals(66077, 85900, breakdown, other_taxes_kurus=0)


def test_validate_totals_backwards_compatible_without_other_taxes() -> None:
    breakdown = [{"rate_percent": 20, "base_kurus": 10000, "vat_kurus": 2000}]
    validate_invoice_totals(10000, 12000, breakdown)


# --- KDV Matrah pattern parsing ---

TELECOM_TEXT_FRAGMENT = """\
e-Fatura
Fatura No: A162026001298705
Fatura Tarihi: 28.02.2026
Türk Telekomünikasyon A.Ş.
Vergi Numarası: 8590491872
SAYIN
Vergi Numarası: 7342656849
KDV %20 (Matrah 660,77 ) 132,15
ÖİV %10 (Matrah 660,77 ) 66,08
Vergiler Dahil Toplam Tutar 859,00
"""


def test_kdv_matrah_pattern_extracts_net_and_vat() -> None:
    extraction = _parse_pdf_heuristics(
        TELECOM_TEXT_FRAGMENT, buyer_vkn=REGRESSION_FIXTURE_BUYER_VKN
    )
    assert extraction.net_kurus == 66077
    assert extraction.vat_breakdown == [
        {"rate_percent": 20.0, "base_kurus": 66077, "vat_kurus": 13215}
    ]


def test_oiv_parsed_into_other_taxes_kurus() -> None:
    extraction = _parse_pdf_heuristics(
        TELECOM_TEXT_FRAGMENT, buyer_vkn=REGRESSION_FIXTURE_BUYER_VKN
    )
    assert extraction.other_taxes_kurus == 6608


def test_telecom_totals_validate() -> None:
    extraction = _parse_pdf_heuristics(
        TELECOM_TEXT_FRAGMENT, buyer_vkn=REGRESSION_FIXTURE_BUYER_VKN
    )
    assert extraction.net_kurus + sum(
        v["vat_kurus"] for v in extraction.vat_breakdown
    ) + extraction.other_taxes_kurus == extraction.gross_kurus


def test_telecom_gross_extracted() -> None:
    extraction = _parse_pdf_heuristics(
        TELECOM_TEXT_FRAGMENT, buyer_vkn=REGRESSION_FIXTURE_BUYER_VKN
    )
    assert extraction.gross_kurus == 85900


def test_telecom_invoice_number_and_date() -> None:
    extraction = _parse_pdf_heuristics(
        TELECOM_TEXT_FRAGMENT, buyer_vkn=REGRESSION_FIXTURE_BUYER_VKN
    )
    assert extraction.invoice_number == "A162026001298705"
    assert extraction.invoice_date == date(2026, 2, 28)


# --- Supplier VKN heuristics: multi-VKN with checksum ---

def test_supplier_vkn_prefers_checksum_valid_when_multiple_others() -> None:
    """When buyer is known, among 2+ non-buyer VKNs, return the checksum-valid one."""
    text = """\
Unvan: ACME TELEKOMÜNİKASYON A.Ş.
Vergi Numarası: 8590491872
Şube VKN: 1111111111
SAYIN
VKN/TCKN: 7342656849
"""
    result = _supplier_vkn_from_pdf(text, buyer_vkn="7342656849")
    assert result == "8590491872"


def test_supplier_vkn_returns_only_non_buyer_from_single_other() -> None:
    text = """\
Vergi Numarası: 8590491872
SAYIN
VKN/TCKN: 7342656849
"""
    result = _supplier_vkn_from_pdf(text, buyer_vkn="7342656849")
    assert result == "8590491872"


def test_supplier_vkn_from_telecom_fragment() -> None:
    result = _supplier_vkn_from_pdf(
        TELECOM_TEXT_FRAGMENT, buyer_vkn=REGRESSION_FIXTURE_BUYER_VKN
    )
    assert result == "8590491872"


# --- EInvoiceExtraction has other_taxes_kurus ---

def test_extraction_dataclass_other_taxes_default() -> None:
    extraction = EInvoiceExtraction(
        supplier_name=None,
        supplier_vkn=None,
        invoice_number="X",
        invoice_date=date.today(),
        net_kurus=0,
        gross_kurus=0,
        vat_breakdown=[],
    )
    assert extraction.other_taxes_kurus == 0


# --- Fixture PDF test (requires turktelekom_oiv_55.pdf) ---

FIXTURE_PDF = FIXTURES / "turktelekom_oiv_55.pdf"


@pytest.mark.skipif(
    not FIXTURE_PDF.exists(),
    reason="turktelekom_oiv_55.pdf fixture not placed yet",
)
def test_turktelekom_oiv_55_supplier_name_not_buyer_fragment() -> None:
    """TTNET seller name must come from header/VKN — never the buyer legal suffix."""
    pdf_bytes = FIXTURE_PDF.read_bytes()
    extraction = extract_efatura_pdf(
        pdf_bytes, buyer_vkn=REGRESSION_FIXTURE_BUYER_VKN
    )
    assert extraction.supplier_vkn == "8590491872"
    assert extraction.supplier_name in (None, "TTNET ANONIM SIRKETI")
    if extraction.supplier_name is not None:
        assert "TİCARET LİMİTED" not in extraction.supplier_name
        assert "REMBETİKO" not in extraction.supplier_name.upper()


def test_ttnet_supplier_name_anchored_to_seller_vkn() -> None:
    snippet = """\
TTNET ANONIM SIRKETI
Gayrettepe Mahallesi Vefa Bayırı Sokak
Vergi Numarası: 8590491872
SAYIN
REMBETİKO TURİZM RESTORAN İŞLETMECİLİĞİ SANAYİ VE
TİCARET LİMİTED ŞİRKETİ
VKN: 7342656849
"""
    name = _supplier_name_from_pdf(
        snippet,
        buyer_vkn=REGRESSION_FIXTURE_BUYER_VKN,
        supplier_vkn="8590491872",
    )
    assert name == "TTNET ANONIM SIRKETI"


def test_sanitize_rejects_buyer_legal_suffix_only() -> None:
    buyer = "REMBETİKO TURİZM RESTORAN İŞLETMECİLİĞİ SANAYİ VE TİCARET LİMİTED ŞİRKETİ"
    assert sanitize_supplier_name("TİCARET LİMİTED ŞİRKETİ", buyer_names=(buyer,)) is None
    assert sanitize_supplier_name("TİCARET LİMİTED ŞİRKETİ") is None


@pytest.mark.skipif(
    not FIXTURE_PDF.exists(),
    reason="turktelekom_oiv_55.pdf fixture not placed yet",
)
def test_turktelekom_oiv_55_fixture_extraction() -> None:
    from app.adapters.ocr_ai.efatura import extract_efatura_pdf

    pdf_bytes = FIXTURE_PDF.read_bytes()
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
    assert extraction.vat_breakdown == expected["vat_breakdown"]


@pytest.mark.skipif(
    not FIXTURE_PDF.exists(),
    reason="turktelekom_oiv_55.pdf fixture not placed yet",
)
def test_turktelekom_oiv_55_supplier_vkn_with_pymupdf() -> None:
    """Supplier VKN must resolve regardless of PyMuPDF vs pypdf text ordering."""
    from app.adapters.ocr_ai.efatura import _extract_pdf_text

    pdf_bytes = FIXTURE_PDF.read_bytes()
    text, extractor = _extract_pdf_text(pdf_bytes)
    result = _supplier_vkn_from_pdf(text, buyer_vkn=REGRESSION_FIXTURE_BUYER_VKN)
    assert result == "8590491872", (
        f"supplier_vkn should be 8590491872 but got {result!r} "
        f"(extractor={extractor})"
    )
