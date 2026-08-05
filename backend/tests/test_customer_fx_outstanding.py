"""What a customer owes, in the currency they agreed to pay in.

The books are in lira and stay that way — `balance_kurus` is the ledger's
truth. But an agency that booked in USD will hand over USD, and the lira
equivalent drifts with the rate until they do, so the amount they owe is worth
naming in its own currency. One agency can owe in several at once.
"""

from __future__ import annotations

import uuid

from app.features.group_sales.fx_receivable import outstanding_by_currency


def test_a_customer_with_no_forex_sales_owes_nothing_in_forex(db_session, restaurant_a):
    from app.db.session import entity_context

    with entity_context(db_session, restaurant_a.id):
        assert outstanding_by_currency(db_session, uuid.uuid4()) == []


def test_settled_currencies_are_left_out(db_session, restaurant_a):
    """A currency paid down to zero is not a line worth showing."""
    from app.db.session import entity_context

    with entity_context(db_session, restaurant_a.id):
        rows = outstanding_by_currency(db_session, uuid.uuid4())
    assert all(minor != 0 for _currency, minor in rows)
