"""What a customer owes, in the currency they agreed to pay in.

The books are in lira and stay that way — `balance_kurus` is the ledger's
truth. But an agency that booked in USD will hand over USD, and the lira
equivalent drifts with the rate until they do, so the amount they owe is worth
naming in its own currency. One agency can owe in several at once.

There are two implementations of that figure: `outstanding_by_currency` for a
single customer, and `outstanding_by_currency_for_customers` for a whole
directory page in one query. Two implementations of one rule is how the rule
stops being one rule, so most of what follows checks they agree.
"""

from __future__ import annotations

import uuid
from datetime import date

from app.core.receivables.ledger import persist_customer_ledger_entry
from app.core.receivables.types import CustomerMovementType
from app.db.session import entity_context
from app.features.customers.models import Customer
from app.features.group_sales.fx_receivable import (
    outstanding_by_currency,
    outstanding_by_currency_for_customers,
)

ACTOR = uuid.uuid4()


def _customer(db_session, entity_id, name: str) -> Customer:
    customer = Customer(entity_id=entity_id, name=name)
    db_session.add(customer)
    db_session.flush()
    return customer


def _entry(
    db_session,
    customer_id,
    *,
    movement_type: CustomerMovementType,
    amount_kurus: int,
    currency: str | None = None,
    total_forex_minor: int | None = None,
    payment_native_quantity: int | None = None,
):
    return persist_customer_ledger_entry(
        db_session,
        customer_id,
        movement_date=date(2026, 3, 1),
        movement_type=movement_type,
        amount_kurus=amount_kurus,
        description="test",
        actor_id=ACTOR,
        forex_currency=currency,
        total_forex_minor=total_forex_minor,
        payment_native_quantity=payment_native_quantity,
    )


def test_a_customer_with_no_forex_sales_owes_nothing_in_forex(db_session, restaurant_a):
    with entity_context(db_session, restaurant_a.id):
        assert outstanding_by_currency(db_session, uuid.uuid4()) == []


def test_an_unpaid_usd_booking_is_owed_in_usd(db_session, restaurant_a):
    with entity_context(db_session, restaurant_a.id):
        agency = _customer(db_session, restaurant_a.id, "Agency")
        # 94.00 USD billed, carried at 4,136.00 TRY.
        _entry(
            db_session,
            agency.id,
            movement_type=CustomerMovementType.CREDIT_SALE,
            amount_kurus=413_600,
            currency="USD",
            total_forex_minor=9_400,
        )
        assert outstanding_by_currency(db_session, agency.id) == [("USD", 9_400)]


def test_a_currency_paid_down_to_zero_is_left_out(db_session, restaurant_a):
    with entity_context(db_session, restaurant_a.id):
        agency = _customer(db_session, restaurant_a.id, "Settled")
        _entry(
            db_session,
            agency.id,
            movement_type=CustomerMovementType.CREDIT_SALE,
            amount_kurus=413_600,
            currency="USD",
            total_forex_minor=9_400,
        )
        _entry(
            db_session,
            agency.id,
            movement_type=CustomerMovementType.PAYMENT_RECEIVED,
            amount_kurus=-413_600,
            currency="USD",
            payment_native_quantity=9_400,
        )
        assert outstanding_by_currency(db_session, agency.id) == []


def test_overpaying_reads_as_a_negative_balance(db_session, restaurant_a):
    """Not a guess — India Gate's ledger has exactly this shape.

    624 USD billed against 922 USD received. The figure is legitimate and the
    page has to say something sensible about it, so it must survive the query
    rather than be filtered out as nonsense.
    """
    with entity_context(db_session, restaurant_a.id):
        agency = _customer(db_session, restaurant_a.id, "Walk in")
        _entry(
            db_session,
            agency.id,
            movement_type=CustomerMovementType.CREDIT_SALE,
            amount_kurus=2_745_600,
            currency="USD",
            total_forex_minor=62_400,
        )
        _entry(
            db_session,
            agency.id,
            movement_type=CustomerMovementType.PAYMENT_RECEIVED,
            amount_kurus=-2_745_600,
            currency="USD",
            payment_native_quantity=92_200,
        )
        assert outstanding_by_currency(db_session, agency.id) == [("USD", -29_800)]


def test_one_customer_can_owe_in_two_currencies(db_session, restaurant_a):
    with entity_context(db_session, restaurant_a.id):
        agency = _customer(db_session, restaurant_a.id, "Two currencies")
        _entry(
            db_session,
            agency.id,
            movement_type=CustomerMovementType.CREDIT_SALE,
            amount_kurus=413_600,
            currency="USD",
            total_forex_minor=9_400,
        )
        _entry(
            db_session,
            agency.id,
            movement_type=CustomerMovementType.CREDIT_SALE,
            amount_kurus=200_000,
            currency="EUR",
            total_forex_minor=5_000,
        )
        # Sorted, so the order does not wander between calls.
        assert outstanding_by_currency(db_session, agency.id) == [
            ("EUR", 5_000),
            ("USD", 9_400),
        ]


def test_a_reversed_sale_is_not_counted(db_session, restaurant_a):
    """`native_balance_for_currency` only counts sales with amount_kurus > 0.

    A correction leaves a non-positive credit-sale row behind. Counting it
    would inflate what the customer appears to owe.
    """
    with entity_context(db_session, restaurant_a.id):
        agency = _customer(db_session, restaurant_a.id, "Reversed")
        _entry(
            db_session,
            agency.id,
            movement_type=CustomerMovementType.CREDIT_SALE,
            amount_kurus=413_600,
            currency="USD",
            total_forex_minor=9_400,
        )
        _entry(
            db_session,
            agency.id,
            movement_type=CustomerMovementType.CREDIT_SALE,
            amount_kurus=-413_600,
            currency="USD",
            total_forex_minor=9_400,
        )
        assert outstanding_by_currency(db_session, agency.id) == [("USD", 9_400)]


def test_the_bulk_query_agrees_with_the_per_customer_one(db_session, restaurant_a):
    """The directory and the detail page must not disagree about a debt.

    The list endpoint cannot afford 1 + N queries per customer, so it uses a
    grouped query instead. Two ways of computing one number drift the moment
    someone edits one of them; this pins them together over a mix of shapes —
    unpaid, part paid, settled, overpaid, reversed, and multi-currency.
    """
    with entity_context(db_session, restaurant_a.id):
        unpaid = _customer(db_session, restaurant_a.id, "Unpaid")
        _entry(
            db_session,
            unpaid.id,
            movement_type=CustomerMovementType.CREDIT_SALE,
            amount_kurus=413_600,
            currency="USD",
            total_forex_minor=9_400,
        )

        part_paid = _customer(db_session, restaurant_a.id, "Part paid")
        _entry(
            db_session,
            part_paid.id,
            movement_type=CustomerMovementType.CREDIT_SALE,
            amount_kurus=413_600,
            currency="EUR",
            total_forex_minor=9_400,
        )
        _entry(
            db_session,
            part_paid.id,
            movement_type=CustomerMovementType.PAYMENT_RECEIVED,
            amount_kurus=-200_000,
            currency="EUR",
            payment_native_quantity=4_000,
        )

        settled = _customer(db_session, restaurant_a.id, "Settled")
        _entry(
            db_session,
            settled.id,
            movement_type=CustomerMovementType.CREDIT_SALE,
            amount_kurus=100_000,
            currency="GBP",
            total_forex_minor=2_000,
        )
        _entry(
            db_session,
            settled.id,
            movement_type=CustomerMovementType.PAYMENT_RECEIVED,
            amount_kurus=-100_000,
            currency="GBP",
            payment_native_quantity=2_000,
        )

        overpaid = _customer(db_session, restaurant_a.id, "Overpaid")
        _entry(
            db_session,
            overpaid.id,
            movement_type=CustomerMovementType.CREDIT_SALE,
            amount_kurus=2_745_600,
            currency="USD",
            total_forex_minor=62_400,
        )
        _entry(
            db_session,
            overpaid.id,
            movement_type=CustomerMovementType.PAYMENT_RECEIVED,
            amount_kurus=-2_745_600,
            currency="USD",
            payment_native_quantity=92_200,
        )

        discounted = _customer(db_session, restaurant_a.id, "Discounted")
        _entry(
            db_session,
            discounted.id,
            movement_type=CustomerMovementType.CREDIT_SALE,
            amount_kurus=413_600,
            currency="USD",
            total_forex_minor=9_400,
        )
        # Write-offs are stored negative, so they reduce the balance.
        _entry(
            db_session,
            discounted.id,
            movement_type=CustomerMovementType.DISCOUNT,
            amount_kurus=-40_000,
            currency="USD",
            total_forex_minor=-900,
        )

        lira_only = _customer(db_session, restaurant_a.id, "Lira only")
        _entry(
            db_session,
            lira_only.id,
            movement_type=CustomerMovementType.CREDIT_SALE,
            amount_kurus=150_000,
        )

        everyone = [unpaid, part_paid, settled, overpaid, discounted, lira_only]
        bulk = outstanding_by_currency_for_customers(
            db_session, [c.id for c in everyone]
        )

        for customer in everyone:
            one = outstanding_by_currency(db_session, customer.id)
            many = bulk.get(customer.id, [])
            assert many == one, (
                f"{customer.name}: directory says {many}, detail page says {one}"
            )

        # And the shapes are what we think they are, so the agreement above is
        # not two implementations being identically wrong.
        assert bulk[unpaid.id] == [("USD", 9_400)]
        assert bulk[part_paid.id] == [("EUR", 5_400)]
        assert settled.id not in bulk
        assert bulk[overpaid.id] == [("USD", -29_800)]
        assert bulk[discounted.id] == [("USD", 8_500)]
        assert lira_only.id not in bulk


def test_the_bulk_query_handles_an_empty_page(db_session, restaurant_a):
    with entity_context(db_session, restaurant_a.id):
        assert outstanding_by_currency_for_customers(db_session, []) == {}
