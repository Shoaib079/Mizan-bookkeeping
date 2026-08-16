"""A profit payment can be corrected, but not beyond the profit allocated.

The owner: "put edit button on profit paid transaction". It had none, and the
reason recorded for that was thin — the source sat in `VOID_AND_REENTER_SOURCES`
with the other partner movements. Structurally it is the simplest kind there
is: two lines (Dr 3300, Cr the money account) and one subledger row, exactly
like a drawing, which has always been correctable.

The one thing that genuinely is different is a bound. `post_profit_paid`
refuses to pay more than has been allocated, because paying 90.000 of a 75.000
share leaves the books saying a partner was paid profit the business never
earned them. A correction has to refuse it for the same reason, or the guard
is one route wide.

The row being corrected is still standing when the check runs — the void and
the repost happen after the lines are built — so its own amount is added back
before comparing. The last test here is that arithmetic, because getting it
wrong the other way would refuse every correction that raises an amount by a
kuruş.
"""

from __future__ import annotations

from datetime import date
from decimal import Decimal

import pytest
from sqlalchemy import select

from app.core.chart_of_accounts.models import Account
from app.core.chart_of_accounts.seed import ChartAlreadySeededError, seed_default_chart
from app.core.ledger.correction import CorrectionNotFoundError
from app.core.ledger.models import JournalEntrySource
from app.core.ledger.correction.registry import VOID_AND_REENTER_SOURCES
from app.core.partners import posting as partner_posting
from app.core.partners.profit_allocation import post_profit_allocation
from app.core.partners.types import PartnerMovementType
from app.db.session import entity_context
from app.features.partners import service as partner_service
from app.features.partners.schema import PartnerCreate, PartnerJournalEntryCorrect
from tests.delivery_helpers import ACTOR_ID

ALLOCATED = 7_500_000
PAID = 1_000_000


@pytest.fixture(autouse=True)
def _seed(db_session, restaurant_a):
    try:
        seed_default_chart(db_session, restaurant_a.id)
    except ChartAlreadySeededError:
        pass


def _cash(db_session, entity_id):
    with entity_context(db_session, entity_id):
        return {a.code: a.id for a in db_session.scalars(select(Account))}["1000"]


@pytest.fixture
def profit_paid(db_session, restaurant_a):
    """75.000 allocated, 10.000 of it paid out."""
    entity_id = restaurant_a.id
    partner = partner_service.create_partner(
        db_session,
        entity_id,
        PartnerCreate(name="Canan Takan", ownership_share_pct=Decimal("100")),
    )
    partner_id = partner.id
    post_profit_allocation(
        db_session,
        entity_id,
        allocation_date=date(2026, 8, 3),
        profit_kurus=ALLOCATED,
        description="Partner profit allocation",
        actor_id=ACTOR_ID,
        netting_as_of=date(2026, 8, 3),
    )
    # Posted through the core rather than `record_profit_paid`, which is
    # cash-drawer only and would need a money account set up for a rule this
    # test is not about.
    cash = _cash(db_session, entity_id)
    result = partner_posting.post_profit_paid(
        db_session,
        entity_id,
        partner_id,
        payment_date=date(2026, 8, 12),
        amount_kurus=PAID,
        description="First payout",
        actor_id=ACTOR_ID,
        payment_account_id=cash,
    )
    return entity_id, partner_id, result.journal_entry.id, cash


def _correct(db_session, entity_id, partner_id, entry_id, cash, amount):
    return partner_service.correct_partner_journal_entry_http(
        db_session,
        entity_id,
        partner_id,
        entry_id,
        PartnerJournalEntryCorrect(
            entry_date=date(2026, 8, 12),
            description="Corrected payout",
            actor_id=ACTOR_ID,
            amount_kurus=amount,
            payment_account_id=cash,
        ),
    )


def test_the_source_is_no_longer_void_and_re_enter():
    assert (
        JournalEntrySource.PARTNER_PROFIT_PAID not in VOID_AND_REENTER_SOURCES
    ), "the capability table and this list have to agree, or Edit does nothing"


def test_a_payment_can_be_corrected_down(db_session, profit_paid):
    entity_id, partner_id, entry_id, cash = profit_paid
    _correct(db_session, entity_id, partner_id, entry_id, cash, 400_000)

    ledger = partner_service.get_partner_ledger(db_session, entity_id, partner_id)
    row = next(
        e
        for e in ledger.entries
        if e.movement_type == PartnerMovementType.PROFIT_PAID
        and e.running_balance_kurus is not None
    )
    assert row.amount_kurus == -400_000
    assert ledger.unpaid_profit_kurus == ALLOCATED - 400_000


def test_it_can_be_corrected_up_to_what_was_allocated(db_session, profit_paid):
    """The whole share, in one correction. The bound is the allocation, not
    what happened to be left after this payment."""
    entity_id, partner_id, entry_id, cash = profit_paid
    _correct(db_session, entity_id, partner_id, entry_id, cash, ALLOCATED)

    ledger = partner_service.get_partner_ledger(db_session, entity_id, partner_id)
    assert ledger.unpaid_profit_kurus == 0


def test_it_cannot_be_corrected_past_what_was_allocated(db_session, profit_paid):
    """The guard `post_profit_paid` has always had, on the other route too.

    Without it the correction is a way round the posting rule, and the books
    say a partner was paid profit the business never earned them.
    """
    entity_id, partner_id, entry_id, cash = profit_paid
    with pytest.raises(ValueError, match="exceeds unpaid profit"):
        _correct(db_session, entity_id, partner_id, entry_id, cash, ALLOCATED + 1)


def test_the_bound_adds_back_the_row_being_corrected(db_session, profit_paid):
    """Guard the guard, and the arithmetic that is easy to get wrong.

    Unpaid profit still counts this payment while the correction is being
    built. Comparing against it directly would refuse to raise 10.000 to
    10.001 — a correction that leaves the total *lower* than the allocation.
    """
    entity_id, partner_id, entry_id, cash = profit_paid
    ledger = partner_service.get_partner_ledger(db_session, entity_id, partner_id)
    assert ledger.unpaid_profit_kurus == ALLOCATED - PAID, "fixture assumption"

    _correct(db_session, entity_id, partner_id, entry_id, cash, PAID + 1)

    after = partner_service.get_partner_ledger(db_session, entity_id, partner_id)
    assert after.unpaid_profit_kurus == ALLOCATED - (PAID + 1)


def test_a_partner_funded_salary_is_not_corrected_through_this_route():
    """The neighbour has its own route, and must not fall back to this one.

    Guard the guard: opening profit paid by widening something generic would
    have opened this too, and a correction driven from the partner row would
    rewrite the partner leg and drop the staff ones. It is correctable — see
    `test_partner_funded_salary_correction.py` — but only through
    `staff/partner-funded-salary/{id}/correct`, which moves both.
    """
    from app.core.ledger.correction.registry import GENERIC_CORRECTABLE_SOURCES

    assert (
        JournalEntrySource.PARTNER_SALARY_FRONTED not in GENERIC_CORRECTABLE_SOURCES
    ), "a generic correct would rewrite the partner leg and orphan the staff rows"


def test_capital_contribution_is_still_refused(db_session, profit_paid):
    """The other neighbour. It has no correction branch at all, and asking for
    one should say so rather than post something wrong."""
    entity_id, partner_id, _entry_id, cash = profit_paid
    contribution = partner_posting.post_capital_contribution(
        db_session,
        entity_id,
        partner_id,
        contribution_date=date(2026, 8, 13),
        amount_kurus=500_000,
        description="Capital in",
        actor_id=ACTOR_ID,
        payment_account_id=cash,
    )
    with pytest.raises(CorrectionNotFoundError):
        _correct(
            db_session,
            entity_id,
            partner_id,
            contribution.journal_entry.id,
            cash,
            600_000,
        )
