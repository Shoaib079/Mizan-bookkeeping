"""The four bank-line classifications nothing was testing.

`classify_statement_line` handles twenty-five classifications in one 1,714-line
function. Twenty-one are exercised somewhere in the suite. These four were not
touched by any test at all — a line could be classified as a partner drawing,
a drawing repayment, a staff incentive or a loan payment, and nothing in the
suite would have noticed if it stopped working.

They were found while asking whether that function could safely be broken up.
It is the only part of the app where a whole user-facing path had no coverage,
and it matters more than the average gap because the function is about to be
decomposed: a path with no test is a path that gets rewritten blind.

Each is checked twice — the posting it makes, and the guard that refuses the
wrong direction. Direction is the one that would go unnoticed: a drawing is
money out and a repayment is money in, and a classifier that accepted either
would post the reverse of what the bank actually did while the books stayed
balanced.
"""

from __future__ import annotations

import uuid
from datetime import date

import pytest

from app.core.onboarding.posting import post_opening_balances
from app.core.partners import ledger as partner_ledger
from app.core.partners import posting as partner_posting
from app.core.partners.types import PartnerMovementType
from app.core.staff.types import PayCurrency
from app.db.session import entity_context
from app.features.banking import service as banking_service
from app.features.banking import statements as statement_service
from app.features.banking.models import MoneyAccountKind
from app.features.banking.schema import MoneyAccountCreate
from app.features.banking.statement_models import (
    BankStatementLine,
    StatementLineClassification,
    StatementLineStatus,
)
from app.features.onboarding.opening_balances import OpeningBalanceLineInput
from app.features.staff.models import Employee

from tests.test_partners import ACTOR_ID  # noqa: F401
from tests.test_partners import partner_setup  # noqa: F401 — pytest fixture


def _bank(db_session, entity_id: uuid.UUID):
    account = banking_service.create_money_account(
        db_session,
        entity_id,
        MoneyAccountCreate(account_kind=MoneyAccountKind.BANK, name="Garanti TRY"),
    )
    post_opening_balances(
        db_session,
        entity_id,
        go_live_date=date(2026, 1, 1),
        lines=[OpeningBalanceLineInput(money_account_id=account.id, amount_kurus=5_000_000)],
        actor_id=ACTOR_ID,
    )
    return account


def _line(db_session, entity_id, bank, *, amount: str, description: str):
    csv = (
        "transaction_date,amount,description,reference\n"
        f'2026-05-02,"{amount}",{description},REF-1\n'
    ).encode()
    statement = statement_service.import_bank_statement(
        db_session, entity_id, bank.id, csv, original_filename="lines.csv"
    )
    return statement, statement.lines[0].id


def _employee(db_session, entity_id):
    with entity_context(db_session, entity_id):
        # Name and pay currency are all an Employee carries — salary is held
        # separately, not on the row.
        row = Employee(name="Mehmet", pay_currency=PayCurrency.TRY)
        db_session.add(row)
        db_session.commit()
        db_session.refresh(row)
        return row.id


# --- partner drawing -----------------------------------------------------


def test_a_partner_drawing_posts_and_records_the_partner(db_session, partner_setup):
    entity_id = partner_setup["entity_id"]
    partner_id = partner_setup["partner_id"]
    bank = _bank(db_session, entity_id)
    statement, line_id = _line(
        db_session, entity_id, bank, amount="-2.500,00", description="ORTAK CEKIM"
    )

    result = statement_service.classify_statement_line(
        db_session,
        entity_id,
        statement.id,
        line_id,
        classification=StatementLineClassification.PARTNER_DRAWING,
        partner_id=partner_id,
        actor_id=ACTOR_ID,
    )

    assert result.line.status == StatementLineStatus.POSTED
    assert result.line.partner_id == partner_id

    with entity_context(db_session, entity_id):
        rows = partner_ledger.list_ledger_entries(db_session, entity_id, partner_id)
        drawings = [r for r in rows if r.movement_type == PartnerMovementType.DRAWING]
        assert len(drawings) == 1
        # Negative in the subledger: the partner took money out.
        assert drawings[0].amount_kurus == -250_000


def test_a_partner_drawing_refuses_money_coming_in(db_session, partner_setup):
    """Direction is the half that would go unnoticed.

    A drawing that accepted an inflow would record the partner taking money
    on a day the bank shows them putting it back, and the books would still
    balance.
    """
    entity_id = partner_setup["entity_id"]
    bank = _bank(db_session, entity_id)
    statement, line_id = _line(
        db_session, entity_id, bank, amount="2.500,00", description="GELEN HAVALE"
    )

    with pytest.raises(statement_service.InvalidClassificationError):
        statement_service.classify_statement_line(
            db_session,
            entity_id,
            statement.id,
            line_id,
            classification=StatementLineClassification.PARTNER_DRAWING,
            partner_id=partner_setup["partner_id"],
            actor_id=ACTOR_ID,
        )


# --- partner drawing repayment -------------------------------------------


def test_a_drawing_repayment_posts_the_other_way(db_session, partner_setup):
    entity_id = partner_setup["entity_id"]
    partner_id = partner_setup["partner_id"]
    bank = _bank(db_session, entity_id)

    partner_posting.post_drawing(
        db_session,
        entity_id,
        partner_id,
        drawing_date=date(2026, 5, 1),
        amount_kurus=400_000,
        description="Took cash",
        actor_id=ACTOR_ID,
        payment_account_id=bank.gl_account_id,
    )

    statement, line_id = _line(
        db_session, entity_id, bank, amount="1.000,00", description="ORTAK IADE"
    )
    result = statement_service.classify_statement_line(
        db_session,
        entity_id,
        statement.id,
        line_id,
        classification=StatementLineClassification.PARTNER_DRAWING_REPAYMENT,
        partner_id=partner_id,
        actor_id=ACTOR_ID,
    )

    assert result.line.status == StatementLineStatus.POSTED
    with entity_context(db_session, entity_id):
        rows = partner_ledger.list_ledger_entries(db_session, entity_id, partner_id)
        repayments = [
            r for r in rows if r.movement_type == PartnerMovementType.DRAWING_REPAYMENT
        ]
        assert len(repayments) == 1
        assert repayments[0].amount_kurus == 100_000


def test_a_drawing_repayment_refuses_money_going_out(db_session, partner_setup):
    entity_id = partner_setup["entity_id"]
    bank = _bank(db_session, entity_id)
    statement, line_id = _line(
        db_session, entity_id, bank, amount="-1.000,00", description="GIDEN"
    )

    with pytest.raises(statement_service.InvalidClassificationError):
        statement_service.classify_statement_line(
            db_session,
            entity_id,
            statement.id,
            line_id,
            classification=StatementLineClassification.PARTNER_DRAWING_REPAYMENT,
            partner_id=partner_setup["partner_id"],
            actor_id=ACTOR_ID,
        )


# --- staff incentive ------------------------------------------------------


def test_a_staff_incentive_posts_against_the_employee(db_session, partner_setup):
    entity_id = partner_setup["entity_id"]
    employee_id = _employee(db_session, entity_id)
    bank = _bank(db_session, entity_id)
    statement, line_id = _line(
        db_session, entity_id, bank, amount="-750,00", description="PRIM ODEMESI"
    )

    result = statement_service.classify_statement_line(
        db_session,
        entity_id,
        statement.id,
        line_id,
        classification=StatementLineClassification.STAFF_INCENTIVE,
        employee_id=employee_id,
        actor_id=ACTOR_ID,
    )

    assert result.line.status == StatementLineStatus.POSTED
    assert result.line.employee_id == employee_id
    with entity_context(db_session, entity_id):
        persisted = db_session.get(BankStatementLine, line_id)
        assert persisted.employee_id == employee_id


def test_a_staff_incentive_refuses_money_coming_in(db_session, partner_setup):
    entity_id = partner_setup["entity_id"]
    employee_id = _employee(db_session, entity_id)
    bank = _bank(db_session, entity_id)
    statement, line_id = _line(
        db_session, entity_id, bank, amount="750,00", description="GELEN"
    )

    with pytest.raises(statement_service.InvalidClassificationError):
        statement_service.classify_statement_line(
            db_session,
            entity_id,
            statement.id,
            line_id,
            classification=StatementLineClassification.STAFF_INCENTIVE,
            employee_id=employee_id,
            actor_id=ACTOR_ID,
        )


# --- loan payment ---------------------------------------------------------


def test_a_loan_payment_posts_without_a_partner(db_session, partner_setup):
    """The generic loan case: money out to a lender who is not a partner."""
    entity_id = partner_setup["entity_id"]
    bank = _bank(db_session, entity_id)
    statement, line_id = _line(
        db_session, entity_id, bank, amount="-3.000,00", description="KREDI ODEME"
    )

    result = statement_service.classify_statement_line(
        db_session,
        entity_id,
        statement.id,
        line_id,
        classification=StatementLineClassification.LOAN_PAYMENT,
        actor_id=ACTOR_ID,
    )

    assert result.line.status == StatementLineStatus.POSTED
    assert result.journal_entry_id is not None


def test_a_loan_payment_refuses_money_coming_in(db_session, partner_setup):
    """An inflow is a loan *receipt*, and they move the liability opposite
    ways — accepting either here would book a repayment as borrowing."""
    entity_id = partner_setup["entity_id"]
    bank = _bank(db_session, entity_id)
    statement, line_id = _line(
        db_session, entity_id, bank, amount="3.000,00", description="KREDI GIRIS"
    )

    with pytest.raises(statement_service.InvalidClassificationError):
        statement_service.classify_statement_line(
            db_session,
            entity_id,
            statement.id,
            line_id,
            classification=StatementLineClassification.LOAN_PAYMENT,
            actor_id=ACTOR_ID,
        )
