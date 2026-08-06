"""An over-payment is reported by the API, never refused by it.

There are two ways to record a customer receipt. Send a native amount alone
and `compute_try_payment_from_native` runs, which rejects anything larger than
the balance. Send a lira amount alongside it and the service returns before
that function is reached, so the native quantity is stored exactly as handed
over with nothing comparing it to what is owed.

The form warns before submitting, but a form is not the API. Anything else
posting to this endpoint — a script, an import, a future mobile client — saw
no signal at all. The response now carries one.

It is a warning and not a rejection on purpose: the lira ledger is right
either way, and a customer paying a deposit against future work is doing
something ordinary. The tests that matter most here are the ones asserting
the payment still goes through.
"""

from __future__ import annotations

import uuid
from datetime import date

from fastapi.testclient import TestClient

from app.core.chart_of_accounts.seed import seed_default_chart
from app.core.receivables.ledger import persist_customer_ledger_entry
from app.core.receivables.types import CustomerMovementType
from app.db.session import entity_context
from app.features.banking import service as banking_service
from app.features.banking.models import MoneyAccountKind
from app.features.banking.schema import MoneyAccountCreate
from app.features.customers.models import Customer

ACTOR = uuid.UUID("00000000-0000-4000-8000-000000000001")


def _setup(db_session, entity_id, *, billed_minor: int = 31_200):
    """A customer owing `billed_minor` USD, and a USD wallet to receive into.

    Returns ids, not ORM instances. A commit expires every loaded attribute,
    so touching `customer.id` afterwards sends SQLAlchemy back to the database
    — and outside `entity_context` the row-level security policy hides the
    row, which surfaces as ObjectDeletedError rather than as anything to do
    with RLS. Reading the ids while the context is still open avoids the
    reload entirely.

    The wallet is created rather than looked up. An earlier draft searched the
    seeded chart for one and skipped the test when it found none — which would
    have made every assertion below pass without running.
    """
    seed_default_chart(db_session, entity_id)
    wallet = banking_service.create_money_account(
        db_session,
        entity_id,
        MoneyAccountCreate(
            account_kind=MoneyAccountKind.FOREIGN_CURRENCY,
            name="USD Wallet",
            currency="USD",
        ),
    )
    with entity_context(db_session, entity_id):
        customer = Customer(entity_id=entity_id, name="Blue Tours")
        db_session.add(customer)
        db_session.flush()
        persist_customer_ledger_entry(
            db_session,
            customer.id,
            movement_date=date(2026, 5, 28),
            movement_type=CustomerMovementType.CREDIT_SALE,
            amount_kurus=1_372_800,
            description="Group sale",
            actor_id=ACTOR,
            forex_currency="USD",
            total_forex_minor=billed_minor,
        )
        db_session.commit()
        db_session.refresh(customer)
        customer_id = customer.id
        wallet_gl_id = wallet.gl_account_id
    return customer_id, wallet_gl_id


def _post(client, entity_id, customer_id, wallet_gl_id, *, native: int, kurus: int):
    return client.post(
        f"/entities/{entity_id}/customers/{customer_id}/payments",
        json={
            "payment_date": "2026-05-29",
            "amount_kurus": kurus,
            "description": "Customer payment",
            "actor_id": str(ACTOR),
            "payment_account_id": str(wallet_gl_id),
            "payment_native_quantity": native,
        },
    )


def test_an_overpayment_is_still_recorded(db_session, restaurant_a, client: TestClient):
    """The point of the whole design: nothing is blocked."""
    customer_id, wallet_gl_id = _setup(db_session, restaurant_a.id)
    resp = _post(
        client, restaurant_a.id, customer_id, wallet_gl_id, native=92_200, kurus=1_372_800
    )
    assert resp.status_code == 201, resp.text
    assert resp.json()["journal_entry_id"]


def test_an_overpayment_comes_back_with_a_warning(
    db_session, restaurant_a, client: TestClient
):
    customer_id, wallet_gl_id = _setup(db_session, restaurant_a.id)
    resp = _post(
        client, restaurant_a.id, customer_id, wallet_gl_id, native=92_200, kurus=1_372_800
    )
    assert resp.status_code == 201, resp.text
    warnings = resp.json()["warnings"]
    assert warnings, "an over-payment produced no warning"
    assert "USD" in warnings[0]
    assert "paid ahead" in warnings[0].lower()


def test_a_payment_within_the_balance_says_nothing(
    db_session, restaurant_a, client: TestClient
):
    """Silence is the normal case; a warning on every receipt is no warning."""
    customer_id, wallet_gl_id = _setup(db_session, restaurant_a.id)
    resp = _post(
        client, restaurant_a.id, customer_id, wallet_gl_id, native=30_000, kurus=1_320_000
    )
    assert resp.status_code == 201, resp.text
    assert resp.json()["warnings"] == []


def test_settling_exactly_says_nothing(db_session, restaurant_a, client: TestClient):
    """The boundary: paying the balance to zero is not paying ahead."""
    customer_id, wallet_gl_id = _setup(db_session, restaurant_a.id)
    resp = _post(
        client, restaurant_a.id, customer_id, wallet_gl_id, native=31_200, kurus=1_372_800
    )
    assert resp.status_code == 201, resp.text
    assert resp.json()["warnings"] == []


def test_a_lira_wallet_is_not_asked_about_forex(
    db_session, restaurant_a, client: TestClient
):
    """No currency to compare, so no opinion — and no crash."""
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
            amount_kurus=100_000,
            description="Credit sale",
            actor_id=ACTOR,
        )
        db_session.commit()
        db_session.refresh(customer)
        # Read inside the context: creating the till below commits, which
        # expires this instance, and reloading it out here runs into RLS.
        customer_id = customer.id

    cash = banking_service.create_money_account(
        db_session,
        restaurant_a.id,
        MoneyAccountCreate(account_kind=MoneyAccountKind.CASH, name="Till"),
    )
    # Same reason as above: creating it committed, so this attribute is
    # expired and reading it goes back to the database, which needs the
    # context to see the row.
    with entity_context(db_session, restaurant_a.id):
        cash_gl_id = cash.gl_account_id

    resp = client.post(
        f"/entities/{restaurant_a.id}/customers/{customer_id}/payments",
        json={
            "payment_date": "2026-05-29",
            "amount_kurus": 50_000,
            "description": "Customer payment",
            "actor_id": str(ACTOR),
            "payment_account_id": str(cash_gl_id),
        },
    )
    assert resp.status_code == 201, resp.text
    assert resp.json()["warnings"] == []
