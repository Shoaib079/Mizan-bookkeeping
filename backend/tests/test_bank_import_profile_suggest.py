"""Tests for heuristic bank import profile suggestion."""

from __future__ import annotations

from app.adapters.bank_parsers.profile_suggest import suggest_import_profile
from app.adapters.bank_parsers.raw_grid import read_raw_grid
from app.features.banking import import_profiles as import_profile_service

TR_CSV = """junk1
junk2
junk3
junk4
junk5
junk6
junk7
Tarih,Aciklama,Referans,Borc,Alacak
01.02.2026,Odeme tedarikci,REF-OUT,"100,00",
02.02.2026,Musteri tahsilat,REF-IN,,"250,50"
"""


def test_suggest_tr_style_debit_credit_profile() -> None:
    grid = read_raw_grid(TR_CSV.encode(), original_filename="tr.csv")
    suggested = suggest_import_profile(grid)
    assert suggested is not None
    assert suggested.header_row == 8
    assert suggested.data_start_row == 9
    assert suggested.date_col == 0
    assert suggested.description_col == 1
    assert suggested.reference_col == 2
    assert suggested.debit_col == 3
    assert suggested.credit_col == 4
    assert suggested.amount_col is None
    assert suggested.date_format == "DD.MM.YYYY"


def test_preview_includes_suggested_profile() -> None:
    preview = import_profile_service.preview_statement_upload(
        TR_CSV.encode(),
        original_filename="tr.csv",
    )
    assert preview.suggested_profile is not None
    assert preview.suggested_profile.header_row == 8
    assert preview.suggested_profile.debit_col == 3
    assert preview.suggested_profile.credit_col == 4
    assert len(preview.rows) == 10
    assert preview.total_rows == 10


def test_preview_returns_up_to_fifty_rows() -> None:
    lines = ["junk"] * 55 + ["Tarih,Tutar", "01.02.2026,100"]
    preview = import_profile_service.preview_statement_upload(
        "\n".join(lines).encode(),
        original_filename="tr.csv",
    )
    assert len(preview.rows) == 50
    assert preview.total_rows == 57


def test_suggest_signed_amount_column() -> None:
    csv = """meta
Tarih,Aciklama,Tutar
01.02.2026,Test odeme,"-100,00"
"""
    grid = read_raw_grid(csv.encode(), original_filename="tr.csv")
    suggested = suggest_import_profile(grid)
    assert suggested is not None
    assert suggested.header_row == 2
    assert suggested.amount_col == 2
    assert suggested.debit_col is None
    assert suggested.credit_col is None


def test_suggest_returns_none_for_unrecognized_grid() -> None:
    grid = [["only", "junk"], ["no", "headers"]]
    assert suggest_import_profile(grid) is None
