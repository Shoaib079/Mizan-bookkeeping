"""The SQL and Python definitions of "effective" must agree.

`is_effective_subledger_row` decides what a screen shows. An aggregate cannot
use it — it works on loaded rows — so the forex receivable balance had a
hand-written approximation instead, and the approximation was wrong in one
direction: it dropped reversed *sales* through an `amount_kurus > 0` guard,
but summed voided *payments* in full.

The effect on India Gate's books: a customer whose payment had been corrected
had that payment counted twice, so a settled ledger read "$298.00 paid ahead".
Nobody had overpaid. The screen and the total disagreed because they were
answering the question differently.

`effective_subledger_sql_filter` is now the SQL twin of the Python classifier,
and these tests hold them together over every shape a row can take.
"""

from __future__ import annotations

import uuid
from datetime import date

from sqlalchemy import select

from app.core.ledger.models import JournalEntry, JournalEntrySource, JournalEntryStatus
from app.core.ledger.subledger_display import (
    classify_subledger_row,
    effective_subledger_sql_filter,
    is_effective_subledger_row,
)
from app.core.receivables.ledger import persist_customer_ledger_entry
from app.core.receivables.models import CustomerLedgerEntry
from app.core.receivables.types import CustomerMovementType
from app.db.session import entity_context
from app.features.customers.models import Customer
from app.features.group_sales.fx_receivable import (
    native_balance_for_currency,
    outstanding_by_currency,
    outstanding_by_currency_for_customers,
)

ACTOR = uuid.UUID("00000000-0000-4000-8000-000000000001")

#: Every combination that reaches the classifier, as (label, description,
#: journal status, is a reversal).
ROW_SHAPES = [
    ("plain posted row", "Customer payment", JournalEntryStatus.POSTED, False),
    ("voided original", "Customer payment", JournalEntryStatus.VOIDED, False),
    ("void reversal by flag", "Customer payment", JournalEntryStatus.POSTED, True),
    ("void reversal by prefix", "Void: Customer payment", JournalEntryStatus.POSTED, False),
    ("voided reversal", "Void: Customer payment", JournalEntryStatus.VOIDED, True),
]


def _journal(db_session, entity_id, *, status, reverses: bool) -> JournalEntry:
    """A journal entry, optionally marked as reversing another.

    `reverses_entry_id` is a real foreign key, so it cannot be filled with an
    arbitrary UUID — the row it points at has to exist. The first version of
    this helper used `uuid.uuid4()` and every insert failed on the constraint.
    """
    reverses_entry_id = None
    if reverses:
        original = JournalEntry(
            id=uuid.uuid4(),
            entity_id=entity_id,
            entry_date=date(2026, 5, 1),
            description="Original",
            status=JournalEntryStatus.VOIDED,
            source=JournalEntrySource.MANUAL,
        )
        db_session.add(original)
        db_session.flush()
        reverses_entry_id = original.id

    journal = JournalEntry(
        id=uuid.uuid4(),
        entity_id=entity_id,
        entry_date=date(2026, 5, 1),
        description="Test",
        status=status,
        source=JournalEntrySource.MANUAL,
        reverses_entry_id=reverses_entry_id,
    )
    db_session.add(journal)
    db_session.flush()
    return journal


def test_the_sql_filter_selects_exactly_what_the_classifier_calls_effective(
    db_session, restaurant_a
) -> None:
    with entity_context(db_session, restaurant_a.id):
        customer = Customer(entity_id=restaurant_a.id, name="Shapes")
        db_session.add(customer)
        db_session.flush()

        expected_effective: set[uuid.UUID] = set()
        for label, description, status, reverses in ROW_SHAPES:
            journal = _journal(
                db_session, restaurant_a.id, status=status, reverses=reverses
            )
            entry = persist_customer_ledger_entry(
                db_session,
                customer.id,
                movement_date=date(2026, 5, 1),
                movement_type=CustomerMovementType.PAYMENT_RECEIVED,
                amount_kurus=-10_000,
                description=description,
                actor_id=ACTOR,
                journal_entry_id=journal.id,
                forex_currency="USD",
                payment_native_quantity=100,
            )
            kind, _ = classify_subledger_row(
                description=description, journal=journal
            )
            if is_effective_subledger_row(kind):
                expected_effective.add(entry.id)

        selected = set(
            db_session.scalars(
                select(CustomerLedgerEntry.id)
                .outerjoin(
                    JournalEntry,
                    JournalEntry.id == CustomerLedgerEntry.journal_entry_id,
                )
                .where(
                    CustomerLedgerEntry.customer_id == customer.id,
                    effective_subledger_sql_filter(CustomerLedgerEntry.description),
                )
            ).all()
        )

        assert selected == expected_effective, (
            "the SQL filter and the Python classifier disagree about which "
            "rows still stand"
        )


def test_a_row_with_no_journal_is_effective(db_session, restaurant_a) -> None:
    """Nothing could have voided it, so it counts."""
    with entity_context(db_session, restaurant_a.id):
        customer = Customer(entity_id=restaurant_a.id, name="No journal")
        db_session.add(customer)
        db_session.flush()
        entry = persist_customer_ledger_entry(
            db_session,
            customer.id,
            movement_date=date(2026, 5, 1),
            movement_type=CustomerMovementType.CREDIT_SALE,
            amount_kurus=10_000,
            description="Opening",
            actor_id=ACTOR,
            forex_currency="USD",
            total_forex_minor=100,
        )
        selected = db_session.scalars(
            select(CustomerLedgerEntry.id)
            .outerjoin(
                JournalEntry,
                JournalEntry.id == CustomerLedgerEntry.journal_entry_id,
            )
            .where(
                CustomerLedgerEntry.customer_id == customer.id,
                effective_subledger_sql_filter(CustomerLedgerEntry.description),
            )
        ).all()
        assert list(selected) == [entry.id]


def test_a_voided_payment_stops_reading_as_paid_ahead(db_session, restaurant_a) -> None:
    """The India Gate shape, reduced to its bones.

    $312 billed, $300 paid, then that payment corrected — the void plus its
    replacement. Before the fix all three payment rows were summed, so $312 of
    sales met $600 of payments and the customer looked $288 ahead. The books
    were square the whole time.
    """
    with entity_context(db_session, restaurant_a.id):
        customer = Customer(entity_id=restaurant_a.id, name="Corrected payment")
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
            total_forex_minor=31_200,
        )

        # The original payment, later voided.
        voided = _journal(
            db_session, restaurant_a.id, status=JournalEntryStatus.VOIDED, reverses=False
        )
        persist_customer_ledger_entry(
            db_session,
            customer.id,
            movement_date=date(2026, 5, 28),
            movement_type=CustomerMovementType.PAYMENT_RECEIVED,
            amount_kurus=-1_320_000,
            description="Customer payment",
            actor_id=ACTOR,
            journal_entry_id=voided.id,
            forex_currency="USD",
            payment_native_quantity=30_000,
        )
        # The reversal that cancelled it.
        reversal = _journal(
            db_session, restaurant_a.id, status=JournalEntryStatus.POSTED, reverses=True
        )
        persist_customer_ledger_entry(
            db_session,
            customer.id,
            movement_date=date(2026, 5, 28),
            movement_type=CustomerMovementType.PAYMENT_RECEIVED,
            amount_kurus=1_320_000,
            description="Void: Customer payment",
            actor_id=ACTOR,
            journal_entry_id=reversal.id,
            forex_currency="USD",
            payment_native_quantity=30_000,
        )
        # The replacement that stands.
        persist_customer_ledger_entry(
            db_session,
            customer.id,
            movement_date=date(2026, 5, 29),
            movement_type=CustomerMovementType.PAYMENT_RECEIVED,
            amount_kurus=-1_320_000,
            description="Customer payment",
            actor_id=ACTOR,
            forex_currency="USD",
            payment_native_quantity=30_000,
        )

        # $312 billed less the one payment that stands, $300 → $12 still owed.
        assert native_balance_for_currency(db_session, customer.id, "USD") == 1_200
        assert outstanding_by_currency(db_session, customer.id) == [("USD", 1_200)]

        bulk = outstanding_by_currency_for_customers(db_session, [customer.id])
        assert bulk[customer.id] == [("USD", 1_200)], (
            "the directory disagrees with the detail page about a voided payment"
        )
