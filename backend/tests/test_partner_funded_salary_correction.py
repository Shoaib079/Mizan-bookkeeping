"""Correcting a partner-paid salary moves both subledgers, and not the accrual.

The owner: "yes do it correctly. i need edit button there". It was void-only,
and the reason was real — one journal entry writes a staff row for the salary
(sometimes a second for an advance it consumed, sometimes a third for an excess
paid as a new advance) *and* a partner row for what the business now owes.
Rebuilding from the partner row alone, which is how every other partner
movement is corrected, would rewrite that one and leave the staff rows
describing a payment that no longer exists.

So it voids the whole entry and reposts, the way `correct_profit_allocation`
already does for the same reason. What that buys is one operation, one audit
trail, and both legs moving together.

The sharp edge is the accrual. What an employee earned is a separate journal
entry that this payment merely settles, and voiding a payment deliberately
leaves it standing. The repost is therefore handed the period's *current*
accrued figure, so the ensure-accrual step returns early, and no extra days —
re-sending those would accrue them a second time on top of an accrual nobody
reversed. Half these tests are about that, because it is the half that would go
wrong silently and show up as an employee owed more than they earned.
"""

from __future__ import annotations

from datetime import date

import pytest
from sqlalchemy import select

from app.core.ledger.correction import CorrectionNotFoundError
from app.core.ledger.models import JournalEntry, JournalEntryStatus
from app.core.partners import ledger as partner_ledger
from app.core.partners.models import PartnerLedgerEntry
from app.core.partners.types import PartnerMovementType
from app.core.staff import ledger as staff_ledger
from app.core.staff.models import StaffLedgerEntry
from app.core.staff.partner_funded_payment import (
    correct_partner_funded_salary,
    post_partner_funded_period_salary,
)
from app.core.staff.types import StaffMovementType
from app.core.subledger.control_account_tie import assert_entity_control_accounts_tied
from app.db.session import entity_context
from app.features.partners.models import Partner

from tests.test_staff import ACTOR_ID, staff_setup  # noqa: F401

SALARY = 3_500_000
PAID = 3_500_000
CORRECTED = 3_250_000
PERIOD = {"period_year": 2026, "period_month": 7}


@pytest.fixture
def partner_paid_a_salary(db_session, staff_setup):  # noqa: F811
    entity_id = staff_setup["entity_id"]
    employee_id = staff_setup["employee_id"]
    with entity_context(db_session, entity_id):
        partner = Partner(name="Canan Takan")
        db_session.add(partner)
        db_session.commit()
        db_session.refresh(partner)
        partner_id = partner.id

    result = post_partner_funded_period_salary(
        db_session,
        entity_id,
        employee_id,
        partner_id,
        payment_date=date(2026, 8, 5),
        amount_minor=PAID,
        period_salary_minor=SALARY,
        description="Temmuz maaşı",
        actor_id=ACTOR_ID,
        **PERIOD,
    )
    return {
        "entity_id": entity_id,
        "employee_id": employee_id,
        "partner_id": partner_id,
        "journal_entry_id": result.journal_entry.id,
    }


def _correct(db_session, ctx, amount=CORRECTED, **kwargs):
    return correct_partner_funded_salary(
        db_session,
        ctx["entity_id"],
        ctx["journal_entry_id"],
        payment_date=date(2026, 8, 5),
        amount_minor=amount,
        description="Temmuz maaşı (düzeltildi)",
        actor_id=ACTOR_ID,
        reason="Paid less than recorded",
        **kwargs,
    )


def test_the_partner_row_follows_the_correction(db_session, partner_paid_a_salary):
    ctx = partner_paid_a_salary
    result = _correct(db_session, ctx)

    with entity_context(db_session, ctx["entity_id"]):
        rows = list(
            db_session.scalars(
                select(PartnerLedgerEntry).where(
                    PartnerLedgerEntry.journal_entry_id
                    == result.corrected.journal_entry.id,
                    PartnerLedgerEntry.movement_type
                    == PartnerMovementType.SALARY_FRONTED,
                )
            )
        )
    assert [r.amount_kurus for r in rows] == [CORRECTED]


def test_the_staff_row_follows_it_too(db_session, partner_paid_a_salary):
    """The leg that made this void-only.

    A correction that rewrote the partner row and left this one behind would
    satisfy the test above while telling the employee's page that a payment of
    the old amount still stands.
    """
    ctx = partner_paid_a_salary
    result = _correct(db_session, ctx)

    with entity_context(db_session, ctx["entity_id"]):
        rows = list(
            db_session.scalars(
                select(StaffLedgerEntry).where(
                    StaffLedgerEntry.journal_entry_id
                    == result.corrected.journal_entry.id,
                    StaffLedgerEntry.movement_type == StaffMovementType.SALARY_PAYMENT,
                )
            )
        )
    assert [r.amount_minor for r in rows] == [-CORRECTED]


def test_what_the_employee_is_still_owed_reflects_the_new_amount(
    db_session, partner_paid_a_salary
):
    """The figure an owner actually reads. Paid 250 less, so owed 250 more."""
    ctx = partner_paid_a_salary
    _correct(db_session, ctx)

    with entity_context(db_session, ctx["entity_id"]):
        remaining = staff_ledger.remaining_accrual_minor(db_session, ctx["employee_id"])
    assert remaining == SALARY - CORRECTED


def test_the_accrual_itself_does_not_move(db_session, partner_paid_a_salary):
    """Correcting what was paid must never change what was earned.

    The repost is handed the period's current accrued figure so the
    ensure-accrual step returns early. Passing the *original* salary would
    top it up again on a period nobody reversed, and the employee would be
    owed for a month and a half.
    """
    ctx = partner_paid_a_salary
    with entity_context(db_session, ctx["entity_id"]):
        before = staff_ledger.period_accrued_minor(
            db_session, ctx["employee_id"], **PERIOD
        )

    _correct(db_session, ctx)

    with entity_context(db_session, ctx["entity_id"]):
        after = staff_ledger.period_accrued_minor(
            db_session, ctx["employee_id"], **PERIOD
        )
    assert after == before == SALARY


def test_it_does_not_accrue_extra_days_a_second_time(db_session, staff_setup):  # noqa: F811
    """Extra days are an accrual, and the void does not reverse accruals.

    Re-sending them on the repost would add them on top of the ones already
    standing. The correction takes no extra-days input at all, which is what
    this holds down — the accrual is unchanged by a correction that halves the
    payment.
    """
    entity_id = staff_setup["entity_id"]
    employee_id = staff_setup["employee_id"]
    with entity_context(db_session, entity_id):
        partner = Partner(name="Canan Takan")
        db_session.add(partner)
        db_session.commit()
        db_session.refresh(partner)
        partner_id = partner.id

    result = post_partner_funded_period_salary(
        db_session,
        entity_id,
        employee_id,
        partner_id,
        payment_date=date(2026, 8, 5),
        amount_minor=PAID,
        period_salary_minor=SALARY,
        description="Temmuz maaşı",
        actor_id=ACTOR_ID,
        extra_days=2,
        per_day_minor=50_000,
        **PERIOD,
    )
    with entity_context(db_session, entity_id):
        before = staff_ledger.period_accrued_minor(db_session, employee_id, **PERIOD)

    correct_partner_funded_salary(
        db_session,
        entity_id,
        result.journal_entry.id,
        payment_date=date(2026, 8, 5),
        amount_minor=PAID // 2,
        description="Temmuz maaşı (düzeltildi)",
        actor_id=ACTOR_ID,
        reason="Paid half",
    )

    with entity_context(db_session, entity_id):
        after = staff_ledger.period_accrued_minor(db_session, employee_id, **PERIOD)
    assert after == before, "the extra days were accrued twice"


def test_the_original_is_reversed_rather_than_rewritten(
    db_session, partner_paid_a_salary
):
    """The audit trail every other correction leaves."""
    ctx = partner_paid_a_salary
    result = _correct(db_session, ctx)

    with entity_context(db_session, ctx["entity_id"]):
        original = db_session.get(JournalEntry, ctx["journal_entry_id"])
        assert original is not None
        assert original.status == JournalEntryStatus.VOIDED
        assert result.reversal_journal_entry.id != ctx["journal_entry_id"]
        assert result.corrected.journal_entry.id != ctx["journal_entry_id"]


def test_the_books_still_tie(db_session, partner_paid_a_salary):
    """Subledgers against their control accounts, after all of it.

    Three journal entries now exist where one did — original, reversal and
    replacement — and every staff and partner row has to end up consistent
    with 2250 and 2150.
    """
    ctx = partner_paid_a_salary
    _correct(db_session, ctx)

    with entity_context(db_session, ctx["entity_id"]):
        assert_entity_control_accounts_tied(db_session, ctx["entity_id"])


def test_what_the_business_owes_the_partner_lands_on_the_new_amount(
    db_session, partner_paid_a_salary
):
    ctx = partner_paid_a_salary
    _correct(db_session, ctx)

    with entity_context(db_session, ctx["entity_id"]):
        balance = partner_ledger.reimbursement_balance_kurus(
            db_session, ctx["entity_id"], ctx["partner_id"]
        )
    assert balance == CORRECTED


def test_a_zero_or_negative_amount_is_refused(db_session, partner_paid_a_salary):
    ctx = partner_paid_a_salary
    with pytest.raises(ValueError):
        _correct(db_session, ctx, amount=0)


def test_correcting_something_that_is_not_one_is_refused(db_session, staff_setup):  # noqa: F811
    """Guard the guard: the route must not accept any journal entry at all."""
    entity_id = staff_setup["entity_id"]
    with entity_context(db_session, entity_id):
        other = db_session.scalar(
            select(JournalEntry).where(JournalEntry.entity_id == entity_id)
        )
    assert other is not None, "the fixture posted no journal entries"
    with pytest.raises(CorrectionNotFoundError):
        correct_partner_funded_salary(
            db_session,
            entity_id,
            other.id,
            payment_date=date(2026, 8, 5),
            amount_minor=1000,
            description="nope",
            actor_id=ACTOR_ID,
        )
