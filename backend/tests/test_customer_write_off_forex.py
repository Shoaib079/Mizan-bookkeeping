"""A write-off has to settle the foreign currency too, and be undoable.

`post_customer_write_off` already computed a native amount — but only
`if native_bal > 0`. Before `native_balance_for_currency` was fixed, a
customer whose payment had been corrected read as *negative* there, so the
condition was false and the write-off recorded no forex leg at all. The lira
balance went to zero and the currency balance was left stranded.

India Gate has one of those: an 88,00 ₺ write-off with a blank forex column,
against a customer the app still says owes $2.00.

The row is immutable, correctly — a ledger you can edit is not a ledger. So
the remedy is to void and re-post, which is why voiding a write-off had to
become possible. It was previously the only row on a customer ledger with no
way back: a write-off entered by mistake was permanent.
"""

from __future__ import annotations

import uuid
from datetime import date

from fastapi.testclient import TestClient

from app.core.chart_of_accounts.seed import seed_default_chart
from app.core.receivables import posting as receivables_posting
from app.core.receivables.ledger import persist_customer_ledger_entry
from app.core.receivables.types import CustomerMovementType
from app.db.session import entity_context
from app.features.customers.models import Customer
from app.features.group_sales.fx_receivable import native_balance_for_currency

ACTOR = uuid.UUID("00000000-0000-4000-8000-000000000001")


def _customer_owing_usd(db_session, entity_id, *, try_kurus: int, usd_minor: int):
    """A customer billed in USD, with nothing paid yet."""
    seed_default_chart(db_session, entity_id)
    with entity_context(db_session, entity_id):
        customer = Customer(entity_id=entity_id, name="Blue Tours")
        db_session.add(customer)
        db_session.flush()
        persist_customer_ledger_entry(
            db_session,
            customer.id,
            movement_date=date(2026, 5, 28),
            movement_type=CustomerMovementType.CREDIT_SALE,
            amount_kurus=try_kurus,
            description="Group sale",
            actor_id=ACTOR,
            forex_currency="USD",
            total_forex_minor=usd_minor,
        )
        db_session.commit()
        customer_id = customer.id
    return customer_id


def test_writing_off_the_whole_balance_clears_the_currency_too(
    db_session, restaurant_a
):
    customer_id = _customer_owing_usd(
        db_session, restaurant_a.id, try_kurus=8_800, usd_minor=200
    )
    receivables_posting.post_customer_write_off(
        db_session,
        restaurant_a.id,
        customer_id,
        write_off_date=date(2026, 7, 8),
        amount_kurus=8_800,
        description="Receivable write-off",
        actor_id=ACTOR,
    )
    with entity_context(db_session, restaurant_a.id):
        assert native_balance_for_currency(db_session, customer_id, "USD") == 0, (
            "the lira balance was written off but the currency was left owing"
        )


def test_a_partial_write_off_clears_the_matching_share(db_session, restaurant_a):
    """Half the lira, half the currency — at the carrying rate, not a new one."""
    customer_id = _customer_owing_usd(
        db_session, restaurant_a.id, try_kurus=8_800, usd_minor=200
    )
    receivables_posting.post_customer_write_off(
        db_session,
        restaurant_a.id,
        customer_id,
        write_off_date=date(2026, 7, 8),
        amount_kurus=4_400,
        description="Partial write-off",
        actor_id=ACTOR,
    )
    with entity_context(db_session, restaurant_a.id):
        assert native_balance_for_currency(db_session, customer_id, "USD") == 100


def test_the_write_off_row_carries_the_currency(db_session, restaurant_a):
    """Not just the arithmetic — the row itself has to name the currency, or
    the ledger shows a blank forex column as India Gate's does."""
    from sqlalchemy import select

    from app.core.receivables.models import CustomerLedgerEntry

    customer_id = _customer_owing_usd(
        db_session, restaurant_a.id, try_kurus=8_800, usd_minor=200
    )
    receivables_posting.post_customer_write_off(
        db_session,
        restaurant_a.id,
        customer_id,
        write_off_date=date(2026, 7, 8),
        amount_kurus=8_800,
        description="Receivable write-off",
        actor_id=ACTOR,
    )
    with entity_context(db_session, restaurant_a.id):
        row = db_session.scalar(
            select(CustomerLedgerEntry).where(
                CustomerLedgerEntry.customer_id == customer_id,
                CustomerLedgerEntry.movement_type == CustomerMovementType.DISCOUNT,
            )
        )
    assert row is not None
    assert row.forex_currency == "USD"
    # Stored negative, so it reduces the balance rather than adding to it.
    assert row.total_forex_minor == -200


def test_a_lira_only_write_off_records_no_currency(db_session, restaurant_a):
    """No forex history means no forex leg — and no crash."""
    from sqlalchemy import select

    from app.core.receivables.models import CustomerLedgerEntry

    seed_default_chart(db_session, restaurant_a.id)
    with entity_context(db_session, restaurant_a.id):
        customer = Customer(entity_id=restaurant_a.id, name="Lira only")
        db_session.add(customer)
        db_session.flush()
        persist_customer_ledger_entry(
            db_session,
            customer.id,
            movement_date=date(2026, 5, 28),
            movement_type=CustomerMovementType.CREDIT_SALE,
            amount_kurus=10_000,
            description="Credit sale",
            actor_id=ACTOR,
        )
        db_session.commit()
        customer_id = customer.id

    receivables_posting.post_customer_write_off(
        db_session,
        restaurant_a.id,
        customer_id,
        write_off_date=date(2026, 7, 8),
        amount_kurus=10_000,
        description="Receivable write-off",
        actor_id=ACTOR,
    )
    with entity_context(db_session, restaurant_a.id):
        row = db_session.scalar(
            select(CustomerLedgerEntry).where(
                CustomerLedgerEntry.customer_id == customer_id,
                CustomerLedgerEntry.movement_type == CustomerMovementType.DISCOUNT,
            )
        )
    assert row is not None
    assert row.forex_currency is None
    assert row.total_forex_minor is None


def test_a_write_off_can_be_voided(db_session, restaurant_a, client: TestClient):
    """The repair path for a write-off posted before the balance was fixed.

    Also a gap in its own right: this was the one row on a customer ledger
    that could not be undone.
    """
    customer_id = _customer_owing_usd(
        db_session, restaurant_a.id, try_kurus=8_800, usd_minor=200
    )
    entry = receivables_posting.post_customer_write_off(
        db_session,
        restaurant_a.id,
        customer_id,
        write_off_date=date(2026, 7, 8),
        amount_kurus=8_800,
        description="Receivable write-off",
        actor_id=ACTOR,
    )
    db_session.commit()

    resp = client.post(
        f"/entities/{restaurant_a.id}/customers/{customer_id}"
        f"/write-offs/{entry.id}/void",
        json={"actor_id": str(ACTOR), "reason": "Posted in error"},
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["reversal_journal_entry_id"]

    # Undone means owing again, in both currencies.
    with entity_context(db_session, restaurant_a.id):
        assert native_balance_for_currency(db_session, customer_id, "USD") == 200


def test_a_write_off_can_be_corrected_to_a_smaller_amount(
    db_session, restaurant_a, client: TestClient
):
    """Halving the lira releases half the currency.

    The share is worked out after the reversal is appended, so it is measured
    against the balance as it stood *before* the original write-off. Measuring
    against what remains afterwards would apportion against zero.
    """
    customer_id = _customer_owing_usd(
        db_session, restaurant_a.id, try_kurus=8_800, usd_minor=200
    )
    entry = receivables_posting.post_customer_write_off(
        db_session,
        restaurant_a.id,
        customer_id,
        write_off_date=date(2026, 7, 8),
        amount_kurus=8_800,
        description="Receivable write-off",
        actor_id=ACTOR,
    )
    db_session.commit()

    resp = client.post(
        f"/entities/{restaurant_a.id}/customers/{customer_id}"
        f"/write-offs/{entry.id}/correct",
        json={
            "write_off_date": "2026-07-08",
            "amount_kurus": 4_400,
            "description": "Receivable write-off",
            "actor_id": str(ACTOR),
        },
    )
    assert resp.status_code == 200, resp.text
    # Half the lira written off, so half the currency is still owed.
    assert resp.json()["balance_kurus"] == 4_400
    with entity_context(db_session, restaurant_a.id):
        assert native_balance_for_currency(db_session, customer_id, "USD") == 100


def test_correcting_a_write_off_beyond_the_balance_is_rejected(
    db_session, restaurant_a, client: TestClient
):
    """The cap survives the correction path, not just the posting one."""
    customer_id = _customer_owing_usd(
        db_session, restaurant_a.id, try_kurus=8_800, usd_minor=200
    )
    entry = receivables_posting.post_customer_write_off(
        db_session,
        restaurant_a.id,
        customer_id,
        write_off_date=date(2026, 7, 8),
        amount_kurus=4_400,
        description="Receivable write-off",
        actor_id=ACTOR,
    )
    db_session.commit()

    resp = client.post(
        f"/entities/{restaurant_a.id}/customers/{customer_id}"
        f"/write-offs/{entry.id}/correct",
        json={
            "write_off_date": "2026-07-08",
            "amount_kurus": 99_999,
            "description": "Too much",
            "actor_id": str(ACTOR),
        },
    )
    assert resp.status_code == 422, resp.text


def test_voiding_something_that_is_not_a_write_off_is_rejected(
    db_session, restaurant_a, client: TestClient
):
    """The endpoint guards the movement type; a payment has its own route."""
    customer_id = _customer_owing_usd(
        db_session, restaurant_a.id, try_kurus=8_800, usd_minor=200
    )
    db_session.commit()
    resp = client.post(
        f"/entities/{restaurant_a.id}/customers/{customer_id}"
        f"/write-offs/{uuid.uuid4()}/void",
        json={"actor_id": str(ACTOR), "reason": "Wrong route"},
    )
    assert resp.status_code == 404, resp.text
