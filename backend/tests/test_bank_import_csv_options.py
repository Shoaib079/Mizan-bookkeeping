"""Turkish CSV encoding/delimiter tests for bank import profiles."""

from __future__ import annotations

from datetime import date

import pytest

from app.adapters.bank_parsers.profile_mapper import (
    BankImportProfileConfig,
    normalize_transaction_date_cell,
    parse_date_with_format,
    parse_with_profile,
)
from app.adapters.bank_parsers.raw_grid import (
    decode_csv_bytes,
    detect_csv_delimiter,
    read_raw_grid,
    resolve_csv_read_options,
)
from app.core.chart_of_accounts.seed import seed_default_chart
from app.features.banking import import_profiles as import_profile_service
from app.features.banking import service as banking_service
from app.features.banking import statements as statement_service
from app.features.banking.models import MoneyAccountKind
from app.features.banking.schema import MoneyAccountCreate

# cp1254 semicolon export with Turkish characters and trailing time on date
CP1254_CSV_TEXT = (
    "Tarih;Açıklama;Referans;Borc;Alacak\n"
    "01.02.2026 14:30;Gıda alışverişi şirketi;REF-1;1.234,56;\n"
    "02.02.2026;Müşteri tahsilatı;REF-2;;250,50\n"
)

CP1254_PROFILE = BankImportProfileConfig(
    header_row=1,
    data_start_row=2,
    date_col=0,
    description_col=1,
    reference_col=2,
    debit_col=3,
    credit_col=4,
    date_format="DD.MM.YYYY",
    decimal_format="tr",
    debit_is_outflow=True,
    csv_encoding="cp1254",
    csv_delimiter=";",
)

COMMA_PROFILE = BankImportProfileConfig(
    header_row=1,
    data_start_row=2,
    date_col=0,
    description_col=1,
    reference_col=2,
    debit_col=3,
    credit_col=4,
    date_format="DD.MM.YYYY",
    decimal_format="tr",
    debit_is_outflow=True,
    csv_encoding="utf-8-sig",
    csv_delimiter=",",
)

COMMA_CSV = (
    "Tarih,Aciklama,Referans,Borc,Alacak\n"
    '01.02.2026,Test odeme,REF-A,"100,00",\n'
)


@pytest.fixture
def cp1254_bytes() -> bytes:
    return CP1254_CSV_TEXT.encode("cp1254")


def test_decode_cp1254_preserves_turkish_characters(cp1254_bytes: bytes) -> None:
    text, encoding = decode_csv_bytes(cp1254_bytes)
    assert encoding == "cp1254"
    assert "Gıda alışverişi şirketi" in text
    assert "Müşteri tahsilatı" in text


def test_semicolon_delimiter_auto_detected(cp1254_bytes: bytes) -> None:
    text, _ = decode_csv_bytes(cp1254_bytes)
    assert detect_csv_delimiter(text) == ";"


def test_cp1254_semicolon_import_exact_kurus_and_description(cp1254_bytes: bytes) -> None:
    parsed = parse_with_profile(
        cp1254_bytes, CP1254_PROFILE, original_filename="garanti.csv"
    )
    assert len(parsed.lines) == 2
    line0 = parsed.lines[0]
    assert line0.transaction_date == date(2026, 2, 1)
    assert line0.amount_kurus == -123456
    assert line0.description == "Gıda alışverişi şirketi"
    assert line0.reference == "REF-1"
    assert parsed.lines[1].amount_kurus == 25050
    assert parsed.lines[1].description == "Müşteri tahsilatı"


def test_auto_detect_encoding_and_delimiter(cp1254_bytes: bytes) -> None:
    auto_profile = CP1254_PROFILE.model_copy(
        update={"csv_encoding": "auto", "csv_delimiter": "auto"}
    )
    parsed = parse_with_profile(
        cp1254_bytes, auto_profile, original_filename="garanti.csv"
    )
    assert parsed.lines[0].description == "Gıda alışverişi şirketi"
    assert parsed.lines[0].amount_kurus == -123456


def test_comma_csv_still_works() -> None:
    parsed = parse_with_profile(
        COMMA_CSV.encode(), COMMA_PROFILE, original_filename="comma.csv"
    )
    assert parsed.lines[0].amount_kurus == -10000


def test_date_with_trailing_time_uses_date_part() -> None:
    assert parse_date_with_format("01.02.2026 14:30", 2, "DD.MM.YYYY") == date(
        2026, 2, 1
    )


def test_date_with_dash_separated_time_slash_format() -> None:
    assert parse_date_with_format("30/06/2026-06:26:10", 17, "DD/MM/YYYY") == date(
        2026, 6, 30
    )


def test_date_with_dash_time_falls_back_when_profile_uses_dots() -> None:
    assert parse_date_with_format("30/06/2026-06:26:10", 17, "DD.MM.YYYY") == date(
        2026, 6, 30
    )


def test_date_with_dash_separated_time_dot_format() -> None:
    assert parse_date_with_format("01.02.2026-14:30:00", 3, "DD.MM.YYYY") == date(
        2026, 2, 1
    )


def test_normalize_transaction_date_cell() -> None:
    assert normalize_transaction_date_cell("30/06/2026-06:26:10") == "30/06/2026"
    assert normalize_transaction_date_cell("2026-06-30T06:26:10") == "2026-06-30"


def test_slash_date_import_with_dash_time() -> None:
    csv = (
        "Tarih;Aciklama;Borc;Alacak\n"
        "30/06/2026-06:26:10;POS odeme;100,00;\n"
    )
    profile = BankImportProfileConfig(
        header_row=1,
        data_start_row=2,
        date_col=0,
        description_col=1,
        debit_col=2,
        credit_col=3,
        date_format="DD/MM/YYYY",
        decimal_format="tr",
        csv_delimiter=";",
    )
    parsed = parse_with_profile(csv.encode(), profile, original_filename="bank.csv")
    assert parsed.lines[0].transaction_date == date(2026, 6, 30)


def test_resolve_csv_read_options_reports_detected_values(cp1254_bytes: bytes) -> None:
    _, enc, delim = resolve_csv_read_options(cp1254_bytes)
    assert enc == "cp1254"
    assert delim == ";"


def test_read_raw_grid_splits_semicolon_columns(cp1254_bytes: bytes) -> None:
    grid = read_raw_grid(cp1254_bytes, original_filename="garanti.csv")
    assert len(grid[0]) == 5
    assert grid[1][1] == "Gıda alışverişi şirketi"


@pytest.fixture
def bank_account(db_session, restaurant_a):
    seed_default_chart(db_session, restaurant_a.id)
    return banking_service.create_money_account(
        db_session,
        restaurant_a.id,
        MoneyAccountCreate(
            account_kind=MoneyAccountKind.BANK,
            name="TR CSV",
            bank_name="Garanti",
        ),
    )


def test_saved_profile_reuses_stored_encoding_and_delimiter(
    db_session, restaurant_a, bank_account, cp1254_bytes: bytes
) -> None:
    import_profile_service.upsert_import_profile(
        db_session,
        restaurant_a.id,
        bank_account.id,
        CP1254_PROFILE,
    )
    stmt = statement_service.import_bank_statement(
        db_session,
        restaurant_a.id,
        bank_account.id,
        cp1254_bytes,
        original_filename="garanti-feb.csv",
    )
    assert stmt.line_count == 2
    assert stmt.lines[0].description == "Gıda alışverişi şirketi"
    assert stmt.lines[0].amount_kurus == -123456


def test_cp1254_import_duplicate_fingerprint_still_rejected(
    db_session, restaurant_a, bank_account, cp1254_bytes: bytes
) -> None:
    import_profile_service.upsert_import_profile(
        db_session, restaurant_a.id, bank_account.id, CP1254_PROFILE
    )
    statement_service.import_bank_statement(
        db_session,
        restaurant_a.id,
        bank_account.id,
        cp1254_bytes,
        original_filename="dup-a.csv",
    )
    with pytest.raises(statement_service.DuplicateStatementError):
        statement_service.import_bank_statement(
            db_session,
            restaurant_a.id,
            bank_account.id,
            cp1254_bytes,
            original_filename="dup-b.csv",
        )


def test_cp1254_import_overlap_skips_duplicate_lines(
    db_session, restaurant_a, bank_account, cp1254_bytes: bytes
) -> None:
    import_profile_service.upsert_import_profile(
        db_session, restaurant_a.id, bank_account.id, CP1254_PROFILE
    )
    statement_service.import_bank_statement(
        db_session,
        restaurant_a.id,
        bank_account.id,
        cp1254_bytes,
        original_filename="overlap-a.csv",
    )
    overlap = (
        "Tarih;Açıklama;Referans;Borc;Alacak\n"
        "01.02.2026 09:00;Diğer;REF-X;10,00;\n"
    ).encode("cp1254")
    second = statement_service.import_bank_statement(
        db_session,
        restaurant_a.id,
        bank_account.id,
        overlap,
        original_filename="overlap-b.csv",
    )
    assert second.line_count == 1
    assert second.lines[0].description == "Diğer"
