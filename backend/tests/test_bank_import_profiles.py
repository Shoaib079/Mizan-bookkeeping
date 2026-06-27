"""Bank statement import with column mapping — TR-style fixture and profile tests."""

from __future__ import annotations

import io
from datetime import date

import pytest

from app.adapters.bank_parsers.profile_mapper import (
    BankImportProfileConfig,
    parse_with_profile,
    validate_profile_against_grid,
)
from app.adapters.bank_parsers.raw_grid import read_raw_grid
from app.adapters.bank_parsers.types import BankParseError
from app.core.chart_of_accounts.seed import seed_default_chart
from app.features.banking import import_profiles as import_profile_service
from app.features.banking import service as banking_service
from app.features.banking import statements as statement_service
from app.features.banking.models import MoneyAccountKind
from app.features.banking.schema import MoneyAccountCreate

# Turkish bank export: junk rows 1–7, headers row 8, data from row 9.
# Columns: date, description, reference, Borç (debit/outflow), Alacak (credit/inflow)
TR_PROFILE = BankImportProfileConfig(
    header_row=8,
    data_start_row=9,
    date_col=0,
    description_col=1,
    reference_col=2,
    debit_col=3,
    credit_col=4,
    date_format="DD.MM.YYYY",
    decimal_format="tr",
    debit_is_outflow=True,
)

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
03.02.2026,POS settlement,REF-2,"75,25",
"""


def _line_amounts(parsed):
    return [
        (line.transaction_date, line.amount_kurus, line.description, line.reference)
        for line in parsed.lines
    ]


def test_tr_style_debit_credit_import_exact_kurus() -> None:
    parsed = parse_with_profile(TR_CSV.encode(), TR_PROFILE, original_filename="tr.csv")
    assert _line_amounts(parsed) == [
        (date(2026, 2, 1), -10000, "Odeme tedarikci", "REF-OUT"),
        (date(2026, 2, 2), 25050, "Musteri tahsilat", "REF-IN"),
        (date(2026, 2, 3), -7525, "POS settlement", "REF-2"),
    ]


def test_bad_column_mapping_rejected_with_clear_message() -> None:
    grid = read_raw_grid(TR_CSV.encode(), original_filename="tr.csv")
    bad = TR_PROFILE.model_copy(update={"date_col": 99})
    with pytest.raises(BankParseError, match="column 99"):
        validate_profile_against_grid(grid, bad)


def test_both_debit_and_credit_on_row_rejected() -> None:
    bad_csv = TR_CSV.replace(
        '01.02.2026,Odeme tedarikci,REF-OUT,"100,00",',
        '01.02.2026,Odeme tedarikci,REF-OUT,"100,00","50,00"',
    )
    with pytest.raises(BankParseError, match="both debit and credit"):
        parse_with_profile(bad_csv.encode(), TR_PROFILE, original_filename="tr.csv")


@pytest.fixture
def bank_account(db_session, restaurant_a):
    seed_default_chart(db_session, restaurant_a.id)
    return banking_service.create_money_account(
        db_session,
        restaurant_a.id,
        MoneyAccountCreate(
            account_kind=MoneyAccountKind.BANK,
            name="TR Import",
            bank_name="Garanti",
        ),
    )


def test_saved_profile_reapplies_on_next_import(db_session, restaurant_a, bank_account) -> None:
    import_profile_service.upsert_import_profile(
        db_session,
        restaurant_a.id,
        bank_account.id,
        TR_PROFILE,
    )
    stmt = statement_service.import_bank_statement(
        db_session,
        restaurant_a.id,
        bank_account.id,
        TR_CSV.encode(),
        original_filename="feb-tr.csv",
    )
    assert stmt.line_count == 3
    assert stmt.lines[0].amount_kurus == -10000
    assert stmt.lines[1].amount_kurus == 25050


def test_profile_import_duplicate_fingerprint_still_rejected(
    db_session, restaurant_a, bank_account
) -> None:
    content = TR_CSV.encode()
    import_profile_service.upsert_import_profile(
        db_session, restaurant_a.id, bank_account.id, TR_PROFILE
    )
    statement_service.import_bank_statement(
        db_session,
        restaurant_a.id,
        bank_account.id,
        content,
        original_filename="tr-a.csv",
    )
    with pytest.raises(statement_service.DuplicateStatementError):
        statement_service.import_bank_statement(
            db_session,
            restaurant_a.id,
            bank_account.id,
            content,
            original_filename="tr-b.csv",
        )


def test_profile_import_period_overlap_still_enforced(
    db_session, restaurant_a, bank_account
) -> None:
    import_profile_service.upsert_import_profile(
        db_session, restaurant_a.id, bank_account.id, TR_PROFILE
    )
    statement_service.import_bank_statement(
        db_session,
        restaurant_a.id,
        bank_account.id,
        TR_CSV.encode(),
        original_filename="overlap-a.csv",
    )
    overlap_csv = """junk
junk
junk
junk
junk
junk
Tarih,Aciklama,Referans,Borc,Alacak
01.02.2026,Other,REF-X,"10,00",
"""
    with pytest.raises(statement_service.OverlappingPeriodError):
        statement_service.import_bank_statement(
            db_session,
            restaurant_a.id,
            bank_account.id,
            overlap_csv.encode(),
            original_filename="overlap-b.csv",
            profile_config=TR_PROFILE.model_copy(update={"header_row": 7, "data_start_row": 8}),
        )
