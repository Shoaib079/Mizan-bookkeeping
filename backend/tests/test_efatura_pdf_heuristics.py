"""Turkish e-Fatura PDF text heuristics — Metro-style layouts."""

from __future__ import annotations

from datetime import date

import pytest

from app.adapters.ocr_ai.efatura import (
    EfaturaPdfUnsupportedError,
    _buyer_vkn_from_pdf,
    _parse_pdf_heuristics,
    _parse_pdf_tr_date,
    _supplier_name_from_pdf,
    _supplier_vkn_from_pdf,
)

# Snippet from a real Metro wholesale PDF (pypdf text); apostrophe is U+2019.
METRO_PDF_SNIPPET = """
METRO GROSMARKET B.KÖY ALIS.HIZ.TIC.LTD.STI.      PENDIK DC
FATURA NUMARASI:    7B92026000094788
Oluşturma Tarihi     18.06.2026 20:43
Fiili Sevk Tarihi    18.06.2026 20:44
Büyük Mükellefler V.D.                            Fax: (0216) 5819032 6200031354
Mersis No:  www.metro-tr.com   e-FATURA                      6/0(077)0777/095021
Sevkiyat
REMBETİKO TURİZM RESTORANT
VERGİ N/D: 7342656849 / KADIKÖY
KDV\u2019Siz Toplam      15.453,23
Brüt Toplam     15.820,15
"""


def test_parse_metro_style_pdf_snippet() -> None:
    extraction = _parse_pdf_heuristics(METRO_PDF_SNIPPET)

    assert extraction.invoice_number == "7B92026000094788"
    assert extraction.invoice_date == date(2026, 6, 18)
    assert extraction.net_kurus == 1_545_323
    assert extraction.gross_kurus == 1_582_015
    assert extraction.supplier_vkn == "6200031354"
    assert extraction.raw.get("assumed_vat") is True


def test_metro_supplier_vkn_excludes_buyer_vergi_nd() -> None:
    assert _supplier_vkn_from_pdf(METRO_PDF_SNIPPET) == "6200031354"
    assert (
        _supplier_vkn_from_pdf(METRO_PDF_SNIPPET, buyer_vkn="7342656849")
        == "6200031354"
    )


# Inverted GİB portal PDF: pypdf reads SAYIN/buyer before Metro seller block (metr.pdf).
METR_INVERTED_SNIPPET = """
SAYIN
REMBETİKO TURİZM RESTORANT
KÖRLER SK.
34714 / KADIKÖY
Vergi Dairesi: KADIKÖY
MUSTERINO: 25 701643
VKN: 7342656849
Fatura No:7B92026000080926
Fatura Tarihi:25-05-2026
METRO GROSMARKET BAKIRKÖY ALIŞVERİŞ HİZMETLERİ TİC.
LTD. ŞTİ.
Vergi Dairesi: BÜYÜK MÜKELLEFLER
MERSISNO: 0620003135400138
VKN: 6200031354
Mal Hizmet Toplam Tutarı14.078,09 TL
Vergiler Dahil Toplam Tutar14.218,87 TL
"""


def test_metr_inverted_layout_buyer_vkn_before_seller() -> None:
    assert _buyer_vkn_from_pdf(METR_INVERTED_SNIPPET) == "7342656849"
    assert _supplier_vkn_from_pdf(METR_INVERTED_SNIPPET) == "6200031354"
    assert (
        _supplier_vkn_from_pdf(METR_INVERTED_SNIPPET, buyer_vkn="7342656849")
        == "6200031354"
    )


def test_metr_inverted_layout_supplier_name() -> None:
    name = _supplier_name_from_pdf(METR_INVERTED_SNIPPET)
    assert name is not None
    assert "METRO GROSMARKET" in name
    assert "BAKIRKÖY" in name


def test_parse_metr_inverted_snippet() -> None:
    extraction = _parse_pdf_heuristics(METR_INVERTED_SNIPPET, buyer_vkn="7342656849")
    assert extraction.invoice_number == "7B92026000080926"
    assert extraction.invoice_date == date(2026, 5, 25)
    assert extraction.supplier_vkn == "6200031354"
    assert extraction.supplier_name is not None
    assert "METRO GROSMARKET" in extraction.supplier_name
    assert extraction.net_kurus == 1_407_809
    assert extraction.gross_kurus == 1_421_887


@pytest.mark.parametrize(
    ("text", "expected"),
    [
        ("Fatura Tarihi: 01.03.2026", date(2026, 3, 1)),
        ("Fatura Tarih 02/04/2026", date(2026, 4, 2)),
        ("Oluşturma Tarihi     18.06.2026 20:43", date(2026, 6, 18)),
        ("Olusturma Tarihi: 05-07-2026", date(2026, 7, 5)),
        ("Fiili Sevkiyat Tarihi: 10.08.2026", date(2026, 8, 10)),
        ("Fatura Tarihi:26- 01- 2026", date(2026, 1, 26)),
        (
            "Bir Sonraki Fatura Tarihi : 28/02/2026\nFatura Tarihi: 31-01-2026 23:59",
            date(2026, 1, 31),
        ),
    ],
)
def test_parse_pdf_tr_date_labels(text: str, expected: date) -> None:
    assert _parse_pdf_tr_date(text) == expected


def test_parse_pdf_tr_date_missing_raises() -> None:
    with pytest.raises(EfaturaPdfUnsupportedError, match="invoice date"):
        _parse_pdf_tr_date("FATURA NUMARASI: ABC123")


YEMEKSEPETI_HEADER = """
Yemek Sepeti Elektronik İletişim Perakende Gıda Anonim Şirketi
Vergi Dairesi: BOĞAZİÇİ KURUMLAR
VKN: 9470457468
SAYIN
REMBETİKO TURİZM RESTORAN İŞLETMECİLİĞİ SANAYİ VE TİCARET LİMİTED ŞİRKETİ
Vergi Dairesi: Kadıköy
VKN: 7342656849
Fatura No M022026000003730
Fatura Tarihi 07.01.2026 - 12:11:29
Mal/Hizmet Toplam Tutarı 21.595,55 TL
Vergiler Dahil Toplam Tutar 25.914,66 TL
"""

MIGROS_INVERTED = """
Malzeme / Hizmet Toplam Tutarı216,15 TL
Vergiler Dahil Toplam Tutar259,38 TL
SAYIN
REMBETİKO TURİZM RESTORAN
Vergi Dairesi: KADIKÖY
VKN: 7342656849
Fatura No:DPG2026000011163
Fatura Tarihi:07-01-2026 - 20:59
DİJİTAL PLATFORM GIDA HİZMETLERİ ANONİM ŞİRKETİ
Vergi Dairesi: KOZYATAĞI VERGİ DAİRESİ MD
VKN: 2951116113
"""


def test_supplier_vkn_before_sayin_yemeksepeti() -> None:
    assert _supplier_vkn_from_pdf(YEMEKSEPETI_HEADER) == "9470457468"


def test_supplier_vkn_inverted_migros_layout() -> None:
    assert _supplier_vkn_from_pdf(MIGROS_INVERTED) == "2951116113"


def test_supplier_vkn_excludes_entity_buyer_vkn() -> None:
    snippet = """
MİGROS TİCARET A.Ş.
Vergi Numarası: 6220529513
REMBETİKO TURİZM RESTORAN
Vergi Numarası: 7342656849
Fatura No M123
Fatura Tarihi 01.01.2026
Mal/Hizmet Toplam Tutarı 100,00 TL
Vergiler Dahil Toplam Tutar 120,00 TL
"""
    assert (
        _supplier_vkn_from_pdf(snippet, buyer_vkn="7342656849") == "6220529513"
    )


def test_parse_migros_malzeme_net_label() -> None:
    extraction = _parse_pdf_heuristics(MIGROS_INVERTED)
    assert extraction.net_kurus == 21_615
    assert extraction.gross_kurus == 25_938
    assert extraction.invoice_number == "DPG2026000011163"


MIGROS_SUPPLY_TOTALS = """
Fatura No: MIG202600000013
Fatura Tarihi: 11.02.2026
MİGROS TİCARET A.Ş.
Vergi Numarası: 6220529513
REMBETİKO TURİZM RESTORAN
Vergi Numarası: 7342656849
ARA TOPLAM : 1877.16
FATURA TOPLAMI :1877.16
TOPLAM KDV :18.59
K.D.V. MATRAHI % 1 :1858.57
K.D.V. % 1 :18.59
"""


def test_parse_migros_supply_fatura_toplami_layout() -> None:
    extraction = _parse_pdf_heuristics(MIGROS_SUPPLY_TOTALS, buyer_vkn="7342656849")
    assert extraction.net_kurus == 185_857
    assert extraction.gross_kurus == 187_716
    assert extraction.vat_breakdown[0]["rate_percent"] == 1.0
    assert extraction.supplier_vkn == "6220529513"


TRENDYOL_RETAIL_TOTALS = """
FATURA NO: TYE2026000000256
FATURA TARİHİ: 12- 02- 2026
VKN:7342656849
ARA TUTAR 1.020,83TL
TOPLAM İSKONTO 50,00TL
HESAPLANAN KDV(%20.0)194,17TL
TOPLAM TUTAR 1.165,00TL
ÖDENECEK TUTAR1.165,00TL
VKN: 8590921777
"""


def test_parse_trendyol_retail_ara_tutar_layout() -> None:
    extraction = _parse_pdf_heuristics(TRENDYOL_RETAIL_TOTALS, buyer_vkn="7342656849")
    assert extraction.invoice_number == "TYE2026000000256"
    assert extraction.invoice_date == date(2026, 2, 12)
    assert extraction.net_kurus == 97_083
    assert extraction.gross_kurus == 116_500
    assert extraction.supplier_vkn == "8590921777"
