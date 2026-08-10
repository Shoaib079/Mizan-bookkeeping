"""Voiding a discount reverses the discount, not the sale it was given on.

A group-sale discount and a customer write-off both post under the journal
source `GROUP_SALE`, and a discount against a sale also carries that sale's
`reference_id`. The ledger read that as "this *is* the group sale" and handed
back `group-sales/{reference_id}/void`.

So pressing Void on 200 TL knocked off a 10.000 TL group sale reversed the
**whole sale**. The route exists and the request succeeds, which is what makes
it the worst kind of wrong: no error, no 404, just the wrong record reversed
and a receivable that now looks paid off.

The write-off had the mirror problem — no `reference_id`, so it fell through
to the credit-sale route, which rejects a DISCOUNT row. That one failed
safely: a button that did nothing.

Both are the same movement type and both belong to the same endpoint.
"""

from __future__ import annotations

import uuid
from datetime import date

import pytest

from app.core.chart_of_accounts.seed import seed_default_chart
from app.core.ledger.entry_actions import resolve_ledger_entry_actions
from app.core.receivables import posting as receivables_posting
from app.db.session import entity_context
from app.features.customers.models import Customer

ACTOR_ID = uuid.UUID("00000000-0000-4000-8000-000000000001")


@pytest.fixture
def customer(db_session, restaurant_a):
    seed_default_chart(db_session, restaurant_a.id)
    with entity_context(db_session, restaurant_a.id):
        row = Customer(name="Grup Turizm")
        db_session.add(row)
        db_session.commit()
        db_session.refresh(row)
        return {"entity_id": restaurant_a.id, "customer_id": row.id}


def _actions_for(db_session, entity_id, journal_entry_id):
    return resolve_ledger_entry_actions(db_session, entity_id, journal_entry_id)


def test_a_group_sale_discount_voids_itself_not_the_sale(db_session, customer):
    """The bug, stated as the thing that must not happen."""
    entity_id, customer_id = customer["entity_id"], customer["customer_id"]
    group_sale_id = uuid.uuid4()

    entry = receivables_posting.post_group_sale_discount(
        db_session,
        entity_id,
        customer_id,
        discount_date=date(2026, 7, 20),
        discount_kurus=20_000,
        description="Group discount",
        actor_id=ACTOR_ID,
        group_sale_id=group_sale_id,
    )
    entry_id = entry.id

    actions = _actions_for(db_session, entity_id, entry_id)

    assert actions.void_path is not None
    assert str(group_sale_id) not in actions.void_path, (
        "the discount's Void points at the group sale — pressing it reverses "
        "the whole sale, not the discount"
    )
    assert actions.void_path == (
        f"customers/{customer_id}/write-offs/{entry_id}/void"
    )


def test_a_group_sale_discount_can_now_be_edited(db_session, customer):
    """Reverses an assertion written earlier the same day, on purpose.

    This asserted `can_edit is False`, which was honest at the time: the
    correction route existed but the General ledger had no form for it, and
    the fallback it used to take opened a *credit-sale* form that posts to a
    route rejecting a DISCOUNT row. Declining beat offering a form that could
    not be submitted.

    The form is wired now. `balance_kurus` rides along in the context because
    the dialog caps a corrected write-off at the customer's outstanding
    balance plus what this one already took off — a number the customer page
    has to hand and the ledger does not.
    """
    entity_id, customer_id = customer["entity_id"], customer["customer_id"]

    entry = receivables_posting.post_group_sale_discount(
        db_session,
        entity_id,
        customer_id,
        discount_date=date(2026, 7, 20),
        discount_kurus=20_000,
        description="Group discount",
        actor_id=ACTOR_ID,
        group_sale_id=uuid.uuid4(),
    )

    actions = _actions_for(db_session, entity_id, entry.id)
    assert actions.can_edit is True
    assert actions.edit is not None
    assert actions.edit.kind == "customer_write_off"
    assert actions.edit.context["customer_id"] == str(customer_id)
    # The number the dialog cannot work out for itself.
    assert "balance_kurus" in actions.edit.context


def test_a_write_off_gets_a_route_that_accepts_it(db_session, customer):
    """The other half: it used to be sent to the credit-sale route, which
    rejects a DISCOUNT row. The button was there and did nothing."""
    entity_id, customer_id = customer["entity_id"], customer["customer_id"]

    # There has to be something to write off — the posting refuses an amount
    # above the outstanding balance, which is right and which the first
    # version of this test did not give it.
    receivables_posting.post_credit_sale(
        db_session,
        entity_id,
        customer_id,
        sale_date=date(2026, 7, 1),
        amount_kurus=50_000,
        description="Unpaid coach party",
        actor_id=ACTOR_ID,
    )

    entry = receivables_posting.post_customer_write_off(
        db_session,
        entity_id,
        customer_id,
        write_off_date=date(2026, 7, 21),
        amount_kurus=15_000,
        description="Uncollectable",
        actor_id=ACTOR_ID,
    )
    entry_id = entry.id

    actions = _actions_for(db_session, entity_id, entry_id)
    assert actions.can_void is True
    assert actions.void_path == (
        f"customers/{customer_id}/write-offs/{entry_id}/void"
    )
    assert "credit-sales" not in actions.void_path


def test_a_real_credit_sale_still_voids_as_a_credit_sale(db_session, customer):
    """The half that must not change.

    Without this, routing every DISCOUNT to write-offs would pass the tests
    above and quietly break voiding an ordinary sale.
    """
    entity_id, customer_id = customer["entity_id"], customer["customer_id"]

    result = receivables_posting.post_credit_sale(
        db_session,
        entity_id,
        customer_id,
        sale_date=date(2026, 7, 22),
        amount_kurus=100_000,
        description="Coach party",
        actor_id=ACTOR_ID,
    )
    entry_id = result.journal_entry.id

    actions = _actions_for(db_session, entity_id, entry_id)
    assert actions.can_edit is True
    assert actions.edit is not None
    assert actions.edit.kind == "customer_credit_sale"
    assert actions.void_path == (
        f"customers/{customer_id}/credit-sales/{entry_id}/void"
    )
