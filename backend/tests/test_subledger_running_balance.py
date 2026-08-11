"""The balance column follows the rows it is printed beside.

Reported from a supplier export: the closing figure was right, every single
movement date was right, and every date carrying more than one movement was
wrong — the column stepped up after a payment and down after an invoice.

`supplier_activity` accumulated the running balance while building the rows, in
the ledger's own `movement_date, created_at` order, and only afterwards sorted
the rows by `document_ref`. Each row kept the balance it had earned in the
other order. On a date with one movement the two orders agree and nothing looks
wrong; on a date with several they do not. Addition does not care about order,
so the closing figure stayed correct throughout — which is exactly why it
survived: the total reconciled, so nothing downstream complained.

The two sibling builders are right by construction rather than by luck, and it
is worth knowing why before adding a third:

  - `bank_activity` sorts its timeline and *then* walks it accumulating.
  - `partners.service` accumulates over the same list it returns, and never
    re-sorts.

So the rule for any new one: whatever order the rows are emitted in, the
running balance is applied over that order, after it is settled.
"""

from __future__ import annotations

from datetime import date

import pytest
from sqlalchemy import select

from app.core.chart_of_accounts.models import Account
from app.core.chart_of_accounts.seed import ChartAlreadySeededError, seed_default_chart
from app.core.payables import posting as payables_posting
from app.db.session import entity_context
from app.features.payables import supplier_activity
from app.features.suppliers import service as supplier_service
from app.features.suppliers.schema import SupplierCreate
from tests.delivery_helpers import ACTOR_ID

PAID_FIRST = 100_000
PAID_SECOND = 30_000


@pytest.fixture(autouse=True)
def _seed(db_session, restaurant_a):
    try:
        seed_default_chart(db_session, restaurant_a.id)
    except ChartAlreadySeededError:
        pass


@pytest.fixture
def two_payments_one_day(db_session, restaurant_a):
    """Two payments on one date, whose refs sort opposite to how they were made.

    That opposition is the whole scenario. `document_ref` decides the order the
    rows are read in, `created_at` decided the order the balance was
    accumulated in, and they only disagree when a date carries more than one
    movement.
    """
    entity_id = restaurant_a.id
    supplier = supplier_service.create_supplier(
        db_session,
        entity_id,
        SupplierCreate(name="Metro Tedarik", vkn="1234567890", actor_id=ACTOR_ID),
    )
    # Read the id now, and pass the uuid from here on. Touching the instance
    # after an `entity_context` block has closed makes SQLAlchemy refresh it
    # with no entity set, RLS hides the row, and the miss surfaces as
    # ObjectDeletedError — which reads as "the supplier was deleted" rather
    # than "nobody was allowed to look".
    supplier_id = supplier.id

    with entity_context(db_session, entity_id):
        cash = {a.code: a.id for a in db_session.scalars(select(Account))}["1000"]

    for amount, ref in ((PAID_FIRST, "ZZZ-made-first"), (PAID_SECOND, "AAA-made-second")):
        payables_posting.post_supplier_payment(
            db_session,
            entity_id,
            supplier_id,
            payment_date=date(2026, 3, 10),
            amount_kurus=amount,
            description=f"payment {ref}",
            actor_id=ACTOR_ID,
            payment_account_id=cash,
            reference_type=ref,
        )

    return supplier_activity.get_supplier_activity(
        db_session,
        entity_id,
        supplier_id,
        from_date=date(2026, 3, 1),
        to_date=date(2026, 3, 31),
    )


def test_the_scenario_still_puts_the_rows_in_the_opposite_order(
    two_payments_one_day,
) -> None:
    """Guard the guard.

    If the display order ever stopped disagreeing with the order the payments
    were made in, the test below would pass over a case that no longer
    exercises anything.
    """
    refs = [row.document_ref for row in two_payments_one_day.rows if row.document_ref != "—"]
    assert refs == ["AAA-made-second", "ZZZ-made-first"], (
        "the rows are no longer sorted opposite to how they were recorded, so "
        "this scenario no longer reproduces the fault it exists for"
    )


def test_each_balance_follows_the_row_above_it(two_payments_one_day) -> None:
    report = two_payments_one_day
    # Opening, the second payment, the first payment, closing — the balance
    # walking down in the order the rows are read.
    assert [row.balance_kurus for row in report.rows] == [
        0,
        -PAID_SECOND,
        -PAID_SECOND - PAID_FIRST,
        -PAID_SECOND - PAID_FIRST,
    ]


def test_a_payment_never_raises_the_balance(two_payments_one_day) -> None:
    """The shape of the symptom, stated on its own.

    Before the fix this sequence read 0, -130_000, -100_000: the second row of
    the day *rose* by 70_000 after a payment of 100_000. Someone reading the
    column to check a supplier had no way to make sense of that.
    """
    balances = [row.balance_kurus for row in two_payments_one_day.rows]
    for previous, current in zip(balances, balances[1:]):
        assert current <= previous, (
            f"balance rose from {previous} to {current} across payments only"
        )


def test_the_closing_figure_is_unchanged(two_payments_one_day) -> None:
    """It was right before the fix and has to stay right after it.

    The bug was invisible precisely because this held: the rows were scrambled
    against their balances but the total still reconciled.
    """
    report = two_payments_one_day
    assert report.closing_balance_kurus == -PAID_FIRST - PAID_SECOND
    assert report.rows[-1].balance_kurus == report.closing_balance_kurus
    assert report.rows[0].balance_kurus == report.opening_balance_kurus
