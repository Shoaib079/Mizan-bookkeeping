"""One journal entry, several subledger rows — and the two questions that asks.

They are different questions, and conflating them was the mistake in the first
sketch of this work.

**How many rows?** decides whether a *correction* is safe.
`correct_staff_journal_entry` reads one row with `session.scalar` and reposts
one row. A salary payment that consumed an advance writes two — the payment
and the advance offset — and a period payment writes three. Correcting one of
those keeps whichever row `scalar` happened to return and silently drops the
rest, leaving the employee's advance balance wrong with nothing to show for
it. The staff page has always refused this; the General ledger offered it.

**How many owners?** decides whether a *void* may be offered on a row.
A profit allocation writes one row per partner against a single entry, so
voiding from Ali's row reverses Burak's and Cem's share too. A salary
payment's two rows both belong to the same employee, so voiding it from that
employee's page harms nobody else — which is why counting rows would have
hidden a button that works perfectly.
"""

from __future__ import annotations

import uuid
from datetime import date
from decimal import Decimal

import pytest
from sqlalchemy import select

from app.core.chart_of_accounts.models import Account
from app.core.chart_of_accounts.seed import seed_default_chart
from app.core.ledger.entry_actions import resolve_ledger_entry_actions
from app.core.partners import profit_allocation as pa
from app.db.session import entity_context
from app.features.banking import service as banking_service
from app.features.banking.models import MoneyAccountKind
from app.features.banking.schema import MoneyAccountCreate
from app.features.partners.models import Partner

ACTOR_ID = uuid.UUID("00000000-0000-4000-8000-000000000001")


@pytest.fixture
def three_partners(db_session, restaurant_a):
    seed_default_chart(db_session, restaurant_a.id)
    banking_service.create_money_account(
        db_session,
        restaurant_a.id,
        MoneyAccountCreate(account_kind=MoneyAccountKind.CASH, name="Drawer"),
    )
    with entity_context(db_session, restaurant_a.id):
        for name, pct in [("Ali", "50"), ("Burak", "30"), ("Cem", "20")]:
            db_session.add(Partner(name=name, ownership_share_pct=Decimal(pct)))
        db_session.commit()
    return restaurant_a.id


def test_a_profit_allocation_reports_every_partner_it_covers(
    db_session, three_partners
):
    """The number a partner page needs to know before drawing a Void button."""
    entity_id = three_partners

    result = pa.post_profit_allocation(
        db_session,
        entity_id,
        allocation_date=date(2026, 6, 30),
        profit_kurus=1_000_000,
        description="H1 profit",
        actor_id=ACTOR_ID,
        netting_as_of=date(2026, 6, 30),
    )
    entry_id = result.journal_entry.id

    actions = resolve_ledger_entry_actions(db_session, entity_id, entry_id)

    assert actions.owner_count == 3, (
        "one allocation covers three partners; a page showing one partner's "
        "row must be able to tell, or it will offer to void all three"
    )
    # The General ledger shows the entry itself, so it may still act on it.
    assert actions.can_void is True


def test_an_ordinary_entry_reports_one_owner(db_session, three_partners):
    """The other half.

    If `owner_count` were always the partner count, or always zero, the
    assertion above would pass while every page in the app hid its buttons.
    """
    from app.core.ledger.models import JournalEntrySource
    from app.core.ledger.posting import PostingLine, prepare_journal_entry
    from app.core.chart_of_accounts.default_chart import (
        ACCOUNTS_PAYABLE_CODE,
        GENERAL_EXPENSE_CODE,
    )
    from app.core.chart_of_accounts.types import AccountNormalBalance

    entity_id = three_partners
    with entity_context(db_session, entity_id):
        accounts = {a.code: a.id for a in db_session.scalars(select(Account))}
        entry = prepare_journal_entry(
            db_session,
            entity_id,
            date(2026, 7, 1),
            "Plain entry",
            [
                PostingLine(
                    account_id=accounts[GENERAL_EXPENSE_CODE],
                    amount_kurus=1_000,
                    side=AccountNormalBalance.DEBIT,
                ),
                PostingLine(
                    account_id=accounts[ACCOUNTS_PAYABLE_CODE],
                    amount_kurus=1_000,
                    side=AccountNormalBalance.CREDIT,
                ),
            ],
            actor_id=ACTOR_ID,
            source=JournalEntrySource.MANUAL,
        )
        db_session.commit()
        entry_id = entry.id

    actions = resolve_ledger_entry_actions(db_session, entity_id, entry_id)
    assert actions.owner_count == 1
    assert actions.can_edit is True


def test_only_the_allocation_counts_owners_separately():
    """`counts_owners` exists for the one source that spans several people.

    If it spread, it would mean the table had the wrong shape — every other
    source counts owners from the row it already looks up.
    """
    from app.core.ledger.entry_capabilities import CAPABILITIES

    separate = {
        source.value
        for source, cap in CAPABILITIES.items()
        if cap.counts_owners is not None
    }
    assert separate == {"partner_profit_allocation"}, (
        f"currently {sorted(separate)} — if another source needs this, check "
        "whether it should simply declare an `owner` instead"
    )


def test_the_capability_that_needs_a_sole_row_is_declared_where_it_is_true():
    """The two staff sources whose correction still rewrites a single row.

    A source that rewrites one subledger row on correction must say so. Left
    off, the General ledger offers an Edit that drops rows; put on a source
    whose correction handles many, it hides a working button.

    `staff_payment` was here and is not any more. It is the one shape that
    routinely owns several rows — a payment consuming an advance writes two,
    one parking a surplus writes three — so it was the reason the flag existed
    and the reason an owner could not fix a payment without voiding it.
    `core/staff/payment_correction.py` now reverses the entry whole and
    re-runs the poster, which rebuilds every leg from the same split maths
    that wrote them. The flag would now hide a button that works.

    Accrual and advance still go through `correct_staff_journal_entry`, which
    reads one row with `session.scalar` and reposts one row.
    """
    from app.core.ledger.entry_capabilities import CAPABILITIES
    from app.core.ledger.models import JournalEntrySource

    flagged = {
        source.value
        for source, cap in CAPABILITIES.items()
        if cap.edit_needs_a_sole_row
    }
    assert flagged == {"staff_accrual", "staff_advance"}, (
        "the flag marks sources whose correction rewrites a single row; "
        f"currently {sorted(flagged)}"
    )
    for source in (
        JournalEntrySource.STAFF_ACCRUAL,
        JournalEntrySource.STAFF_ADVANCE,
        JournalEntrySource.STAFF_PAYMENT,
    ):
        assert CAPABILITIES[source].can_void is True, (
            "voiding stays available — every row of a staff entry belongs to "
            "the same employee, so the reversal harms nobody else"
        )


def test_a_source_may_drop_the_flag_only_once_it_can_rebuild_every_leg():
    """Guard the guard.

    The assertion above is a list, and the cheapest way past a failing list is
    to delete the entry that failed — which is exactly how a real refusal
    becomes a silent row-dropping Edit. So the unflagged staff source has to
    show the multi-row route that earned it.
    """
    from app.features.staff import service as staff_service

    assert hasattr(staff_service, "_is_multi_row_staff_payment"), (
        "staff_payment is unflagged, so correcting one must be routed by row "
        "count — without this the General ledger Edit drops rows again"
    )
    from app.core.staff.payment_correction import correct_staff_payment

    assert callable(correct_staff_payment)
