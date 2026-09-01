"""Orphan payment lookup for payment bounce pairs."""

from __future__ import annotations

import uuid
from datetime import date

import pytest

from app.core.staff import posting as staff_posting
from app.core.staff.types import PayCurrency
from app.db.session import entity_context
from app.features.banking.statement_bounce_payments import find_active_payment_journal
from app.features.banking.statement_models import BouncePersonType
from app.features.staff.models import Employee

ACTOR_ID = uuid.UUID("00000000-0000-4000-8000-000000000001")

pytest_plugins = ("tests.test_statement_bounce_pair",)


def test_find_staff_payment_journal_uses_amount_minor(
    db_session, bounce_setup
) -> None:
    entity_id = bounce_setup["entity_id"]
    drawer = bounce_setup["bank"]

    with entity_context(db_session, entity_id):
        employee = Employee(name="Ali Yilmaz", pay_currency=PayCurrency.TRY)
        db_session.add(employee)
        db_session.commit()
        db_session.refresh(employee)
        employee_id = employee.id

    staff_posting.post_salary_accrual(
        db_session,
        entity_id,
        employee_id,
        accrual_date=date(2026, 2, 1),
        amount_minor=5_000_000,
        description="February salary",
        actor_id=ACTOR_ID,
        period_year=2026,
        period_month=2,
    )
    payment = staff_posting.post_salary_payment(
        db_session,
        entity_id,
        employee_id,
        payment_date=date(2026, 2, 1),
        amount_minor=5_000_000,
        description="February salary paid",
        actor_id=ACTOR_ID,
        payment_account_id=drawer.gl_account_id,
        period_year=2026,
        period_month=2,
    )

    with entity_context(db_session, entity_id):
        journal_id = find_active_payment_journal(
            db_session,
            person_type=BouncePersonType.STAFF,
            person_id=employee_id,
            amount_kurus=5_000_000,
            payment_date=date(2026, 2, 1),
            exclude_journal_ids=set(),
        )

    assert journal_id == payment.journal_entry.id
