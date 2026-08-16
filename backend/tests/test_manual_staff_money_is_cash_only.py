"""Manual staff money is cash-only; bank salaries arrive on a statement.

The owner, of the salary form: "pay from shows banks — it must not show bcz
bank paid salaries comes straight from bank transactions".

The rule already existed for partners and lived in their service. Staff had the
same four manual routes and no guard at all, so the form offered bank accounts
and the API accepted them — which is how one bank payment becomes two entries:
the classified statement line, and the manual one typed in beside it. The
reconciliation that would catch the duplicate is exactly what the manual entry
skipped.

The guard is deliberately on the *service*, not the posting. The statement
classifier posts a staff salary through `post_period_salary_payment` with a
bank account and must keep working — that is the path this rule sends people
down, and the last test here is the one that proves it still does.
"""

from __future__ import annotations

from datetime import date

import pytest
from sqlalchemy import select

from app.core.ledger.posting import InvalidAccountError
from app.features.banking.models import MoneyAccount, MoneyAccountKind
from app.features.banking.schema import MoneyAccountCreate
from app.features.banking import service as banking_service
from app.features.staff import service as staff_service
from app.features.staff.schema import (
    StaffAdvanceCreate,
    StaffAdvanceReturnCreate,
    StaffPaymentCreate,
)
from app.db.session import entity_context

from tests.test_staff import ACTOR_ID, staff_setup  # noqa: F401


@pytest.fixture
def bank_gl(db_session, staff_setup):  # noqa: F811
    """A real bank money account for this entity, and its GL account id."""
    entity_id = staff_setup["entity_id"]
    account = banking_service.create_money_account(
        db_session,
        entity_id,
        MoneyAccountCreate(account_kind=MoneyAccountKind.BANK, name="Ziraat"),
    )
    with entity_context(db_session, entity_id):
        row = db_session.scalar(
            select(MoneyAccount).where(MoneyAccount.id == account.id)
        )
        return row.gl_account_id


def test_a_salary_cannot_be_paid_from_a_bank_by_hand(
    db_session, staff_setup, bank_gl  # noqa: F811
):
    with pytest.raises(InvalidAccountError, match="cash-only"):
        staff_service.record_payment(
            db_session,
            staff_setup["entity_id"],
            staff_setup["employee_id"],
            StaffPaymentCreate(
                payment_date=date(2026, 8, 5),
                amount_minor=3_500_000,
                period_year=2026,
                period_month=7,
                period_salary_minor=3_500_000,
                description="Temmuz maaşı",
                actor_id=ACTOR_ID,
                payment_account_id=bank_gl,
            ),
        )


def test_an_advance_cannot_either(db_session, staff_setup, bank_gl):  # noqa: F811
    with pytest.raises(InvalidAccountError, match="cash-only"):
        staff_service.record_advance(
            db_session,
            staff_setup["entity_id"],
            staff_setup["employee_id"],
            StaffAdvanceCreate(
                payment_date=date(2026, 8, 5),
                amount_minor=100_000,
                description="Avans",
                actor_id=ACTOR_ID,
                payment_account_id=bank_gl,
            ),
        )


def test_nor_an_advance_return(db_session, staff_setup, bank_gl):  # noqa: F811
    with pytest.raises(InvalidAccountError, match="cash-only"):
        staff_service.record_advance_return(
            db_session,
            staff_setup["entity_id"],
            staff_setup["employee_id"],
            StaffAdvanceReturnCreate(
                payment_date=date(2026, 8, 5),
                amount_minor=100_000,
                description="Avans iade",
                actor_id=ACTOR_ID,
                payment_account_id=bank_gl,
            ),
        )


def test_the_cash_drawer_still_works(db_session, staff_setup):  # noqa: F811
    """Guard the guard.

    A guard that refused everything would satisfy the three tests above while
    making the app unable to record a salary at all.
    """
    result = staff_service.record_payment(
        db_session,
        staff_setup["entity_id"],
        staff_setup["employee_id"],
        StaffPaymentCreate(
            payment_date=date(2026, 8, 5),
            amount_minor=3_500_000,
            period_year=2026,
            period_month=7,
            period_salary_minor=3_500_000,
            description="Temmuz maaşı",
            actor_id=ACTOR_ID,
            payment_account_id=staff_setup["drawer"].gl_account_id,
        ),
    )
    assert result.journal_entry_id is not None


def test_the_statement_classifier_may_still_use_a_bank(
    db_session, staff_setup, bank_gl  # noqa: F811
):
    """The path the rule exists to send people down, still open.

    The classifier calls the same posting function this guard sits above. If
    the guard had gone into the posting instead of the service, recording a
    bank salary would have become impossible by any route — the rule would
    have removed the alternative it recommends.
    """
    from app.core.staff import posting as staff_posting

    result = staff_posting.post_period_salary_payment(
        db_session,
        staff_setup["entity_id"],
        staff_setup["employee_id"],
        payment_date=date(2026, 8, 6),
        amount_minor=3_500_000,
        period_year=2026,
        period_month=7,
        period_salary_minor=3_500_000,
        description="Bank salary via statement",
        actor_id=ACTOR_ID,
        payment_account_id=bank_gl,
    )
    assert result.journal_entry.id is not None


def test_partners_share_the_same_guard():
    """One rule, one place. It was copied into the partner service and staff
    had none; a second copy is how the two would drift."""
    import inspect

    from app.features.partners import service as partner_service

    source = inspect.getsource(partner_service)
    assert "require_manual_cash_payment_account" in source
    assert "def require_manual_cash_payment_account" not in source, (
        "the partner service is defining its own copy again"
    )
