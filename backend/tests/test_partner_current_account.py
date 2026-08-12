"""What a partner is owed, netted against what they have taken.

Reported by the owner, reading their own ledger: profit allocated 68.763,91,
then a drawing of 80.800, and the app announcing a debt of 80.800 on the same
page that owed them 68.763,91. Their arithmetic — "I owe about twelve
thousand" — was right; the app simply held two figures and never subtracted.

The cause was that netting only happens at the moment profit is *allocated*,
against drawings outstanding right then. Profit already allocated and left
unpaid is never applied to a drawing taken afterwards.

The fix is a reading, not a posting. `CURRENT_ACCOUNT_MOVEMENT_TYPES` adds
profit allocated and profit paid to what the balance counts.
`NET_BALANCE_MOVEMENT_TYPES` is deliberately left alone: it decides how much of
a new allocation clears drawings, and folding credited profit into *that* would
make a partner look less overdrawn than they are and settle less than it
should. The two questions look alike and are not the same one, which is what
the last test here holds down.
"""

from __future__ import annotations

from datetime import date
from decimal import Decimal

import pytest
from sqlalchemy import select

from app.core.chart_of_accounts.models import Account
from app.core.chart_of_accounts.seed import ChartAlreadySeededError, seed_default_chart
from app.core.partners import ledger as partner_ledger
from app.core.partners.types import (
    CURRENT_ACCOUNT_MOVEMENT_TYPES,
    NET_BALANCE_MOVEMENT_TYPES,
    PartnerMovementType,
)
from app.db.session import entity_context
from app.core.partners import posting as partner_posting
from app.core.partners.profit_allocation import post_profit_allocation
from app.features.partners import service as partner_service
from app.features.partners.schema import PartnerCreate
from tests.delivery_helpers import ACTOR_ID

#: The owner's own numbers, in kuruş.
PROFIT = 6_876_391
DRAWING = 8_080_000


@pytest.fixture(autouse=True)
def _seed(db_session, restaurant_a):
    try:
        seed_default_chart(db_session, restaurant_a.id)
    except ChartAlreadySeededError:
        pass


class TestTheSetsAnswerDifferentQuestions:
    """Held apart on purpose, because widening one is the tempting shortcut."""

    def test_the_reading_set_counts_credited_profit(self) -> None:
        assert PartnerMovementType.PROFIT_ALLOCATION in CURRENT_ACCOUNT_MOVEMENT_TYPES
        assert PartnerMovementType.PROFIT_PAID in CURRENT_ACCOUNT_MOVEMENT_TYPES

    def test_the_settlement_set_does_not(self) -> None:
        # If this ever fails, `split_profit_by_ownership` has started seeing
        # already-allocated profit as though it reduced the drawings a new
        # allocation should clear — and less will be settled than should be.
        assert (
            PartnerMovementType.PROFIT_ALLOCATION not in NET_BALANCE_MOVEMENT_TYPES
        ), "widening the settlement set changes what gets posted, not what is read"
        assert PartnerMovementType.PROFIT_PAID not in NET_BALANCE_MOVEMENT_TYPES

    def test_neither_counts_capital(self) -> None:
        """Money put into the business is not a debt it repays on demand.

        Counting it would have shown this owner as being owed roughly 463.700
        rather than owing twelve thousand.
        """
        for movements in (CURRENT_ACCOUNT_MOVEMENT_TYPES, NET_BALANCE_MOVEMENT_TYPES):
            assert PartnerMovementType.CAPITAL_CONTRIBUTION not in movements

    def test_reading_is_the_wider_of_the_two(self) -> None:
        # Guard the guard: were the sets ever swapped, the assertions above
        # would still pass one at a time.
        assert NET_BALANCE_MOVEMENT_TYPES < CURRENT_ACCOUNT_MOVEMENT_TYPES


@pytest.fixture
def owed_profit_then_overdrawn(db_session, restaurant_a):
    """The reported shape: profit credited, then more than that taken out.

    The order matters and is the whole point. Netting happens when profit is
    allocated, against drawings outstanding *then*; this drawing comes after,
    so nothing settles it and the two figures sit apart.
    """
    entity_id = restaurant_a.id
    partner = partner_service.create_partner(
        db_session,
        entity_id,
        PartnerCreate(name="Canan Takan", ownership_share_pct=Decimal("100")),
    )
    partner_id = partner.id

    with entity_context(db_session, entity_id):
        cash = {a.code: a.id for a in db_session.scalars(select(Account))}["1000"]

    post_profit_allocation(
        db_session,
        entity_id,
        allocation_date=date(2026, 8, 3),
        profit_kurus=PROFIT,
        description="Partner profit allocation",
        actor_id=ACTOR_ID,
        netting_as_of=date(2026, 8, 3),
    )
    partner_posting.post_drawing(
        db_session,
        entity_id,
        partner_id,
        drawing_date=date(2026, 8, 10),
        amount_kurus=DRAWING,
        description="Cashier sent it",
        actor_id=ACTOR_ID,
        payment_account_id=cash,
    )
    return entity_id, partner_id


def test_the_balance_the_partner_reads_nets_the_profit(
    db_session, owed_profit_then_overdrawn
) -> None:
    # Through the service, because there is no separate query to call: the
    # running column already walks this set, so its final value *is* the
    # figure. That is deliberate — it makes the header and the last row
    # unable to disagree, rather than merely tested for agreeing.
    entity_id, partner_id = owed_profit_then_overdrawn
    ledger = partner_service.get_partner_ledger(db_session, entity_id, partner_id)
    # Owed 68.763,91, took 80.800 — owes 12.036,09.
    assert ledger.current_account_kurus == PROFIT - DRAWING


def test_the_settlement_figure_still_sees_the_whole_drawing(
    db_session, owed_profit_then_overdrawn
) -> None:
    """The narrower figure has not moved, and must not.

    The next allocation settles against this. If credited profit reduced it,
    the drawing would look part-cleared by profit that was never applied to it,
    and less would settle than should.
    """
    entity_id, partner_id = owed_profit_then_overdrawn
    with entity_context(db_session, entity_id):
        net = partner_ledger.net_balance_kurus(db_session, entity_id, partner_id)
    assert net == -DRAWING


def test_the_ledger_column_ends_on_the_figure_it_reports(
    db_session, owed_profit_then_overdrawn
) -> None:
    """The header and the last row have to agree.

    A statement whose total does not match the column above it is the fault
    this project has already fixed once, on the supplier ledger.
    """
    entity_id, partner_id = owed_profit_then_overdrawn
    ledger = partner_service.get_partner_ledger(db_session, entity_id, partner_id)
    effective = [e for e in ledger.entries if e.running_balance_kurus is not None]
    assert effective[-1].running_balance_kurus == ledger.current_account_kurus
    assert ledger.current_account_kurus == PROFIT - DRAWING


def test_capital_stays_out_of_it(db_session, owed_profit_then_overdrawn) -> None:
    """Contributing capital must not make the business look indebted for it."""
    entity_id, partner_id = owed_profit_then_overdrawn
    before = partner_service.get_partner_ledger(
        db_session, entity_id, partner_id
    ).current_account_kurus

    partner_posting.post_capital_contribution(
        db_session,
        entity_id,
        partner_id,
        contribution_date=date(2026, 8, 11),
        amount_kurus=54_450_000,
        description="Capital in",
        actor_id=ACTOR_ID,
        payment_account_id=_cash_account(db_session, entity_id),
    )

    after = partner_service.get_partner_ledger(
        db_session, entity_id, partner_id
    ).current_account_kurus
    assert after == before


def _cash_account(db_session, entity_id):
    with entity_context(db_session, entity_id):
        return {a.code: a.id for a in db_session.scalars(select(Account))}["1000"]
