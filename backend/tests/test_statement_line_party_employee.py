"""Statement lines store employee_id and partner_id for audit and correction."""

from __future__ import annotations

import uuid
from datetime import date

from app.core.chart_of_accounts.default_chart import SALARY_EXPENSE_CODE
from app.core.onboarding.posting import post_opening_balances
from app.core.partners import posting as partner_posting
from app.features.onboarding.opening_balances import OpeningBalanceLineInput
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
from app.features.staff.models import Employee
from app.core.staff.types import PayCurrency

from tests.test_partners import ACTOR_ID as PARTNER_ACTOR_ID
from tests.test_partners import partner_setup  # noqa: F401 — pytest fixture

ACTOR_ID = PARTNER_ACTOR_ID


def _bank_with_balance(db_session, entity_id: uuid.UUID):
    bank = banking_service.create_money_account(
        db_session,
        entity_id,
        MoneyAccountCreate(account_kind=MoneyAccountKind.BANK, name="Garanti TRY"),
    )
    post_opening_balances(
        db_session,
        entity_id,
        go_live_date=date(2026, 1, 1),
        lines=[OpeningBalanceLineInput(money_account_id=bank.id, amount_kurus=5_000_000)],
        actor_id=ACTOR_ID,
    )
    return bank


def test_partner_reimbursement_line_stores_partner_id(db_session, partner_setup) -> None:
    entity_id = partner_setup["entity_id"]
    partner_id = partner_setup["partner_id"]
    accounts = partner_setup["accounts"]
    bank = _bank_with_balance(db_session, entity_id)

    partner_posting.post_expense_fronted(
        db_session,
        entity_id,
        partner_id,
        expense_date=date(2026, 5, 1),
        amount_kurus=768_500,
        description="Fronted expense",
        actor_id=ACTOR_ID,
        expense_account_id=accounts[SALARY_EXPENSE_CODE],
    )

    csv = (
        "transaction_date,amount,description,reference\n"
        '2026-05-02,"-7.685,00",GIDEN HAVALE partner repay,REF-7685\n'
    ).encode()
    statement = statement_service.import_bank_statement(
        db_session,
        entity_id,
        bank.id,
        csv,
        original_filename="partner-repay.csv",
    )
    line_id = statement.lines[0].id

    result = statement_service.classify_statement_line(
        db_session,
        entity_id,
        statement.id,
        line_id,
        classification=StatementLineClassification.PARTNER_REIMBURSEMENT,
        partner_id=partner_id,
        actor_id=ACTOR_ID,
    )

    assert result.line.status == StatementLineStatus.POSTED
    assert result.line.partner_id == partner_id
    assert result.line.classification == StatementLineClassification.PARTNER_REIMBURSEMENT

    with entity_context(db_session, entity_id):
        persisted = db_session.get(BankStatementLine, line_id)
        assert persisted is not None
        assert persisted.partner_id == partner_id


def test_staff_advance_line_stores_employee_id(db_session, partner_setup) -> None:
    entity_id = partner_setup["entity_id"]
    bank = _bank_with_balance(db_session, entity_id)

    with entity_context(db_session, entity_id):
        employee = Employee(name="Period Pay", pay_currency=PayCurrency.TRY)
        db_session.add(employee)
        db_session.commit()
        db_session.refresh(employee)
        employee_id = employee.id

    csv = (
        "transaction_date,amount,description,reference\n"
        '2026-05-06,"-28.075,00",GİDEN FAST salary,REF-28075\n'
    ).encode()
    statement = statement_service.import_bank_statement(
        db_session,
        entity_id,
        bank.id,
        csv,
        original_filename="staff-advance.csv",
    )
    line_id = statement.lines[0].id

    result = statement_service.classify_statement_line(
        db_session,
        entity_id,
        statement.id,
        line_id,
        classification=StatementLineClassification.STAFF_ADVANCE,
        employee_id=employee_id,
        actor_id=ACTOR_ID,
    )

    assert result.line.employee_id == employee_id

    with entity_context(db_session, entity_id):
        persisted = db_session.get(BankStatementLine, line_id)
        assert persisted is not None
        assert persisted.employee_id == employee_id


def test_staff_void_resets_linked_statement_line(db_session, partner_setup) -> None:
    from app.features.staff.service import void_staff_journal_entry_http

    entity_id = partner_setup["entity_id"]
    bank = _bank_with_balance(db_session, entity_id)

    with entity_context(db_session, entity_id):
        employee = Employee(name="Latif", pay_currency=PayCurrency.TRY)
        db_session.add(employee)
        db_session.commit()
        db_session.refresh(employee)
        employee_id = employee.id

    csv = (
        "transaction_date,amount,description,reference\n"
        '2026-06-06,"-38.000,00",GİDEN FAST salary,REF-38000\n'
    ).encode()
    statement = statement_service.import_bank_statement(
        db_session,
        entity_id,
        bank.id,
        csv,
        original_filename="staff-salary.csv",
    )
    line_id = statement.lines[0].id

    posted = statement_service.classify_statement_line(
        db_session,
        entity_id,
        statement.id,
        line_id,
        classification=StatementLineClassification.STAFF_PAYMENT,
        employee_id=employee_id,
        actor_id=ACTOR_ID,
        period_year=2026,
        period_month=5,
        period_salary_minor=3_800_000,
    )
    journal_id = posted.journal_entry_id
    assert journal_id is not None

    void_staff_journal_entry_http(
        db_session,
        entity_id,
        employee_id,
        journal_id,
        actor_id=ACTOR_ID,
        reason="Wrong month",
    )

    with entity_context(db_session, entity_id):
        line = db_session.get(BankStatementLine, line_id)
        assert line is not None
        assert line.status == StatementLineStatus.IMPORTED
        assert line.journal_entry_id is None
        assert line.classification == StatementLineClassification.UNCLASSIFIED


def test_correct_reposts_after_staff_void(db_session, partner_setup) -> None:
    from app.features.staff.service import void_staff_journal_entry_http

    entity_id = partner_setup["entity_id"]
    bank = _bank_with_balance(db_session, entity_id)

    with entity_context(db_session, entity_id):
        employee = Employee(name="Latif", pay_currency=PayCurrency.TRY)
        db_session.add(employee)
        db_session.commit()
        db_session.refresh(employee)
        employee_id = employee.id

    csv = (
        "transaction_date,amount,description,reference\n"
        '2026-06-06,"-38.000,00",GİDEN FAST salary,REF-38000\n'
    ).encode()
    statement = statement_service.import_bank_statement(
        db_session,
        entity_id,
        bank.id,
        csv,
        original_filename="staff-salary.csv",
    )
    line_id = statement.lines[0].id

    posted = statement_service.classify_statement_line(
        db_session,
        entity_id,
        statement.id,
        line_id,
        classification=StatementLineClassification.STAFF_PAYMENT,
        employee_id=employee_id,
        actor_id=ACTOR_ID,
        period_year=2026,
        period_month=5,
        period_salary_minor=3_800_000,
    )
    journal_id = posted.journal_entry_id
    assert journal_id is not None

    void_staff_journal_entry_http(
        db_session,
        entity_id,
        employee_id,
        journal_id,
        actor_id=ACTOR_ID,
    )

    with entity_context(db_session, entity_id):
        line = db_session.get(BankStatementLine, line_id)
        assert line is not None
        line.status = StatementLineStatus.POSTED
        line.journal_entry_id = journal_id
        line.classification = StatementLineClassification.STAFF_PAYMENT
        line.employee_id = employee_id
        db_session.commit()

    corrected = statement_service.correct_statement_line(
        db_session,
        entity_id,
        statement.id,
        line_id,
        actor_id=ACTOR_ID,
        classification=StatementLineClassification.STAFF_PAYMENT,
        employee_id=employee_id,
        period_year=2026,
        period_month=5,
        period_salary_minor=3_800_000,
        reason="Re-post May salary",
    )

    assert corrected.line.status == StatementLineStatus.POSTED
    assert corrected.journal_entry_id is not None
    assert corrected.journal_entry_id != journal_id
    assert corrected.line.employee_id == employee_id
