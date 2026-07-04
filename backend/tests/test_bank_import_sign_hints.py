"""Bank statement import sign-hint detection."""

from __future__ import annotations

import pytest

from app.adapters.bank_parsers.profile_mapper import BankImportProfileConfig, parse_with_profile
from app.adapters.bank_parsers.sign_hints import import_sign_review_reason
from app.core.banking.line_dedup import plan_statement_line_imports
from app.core.chart_of_accounts.seed import seed_default_chart
from app.features.banking import import_profiles as import_profile_service
from app.features.banking import service as banking_service
from app.features.banking import statements as statement_service
from app.features.banking.models import MoneyAccountKind
from app.features.banking.schema import MoneyAccountCreate
from app.features.banking.statement_models import StatementLineStatus

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

INVERTED_TR_PROFILE = TR_PROFILE.model_copy(update={"debit_is_outflow": False})

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


def test_import_sign_review_reason_flags_inflow_text_on_negative_amount() -> None:
    reason = import_sign_review_reason("NET SATIS POS YATIRMA", -100_00)
    assert reason is not None
    assert "inverted" in reason.lower()


def test_import_sign_review_reason_flags_outflow_text_on_positive_amount() -> None:
    reason = import_sign_review_reason("HAVALE EFT TEDARIKCI ODEME", 100_00)
    assert reason is not None
    assert "inverted" in reason.lower()


def test_import_sign_review_reason_ignores_consistent_signs() -> None:
    assert import_sign_review_reason("NET SATIS POS", 100_00) is None
    assert import_sign_review_reason("HAVALE TEDARIKCI ODEME", -100_00) is None


def test_import_sign_review_reason_ignores_negated_inflow_hints_on_outflow() -> None:
    assert import_sign_review_reason("Not a deposit", -50_000) is None
    assert import_sign_review_reason("NO POS CREDIT", -100_00) is None


def test_import_sign_review_reason_ignores_negated_outflow_hints_on_inflow() -> None:
    assert import_sign_review_reason("Not an EFT transfer", 100_00) is None
    assert import_sign_review_reason("No FAST transfer", 50_00) is None


def test_inverted_debit_credit_profile_routes_to_needs_review(
    db_session, restaurant_a
) -> None:
    seed_default_chart(db_session, restaurant_a.id)
    bank = banking_service.create_money_account(
        db_session,
        restaurant_a.id,
        MoneyAccountCreate(
            account_kind=MoneyAccountKind.BANK,
            name="Sign Check Bank",
            bank_name="Test",
        ),
    )
    import_profile_service.upsert_import_profile(
        db_session,
        restaurant_a.id,
        bank.id,
        INVERTED_TR_PROFILE,
    )
    statement = statement_service.import_bank_statement(
        db_session,
        restaurant_a.id,
        bank.id,
        TR_CSV.encode(),
        original_filename="inverted-tr.csv",
    )
    tahsilat = next(
        line for line in statement.lines if "tahsilat" in line.description.lower()
    )
    assert tahsilat.amount_kurus < 0
    assert tahsilat.status == StatementLineStatus.NEEDS_REVIEW
    assert tahsilat.review_reason is not None
    assert "inverted" in tahsilat.review_reason.lower()


def test_plan_import_flags_sign_mismatch_without_ambiguous_duplicate(
    db_session, restaurant_a
) -> None:
    seed_default_chart(db_session, restaurant_a.id)
    bank = banking_service.create_money_account(
        db_session,
        restaurant_a.id,
        MoneyAccountCreate(
            account_kind=MoneyAccountKind.BANK,
            name="Plan Sign Bank",
            bank_name="Test",
        ),
    )
    parsed = parse_with_profile(TR_CSV.encode(), INVERTED_TR_PROFILE, original_filename="tr.csv")
    rows = [
        (line.transaction_date, line.amount_kurus, line.description, line.reference)
        for line in parsed.lines
    ]
    plans = plan_statement_line_imports(db_session, bank.id, rows)
    flagged = [plan for plan in plans if plan.needs_review and plan.review_reason]
    assert any("inverted" in (plan.review_reason or "").lower() for plan in flagged)
