"""Telecom/utility e-Fatura extraction — KDV Matrah pattern, ÖİV, supplier VKN heuristics."""

from __future__ import annotations

from datetime import date
from pathlib import Path

import pytest

from app.adapters.ocr_ai.efatura import (
    EInvoiceExtraction,
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
    TTMOBIL_NEXT_DUE_DATE_62,
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


# --- TT Mobil: the invoice that posted itself into the future ---


def _ttmobil() -> EInvoiceExtraction:
    from app.adapters.ocr_ai.efatura import extract_efatura_pdf_for_intake

    path = FIXTURES / "ttmobil_next_due_date_62.pdf"
    return extract_efatura_pdf_for_intake(path.read_bytes()).extraction


def test_ttmobil_takes_the_invoice_date_not_the_next_due_date() -> None:
    """The document reads "Fatura Tarihi: 31-07-2026". It was read as
    16/09/2026 — the value of "Bir Sonraki Son Ödeme Fatura Tarihi".

    The old guard looked back a fixed 24 characters for "Sonraki", which
    catches "Bir Sonraki Fatura Tarihi" and misses this one: "Son Ödeme"
    sits in between and pushes the word out of the window. The wrong label
    also appears *above* the right one, and the scan takes the first match it
    accepts.
    """
    assert _ttmobil().invoice_date == TTMOBIL_NEXT_DUE_DATE_62["invoice_date"]


def test_ttmobil_reads_the_printed_kdv_rather_than_assuming_one() -> None:
    """585,75 was booked as reclaimable VAT where the document says 185,83.

    This layout writes "KDV (20%) (Matrah 929.13 TL )" with the amount on the
    next line; the reader only knew "KDV %20 (Matrah 929,13) 132,15". Missing
    both tax lines, it assumed a single 20% line covering everything between
    net and gross — which swept up the communication tax and a radio licence
    fee and called them input KDV.
    """
    extraction = _ttmobil()
    vat = sum(line["vat_kurus"] for line in extraction.vat_breakdown)
    assert vat == 18583, f"reclaimed {vat} kuruş of VAT; the invoice says 18583"
    assert vat != 58575, "still assuming one VAT line for every tax on the page"


def test_ttmobil_keeps_the_communication_tax_out_of_vat() -> None:
    """Özel İletişim Vergisi is not reclaimable. Counted as VAT it overstates
    the input KDV on the return."""
    assert _ttmobil().other_taxes_kurus == 9291


def test_ttmobil_totals_add_up() -> None:
    """net + VAT + other taxes = the printed total. The arithmetic is what
    makes the three numbers above trustworthy together rather than separately.
    """
    e = _ttmobil()
    vat = sum(line["vat_kurus"] for line in e.vat_breakdown)
    assert e.net_kurus + vat + e.other_taxes_kurus == e.gross_kurus == 150450


def test_ttmobil_supplier_and_number() -> None:
    e = _ttmobil()
    assert e.supplier_vkn == TTMOBIL_NEXT_DUE_DATE_62["supplier_vkn"]
    assert e.invoice_number == TTMOBIL_NEXT_DUE_DATE_62["invoice_number"]
