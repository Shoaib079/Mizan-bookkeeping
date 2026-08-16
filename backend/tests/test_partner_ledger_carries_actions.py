"""The partner ledger says what may be done to each row, with the rows.

The owner: "when i load page or open partner page the action buttons load
after the page loads". They did, because the page asked in a second request —
one round trip for work that had to happen either way, and visible every time.

So the ledger carries the verdicts. The standalone route stays, because a page
may need to ask about rows it did not get from here, and because a page running
against a backend older than this still has to work.

What matters is that the two never disagree. They call the same resolver and
the same converter, and the first test here compares them rather than trusting
that.
"""

from __future__ import annotations

from datetime import date
from decimal import Decimal

import pytest
from sqlalchemy import select

from app.core.chart_of_accounts.models import Account
from app.core.chart_of_accounts.seed import ChartAlreadySeededError, seed_default_chart
from app.core.ledger.entry_actions import resolve_entry_actions_for_ids
from app.core.partners import posting as partner_posting
from app.core.partners.profit_allocation import post_profit_allocation
from app.db.session import entity_context
from app.features.partners import service as partner_service
from app.features.partners.schema import PartnerCreate
from tests.delivery_helpers import ACTOR_ID


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
def one_partner_with_movements(db_session, restaurant_a):
    """A drawing and an allocation, on a book with a single partner.

    Single partner on purpose: it is the case where an allocation is *not*
    shared, which is where the page may offer to edit it and where nothing
    used to stop it opening the wrong form.
    """
    entity_id = restaurant_a.id
    partner = partner_service.create_partner(
        db_session,
        entity_id,
        PartnerCreate(name="Canan Takan", ownership_share_pct=Decimal("100")),
    )
    partner_id = partner.id
    partner_posting.post_drawing(
        db_session,
        entity_id,
        partner_id,
        drawing_date=date(2026, 7, 25),
        amount_kurus=623_609,
        description="Cashier sent it",
        actor_id=ACTOR_ID,
        payment_account_id=_cash(db_session, entity_id),
    )
    post_profit_allocation(
        db_session,
        entity_id,
        allocation_date=date(2026, 8, 3),
        profit_kurus=7_500_000,
        description="Partner profit allocation",
        actor_id=ACTOR_ID,
        netting_as_of=date(2026, 8, 3),
    )
    return entity_id, partner_id


def test_every_row_comes_with_its_verdict(db_session, one_partner_with_movements):
    entity_id, partner_id = one_partner_with_movements
    ledger = partner_service.get_partner_ledger(db_session, entity_id, partner_id)

    wanted = {
        str(e.journal_entry_id)
        for e in ledger.entries
        if e.journal_entry_id is not None
    }
    assert wanted, "the fixture posted nothing"
    assert set(ledger.entry_actions) == wanted, (
        "a row with no verdict draws no buttons, which is the fault this was "
        "meant to end"
    )


def test_it_agrees_with_the_resolver_the_route_uses(
    db_session, one_partner_with_movements
):
    """Guard the guard.

    Two endpoints answering the same question separately is how this area
    accumulated its bugs. If these ever diverge, a partner page and the General
    ledger disagree about the same row.
    """
    entity_id, partner_id = one_partner_with_movements
    ledger = partner_service.get_partner_ledger(db_session, entity_id, partner_id)

    ids = [e.journal_entry_id for e in ledger.entries if e.journal_entry_id]
    direct = resolve_entry_actions_for_ids(db_session, entity_id, ids)

    for entry_id, actions in direct.items():
        sent = ledger.entry_actions[str(entry_id)]
        assert sent.can_edit == actions.can_edit
        assert sent.can_void == actions.can_void
        assert sent.void_path == actions.void_path
        assert sent.owner_count == actions.owner_count


def test_the_allocation_names_the_form_that_can_open_it(
    db_session, one_partner_with_movements
):
    """The partner page keys on this to decide whether to draw Edit at all.

    On a one-partner book the allocation is not shared, so nothing else stops
    the button — it drew, opened the partner-ledger form and failed on submit
    with "must be voided at entity level".
    """
    entity_id, partner_id = one_partner_with_movements
    ledger = partner_service.get_partner_ledger(db_session, entity_id, partner_id)

    allocation = next(
        e for e in ledger.entries if e.movement_type.value == "profit_allocation"
    )
    edit = ledger.entry_actions[str(allocation.journal_entry_id)].edit
    assert edit is not None and edit.kind == "partner_profit_allocation"
    assert {"allocation_date", "description", "profit_kurus"} <= set(edit.context)


def test_a_drawing_still_names_the_partner_ledger_form(
    db_session, one_partner_with_movements
):
    # The other side of it: if every kind came back the same, the assertion
    # above would pass over a page that opens one form for everything.
    entity_id, partner_id = one_partner_with_movements
    ledger = partner_service.get_partner_ledger(db_session, entity_id, partner_id)

    drawing = next(e for e in ledger.entries if e.movement_type.value == "drawing")
    edit = ledger.entry_actions[str(drawing.journal_entry_id)].edit
    assert edit is not None and edit.kind == "partner_ledger"


def test_an_empty_ledger_carries_an_empty_map(db_session, restaurant_a):
    """A partner with no movements is not an error, and asks nothing."""
    partner = partner_service.create_partner(
        db_session, restaurant_a.id, PartnerCreate(name="New Partner")
    )
    ledger = partner_service.get_partner_ledger(
        db_session, restaurant_a.id, partner.id
    )
    assert ledger.entries == []
    assert ledger.entry_actions == {}
