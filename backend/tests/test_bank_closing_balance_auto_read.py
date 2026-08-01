"""Auto-read bank statement closing balance from Bakiye column on import."""

from __future__ import annotations

from datetime import date

import pytest

from app.adapters.bank_parsers.profile_mapper import BankImportProfileConfig, parse_with_profile
from app.core.chart_of_accounts.seed import seed_default_chart
from app.features.banking import import_profiles as import_profile_service
from app.features.banking import statements as statement_service
from app.features.banking import service as banking_service
from app.features.banking.models import MoneyAccountKind
from app.features.banking.schema import MoneyAccountCreate
from app.features.reports import bank_reconciliation

TR_WITH_BALANCE = """junk1
junk2
junk3
junk4
junk5
junk6
junk7
Tarih,Aciklama,Referans,Borc,Alacak,Bakiye
01.02.2026,Odeme tedarikci,REF-OUT,"100,00",,"9.900,00"
02.02.2026,Musteri tahsilat,REF-IN,,"250,50","10.150,50"
03.02.2026,POS settlement,REF-2,"75,25",,"10.075,25"
"""

TR_PROFILE_WITH_BALANCE = BankImportProfileConfig(
    header_row=8,
    data_start_row=9,
    date_col=0,
    description_col=1,
    reference_col=2,
    debit_col=3,
    credit_col=4,
    balance_col=5,
    date_format="DD.MM.YYYY",
    decimal_format="tr",
    debit_is_outflow=True,
)


def test_parse_reads_closing_balance_from_last_dated_row() -> None:
    parsed = parse_with_profile(
        TR_WITH_BALANCE.encode(),
        TR_PROFILE_WITH_BALANCE,
        original_filename="isbank.csv",
    )
    assert parsed.closing_balance_kurus == 1_007_525
    assert parsed.period_end == date(2026, 2, 3)


def test_preview_surfaces_detected_closing_balance() -> None:
    preview = import_profile_service.preview_statement_upload(
        TR_WITH_BALANCE.encode(),
        original_filename="isbank.csv",
    )
    assert preview.suggested_profile is not None
    assert preview.suggested_profile.balance_col == 5
    assert preview.detected_closing_balance_kurus == 1_007_525


@pytest.fixture
def bank_account(db_session, restaurant_a):
    seed_default_chart(db_session, restaurant_a.id)
    return banking_service.create_money_account(
        db_session,
        restaurant_a.id,
        MoneyAccountCreate(
            account_kind=MoneyAccountKind.BANK,
            name="Is Bank",
            bank_name="Is Bank",
        ),
    )


def test_import_persists_auto_read_closing_balance(
    db_session, restaurant_a, bank_account
) -> None:
    stmt = statement_service.import_bank_statement(
        db_session,
        restaurant_a.id,
        bank_account.id,
        TR_WITH_BALANCE.encode(),
        original_filename="isbank-feb.csv",
        profile_config=TR_PROFILE_WITH_BALANCE,
    )
    assert stmt.closing_balance_kurus == 1_007_525

    report = bank_reconciliation.get_bank_reconciliation(
        db_session, restaurant_a.id, money_account_id=bank_account.id
    )
    account = report.accounts[0]
    assert account.stated_closing_balance_kurus == 1_007_525
