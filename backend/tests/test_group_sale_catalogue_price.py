"""The catalogue price fills a box; it never posts (MENU_PLAN.md slice 5).

Picking a menu on the sale form pre-fills the rate. What is in that box when
Save is pressed is what reaches the ledger — the server does not look the
price up and substitute it.

This file exists because that is the one place the menu feature could have
reached the books. A menu price is edited whenever prices change; a sale is a
fact about a day. If the server priced from the catalogue, the same request
replayed after a price rise would post a different figure and nothing on
screen would have said so.

The two tests below are the guarantee. Both would go green on an
implementation that silently substituted, so each asserts the *difference*
between what was sent and what the catalogue holds.
"""

from __future__ import annotations

import uuid
from datetime import date

import pytest
from sqlalchemy import select

from app.core.chart_of_accounts.seed import seed_default_chart
from app.db.session import entity_context
from app.features.customers.models import Customer
from app.features.group_sales.models import GroupMenu, GroupSale, GroupSaleLine
from app.features.group_sales import service as group_sales_service
from app.features.group_sales.schema import GroupSaleCreate, GroupSaleLineInput

ACTOR_ID = uuid.UUID("00000000-0000-4000-8000-000000000001")

CATALOGUE_PRICE_MINOR = 1500  # $15.00 on the menu
AGREED_RATE_MINOR = 1200  # $12.00 actually agreed with the agency


@pytest.fixture
def priced_menu(db_session, restaurant_a):
    """A customer and a menu carrying a catalogue price."""
    seed_default_chart(db_session, restaurant_a.id)
    with entity_context(db_session, restaurant_a.id):
        customer = Customer(name="Agency Tours Ltd")
        menu = GroupMenu(
            name="Veg Menu 1",
            price_minor=CATALOGUE_PRICE_MINOR,
            currency="USD",
        )
        db_session.add_all([customer, menu])
        db_session.commit()
        # Ids captured inside the context: read after the commit and outside
        # it, RLS hides the rows and SQLAlchemy raises ObjectDeletedError
        # (tests/conftest.py).
        return {"customer_id": customer.id, "menu_id": menu.id}


def _post(db_session, entity_id, ids, *, rate_minor: int) -> GroupSale:
    return group_sales_service.post_group_sale(
        db_session,
        entity_id,
        GroupSaleCreate(
            customer_id=ids["customer_id"],
            sale_date=date(2026, 8, 7),
            description="Agency lunch",
            currency="USD",
            fx_rate_used=3500,
            lines=[
                GroupSaleLineInput(
                    group_menu_id=ids["menu_id"],
                    pax=10,
                    rate_per_person_minor=rate_minor,
                )
            ],
            actor_id=ACTOR_ID,
        ),
    )


def test_an_agreed_rate_posts_not_the_catalogue_price(
    db_session, restaurant_a, priced_menu
):
    """$12.00 was agreed on a menu listing $15.00. $12.00 posts."""
    sale = _post(db_session, restaurant_a.id, priced_menu, rate_minor=AGREED_RATE_MINOR)
    sale_id = sale.id

    with entity_context(db_session, restaurant_a.id):
        line = db_session.scalar(
            select(GroupSaleLine).where(GroupSaleLine.group_sale_id == sale_id)
        )
        assert line.rate_per_person_minor == AGREED_RATE_MINOR
        assert line.line_total_minor == AGREED_RATE_MINOR * 10
        assert line.rate_per_person_minor != CATALOGUE_PRICE_MINOR, (
            "the server substituted the catalogue price for the agreed one"
        )


def test_repricing_the_menu_afterwards_does_not_move_a_posted_sale(
    db_session, restaurant_a, priced_menu
):
    """A sale is a fact about a day, not a view of today's price list."""
    sale = _post(db_session, restaurant_a.id, priced_menu, rate_minor=AGREED_RATE_MINOR)
    sale_id = sale.id

    with entity_context(db_session, restaurant_a.id):
        menu = db_session.get(GroupMenu, priced_menu["menu_id"])
        menu.price_minor = 9900
        db_session.commit()

    with entity_context(db_session, restaurant_a.id):
        line = db_session.scalar(
            select(GroupSaleLine).where(GroupSaleLine.group_sale_id == sale_id)
        )
        assert line.rate_per_person_minor == AGREED_RATE_MINOR
        assert line.line_total_minor == AGREED_RATE_MINOR * 10
        posted = db_session.get(GroupSale, sale_id)
        assert posted.total_forex_minor == AGREED_RATE_MINOR * 10


def test_the_menu_name_is_snapshotted_onto_the_line(
    db_session, restaurant_a, priced_menu
):
    """Renaming a menu must not rewrite what a past sale says it sold."""
    sale = _post(db_session, restaurant_a.id, priced_menu, rate_minor=AGREED_RATE_MINOR)
    sale_id = sale.id

    with entity_context(db_session, restaurant_a.id):
        menu = db_session.get(GroupMenu, priced_menu["menu_id"])
        menu.name = "Veg Menu 1 (2027 prices)"
        db_session.commit()

    with entity_context(db_session, restaurant_a.id):
        line = db_session.scalar(
            select(GroupSaleLine).where(GroupSaleLine.group_sale_id == sale_id)
        )
        assert line.menu_name_snapshot == "Veg Menu 1"
