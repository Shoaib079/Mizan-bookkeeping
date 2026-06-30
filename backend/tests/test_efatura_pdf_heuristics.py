"""Turkish e-Fatura PDF text heuristics — Metro-style layouts."""

from __future__ import annotations

from datetime import date

import pytest

from app.adapters.ocr_ai.efatura import (
    EfaturaPdfUnsupportedError,
    _parse_pdf_heuristics,
    _parse_pdf_tr_date,
    _supplier_vkn_from_pdf,
)

# Snippet from a real Metro wholesale PDF (pypdf text); apostrophe is U+2019.
METRO_PDF_SNIPPET = """
METRO GROSMARKET B.KÖY ALIS.HIZ.TIC.LTD.STI.      PENDIK DC
FATURA NUMARASI:    7B92026000094788
Oluşturma Tarihi     18.06.2026 20:43
Fiili Sevk Tarihi    18.06.2026 20:44
e-FATURA                      6/0(077)0777/095021
KDV\u2019Siz Toplam      15.453,23
Brüt Toplam     15.820,15
"""


def test_parse_metro_style_pdf_snippet() -> None:
    extraction = _parse_pdf_heuristics(METRO_PDF_SNIPPET)

    assert extraction.invoice_number == "7B92026000094788"
    assert extraction.invoice_date == date(2026, 6, 18)
    assert extraction.net_kurus == 1_545_323
    assert extraction.gross_kurus == 1_582_015


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


def test_parse_migros_malzeme_net_label() -> None:
    extraction = _parse_pdf_heuristics(MIGROS_INVERTED)
    assert extraction.net_kurus == 21_615
    assert extraction.gross_kurus == 25_938
    assert extraction.invoice_number == "DPG2026000011163"
