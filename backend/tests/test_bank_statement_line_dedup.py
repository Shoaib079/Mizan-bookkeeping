"""Bank statement line dedup — overlapping exports, no file retention."""

from __future__ import annotations

from datetime import date
from pathlib import Path

import pytest

from app.adapters.bank_parsers.profile_mapper import BankImportProfileConfig
from app.core.chart_of_accounts.seed import seed_default_chart
from app.db.session import entity_context
from app.features.banking import import_profiles as import_profile_service
from app.features.banking import service as banking_service
from app.features.banking import statements as statement_service
from app.features.banking.models import MoneyAccountKind
from app.features.banking.schema import MoneyAccountCreate
from app.features.banking.statement_models import BankStatement, StatementLineStatus

FIXTURES = Path(__file__).resolve().parent / "fixtures"
SAMPLE_CSV = FIXTURES / "bank_statements" / "sample.csv"

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


@pytest.fixture
def bank_account(db_session, restaurant_a):
    seed_default_chart(db_session, restaurant_a.id)
    return banking_service.create_money_account(
        db_session,
        restaurant_a.id,
        MoneyAccountCreate(
            account_kind=MoneyAccountKind.BANK,
            name="Dedup Test",
            bank_name="Garanti",
        ),
    )


def test_overlapping_export_skips_duplicate_lines_imports_new_only(
    db_session, restaurant_a, bank_account
) -> None:
    import_profile_service.upsert_import_profile(
        db_session, restaurant_a.id, bank_account.id, TR_PROFILE
    )
    first = statement_service.import_bank_statement(
        db_session,
        restaurant_a.id,
        bank_account.id,
        TR_CSV.encode(),
        original_filename="feb-tr.csv",
    )
    assert first.line_count == 3
    assert first.skipped_duplicate_count == 0

    overlap_csv = """junk1
junk2
junk3
junk4
junk5
junk6
junk7
Tarih,Aciklama,Referans,Borc,Alacak
01.02.2026,Odeme tedarikci,REF-OUT,"100,00",
04.02.2026,Yeni odeme,REF-NEW,"50,00",
"""
    second = statement_service.import_bank_statement(
        db_session,
        restaurant_a.id,
        bank_account.id,
        overlap_csv.encode(),
        original_filename="feb-plus-apr.csv",
    )
    assert second.line_count == 1
    assert second.skipped_duplicate_count == 1
    assert second.lines[0].description == "Yeni odeme"
    assert second.lines[0].amount_kurus == -5000


def test_all_duplicate_lines_rejected(db_session, restaurant_a, bank_account) -> None:
    import_profile_service.upsert_import_profile(
        db_session, restaurant_a.id, bank_account.id, TR_PROFILE
    )
    statement_service.import_bank_statement(
        db_session,
        restaurant_a.id,
        bank_account.id,
        TR_CSV.encode(),
        original_filename="first.csv",
    )
    duplicate_only = """junk-a
junk-b
junk-c
junk-d
junk-e
junk-f
junk-g
Tarih,Aciklama,Referans,Borc,Alacak
01.02.2026,Odeme tedarikci,REF-OUT,"100,00",
02.02.2026,Musteri tahsilat,REF-IN,,"250,50"
03.02.2026,POS settlement,REF-2,"75,25",
"""
    with pytest.raises(statement_service.NoNewStatementLinesError):
        statement_service.import_bank_statement(
            db_session,
            restaurant_a.id,
            bank_account.id,
            duplicate_only.encode(),
            original_filename="reparse.csv",
            profile_config=TR_PROFILE,
        )


def test_same_date_amount_different_description_needs_review(
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
        original_filename="feb-tr.csv",
    )
    overlap_csv = """junk1
junk2
junk3
junk4
junk5
junk6
junk7
Tarih,Aciklama,Referans,Borc,Alacak
01.02.2026,Other label,REF-X,"100,00",
"""
    second = statement_service.import_bank_statement(
        db_session,
        restaurant_a.id,
        bank_account.id,
        overlap_csv.encode(),
        original_filename="overlap-b.csv",
    )
    assert second.line_count == 1
    assert second.lines[0].status == StatementLineStatus.NEEDS_REVIEW
    assert second.lines[0].review_reason is not None


def test_statement_file_not_stored_on_disk(
    db_session, restaurant_a, bank_account
) -> None:
    stmt = statement_service.import_bank_statement(
        db_session,
        restaurant_a.id,
        bank_account.id,
        SAMPLE_CSV.read_bytes(),
        original_filename="sample.csv",
    )
    assert stmt.line_count > 0
    with entity_context(db_session, restaurant_a.id):
        row = db_session.get(BankStatement, stmt.id)
    assert row is not None
    assert row.storage_path is None


def test_jan_then_jan_feb_export(db_session, restaurant_a, bank_account) -> None:
    jan_csv = (
        "transaction_date,amount,description,reference\n"
        "2026-01-15,-5000,January rent,RENT-JAN\n"
        "2026-01-20,10000,Customer payment,PAY-JAN\n"
    ).encode()
    jan_feb_csv = (
        "transaction_date,amount,description,reference\n"
        "2026-01-15,-5000,January rent,RENT-JAN\n"
        "2026-01-20,10000,Customer payment,PAY-JAN\n"
        "2026-02-05,-2500,February utility,UTIL-FEB\n"
    ).encode()

    first = statement_service.import_bank_statement(
        db_session,
        restaurant_a.id,
        bank_account.id,
        jan_csv,
        original_filename="jan-only.csv",
    )
    assert first.line_count == 2
    assert first.period_start == date(2026, 1, 15)
    assert first.period_end == date(2026, 1, 20)

    second = statement_service.import_bank_statement(
        db_session,
        restaurant_a.id,
        bank_account.id,
        jan_feb_csv,
        original_filename="jan-feb.csv",
    )
    assert second.line_count == 1
    assert second.skipped_duplicate_count == 2
    assert second.lines[0].transaction_date == date(2026, 2, 5)
