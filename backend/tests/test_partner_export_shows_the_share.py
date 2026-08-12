"""A partner's profit share appears in their statement as one figure.

The owner, twice: "my profit allocated was 75k", and then of the corrected
export — "it still does not show the profit allocation". Both were right. The
posting engine never writes a share as a row; it splits it into the part that
cleared open drawings and the smaller part credited to the partner. Their
75.000 was 6.236,09 on one line and 68.763,91 on another, under two different
labels, and the only total on the sheet was the lifetime 175.000.

So each allocation is headed by its own gross, and the rows beneath read as the
breakdown. The statement then reconciles both ways: the headings sum to "Profit
allocated" in the summary, and each heading's rows sum to it.

The partner page has grouped them this way since it was built
(`groupPartnerLedgerRows`). This is the export catching up, which is why the
wording is copied from it rather than invented.
"""

from __future__ import annotations

from datetime import date
from decimal import Decimal

import pytest
from sqlalchemy import select

from app.core.chart_of_accounts.models import Account
from app.core.chart_of_accounts.seed import ChartAlreadySeededError, seed_default_chart
from app.core.partners import posting as partner_posting
from app.core.partners.profit_allocation import post_profit_allocation
from app.db.session import entity_context
from app.features.partners import ledger_export
from app.features.partners import service as partner_service
from app.features.partners.schema import PartnerCreate
from tests.delivery_helpers import ACTOR_ID

#: Kuruş. 6.236,09 taken out first, then a 75.000,00 share — the owner's own
#: figures, and the pair that makes the allocation split into two rows.
DRAWN_FIRST = 623_609
SHARE = 7_500_000


@pytest.fixture(autouse=True)
def _seed(db_session, restaurant_a):
    try:
        seed_default_chart(db_session, restaurant_a.id)
    except ChartAlreadySeededError:
        pass


@pytest.fixture
def allocation_split_in_two(db_session, restaurant_a):
    """A share big enough to clear a drawing and leave a residual.

    Both halves are needed: an allocation that lands whole writes one row, and
    the missing-total problem only exists once it writes two.
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

    partner_posting.post_drawing(
        db_session,
        entity_id,
        partner_id,
        drawing_date=date(2026, 7, 25),
        amount_kurus=DRAWN_FIRST,
        description="Taken before the allocation",
        actor_id=ACTOR_ID,
        payment_account_id=cash,
    )
    post_profit_allocation(
        db_session,
        entity_id,
        allocation_date=date(2026, 8, 3),
        profit_kurus=SHARE,
        description="Partner profit allocation",
        actor_id=ACTOR_ID,
        netting_as_of=date(2026, 8, 3),
    )
    ledger = partner_service.get_partner_ledger(db_session, entity_id, partner_id)
    return ledger, ledger_export._rows(
        [e for e in ledger.entries if e.running_balance_kurus is not None]
    )


def test_the_share_appears_as_one_figure(allocation_split_in_two) -> None:
    _ledger, rows = allocation_split_in_two
    headings = [r for r in rows if r.movement.endswith("profit allocation")]
    assert [r.amount_minor for r in headings] == [SHARE], (
        "the partner's share is still only visible as its two halves"
    )


def test_the_heading_names_the_period(allocation_split_in_two) -> None:
    # "August 2026 profit allocation" — a share with no period is not a fact
    # anyone can check against a month's books.
    _ledger, rows = allocation_split_in_two
    heading = next(r for r in rows if r.movement.endswith("profit allocation"))
    assert heading.movement == "August 2026 profit allocation"


def test_the_rows_beneath_add_up_to_it(allocation_split_in_two) -> None:
    _ledger, rows = allocation_split_in_two
    index = next(i for i, r in enumerate(rows) if r.movement.endswith("profit allocation"))
    parts = [rows[index + 1], rows[index + 2]]
    assert {r.movement for r in parts} == {
        "— cleared earlier drawings",
        "— added to capital",
    }
    assert sum(r.amount_minor for r in parts) == rows[index].amount_minor


def test_the_headings_add_up_to_the_summary(allocation_split_in_two) -> None:
    """The other direction, which is the one that was broken.

    Adding the rows that looked like allocations gave 88.763,91 against a
    header of 175.000, because the rest wore a different label.
    """
    ledger, rows = allocation_split_in_two
    headings = [r for r in rows if r.movement.endswith("profit allocation")]
    assert sum(r.amount_minor for r in headings) == ledger.profit_allocated_kurus


def test_the_heading_carries_no_running_balance(allocation_split_in_two) -> None:
    # It is a subtotal of the two rows under it, not a movement. Giving it a
    # running figure would make the column count the share twice.
    _ledger, rows = allocation_split_in_two
    heading = next(r for r in rows if r.movement.endswith("profit allocation"))
    assert heading.running_minor is None


def test_ordinary_movements_are_untouched(allocation_split_in_two) -> None:
    # Guard the guard: if grouping swallowed everything, the tests above would
    # pass over a statement with nothing else in it.
    _ledger, rows = allocation_split_in_two
    assert any(r.movement == "Drawing" for r in rows)
    assert all(r.running_minor is not None for r in rows if r.movement == "Drawing")
