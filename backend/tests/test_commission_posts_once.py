"""A delivery commission invoice reaches the ledger once, not twice.

The structural guard in `test_no_invoice_posts_twice.py` proves the gate is
*called*. It cannot prove the gate refuses anything — a call to a function
that always returns None would satisfy it completely. That is the shape of
vacuous guard this project keeps producing, so the behaviour is pinned here
separately.

Delivery commissions are the case that had no duplicate rule at all. The file
fingerprint caught a byte-identical re-upload and nothing else, so the same
commission invoice downloaded twice from a platform portal — same number, same
amount, different bytes — booked the expense twice.
"""

from __future__ import annotations

import uuid
from datetime import date

import pytest
from sqlalchemy import select

from app.core.chart_of_accounts.default_chart import DELIVERY_COMMISSION_EXPENSE_CODE
from app.core.chart_of_accounts.models import Account
from app.core.delivery.commission_posting import post_delivery_commission_draft
from app.core.invoices.posting import DraftPostError
from app.core.ledger.balances import balance_as_of_kurus
from app.core.ledger.correction import void_delivery_commission_invoice
from app.db.session import entity_context
from app.features.invoices.models import (
    InvoiceDraft,
    InvoiceDraftStatus,
    InvoiceKind,
    InvoiceSourceType,
)
from tests.delivery_helpers import ACTOR_ID, delivery_setup as build_delivery_setup

NET = 62_500
GROSS = 75_000


@pytest.fixture
def platforms(db_session, restaurant_a):
    """Two platforms, because the rule is per counterparty, not global."""
    setup = build_delivery_setup(
        db_session, restaurant_a.id, platform_names=("Getir", "Yemeksepeti")
    )
    with entity_context(db_session, setup["entity_id"]):
        accounts = {a.code: a.id for a in db_session.scalars(select(Account))}
    return {
        "entity_id": setup["entity_id"],
        "getir": setup["platforms"]["Getir"],
        "yemeksepeti": setup["platforms"]["Yemeksepeti"],
        "expense_id": accounts[DELIVERY_COMMISSION_EXPENSE_CODE],
    }


def _draft(db_session, entity_id, platform, *, number: str) -> uuid.UUID:
    """A confirmed commission draft. Each gets its own fingerprint on purpose.

    That is the whole point: the file check already stops a byte-identical
    re-upload. What went unguarded was the *same invoice* arriving as a
    different file, which is what a second download from a platform portal is.
    """
    with entity_context(db_session, entity_id):
        draft = InvoiceDraft(
            status=InvoiceDraftStatus.CONFIRMED,
            invoice_kind=InvoiceKind.DELIVERY_COMMISSION.value,
            source_type=InvoiceSourceType.EFATURA_XML,
            file_fingerprint=f"commission-{uuid.uuid4().hex}",
            supplier_name=platform.name,
            delivery_platform_id=platform.id,
            invoice_number=number,
            invoice_date=date(2026, 4, 5),
            net_kurus=NET,
            gross_kurus=GROSS,
            vat_breakdown=[
                {"rate_percent": 20, "base_kurus": NET, "vat_kurus": GROSS - NET}
            ],
            currency="TRY",
            extraction_payload={},
            confirmed_by=ACTOR_ID,
        )
        db_session.add(draft)
        db_session.commit()
        return draft.id


def _post(db_session, ctx, draft_id):
    return post_delivery_commission_draft(
        db_session,
        ctx["entity_id"],
        draft_id,
        expense_account_id=ctx["expense_id"],
        actor_id=ACTOR_ID,
    )


def _commission_expense(db_session, ctx) -> int:
    with entity_context(db_session, ctx["entity_id"]):
        account = db_session.get(Account, ctx["expense_id"])
        return balance_as_of_kurus(db_session, account, date(2030, 1, 1))


def test_the_same_commission_invoice_will_not_post_twice(db_session, platforms):
    """Different file, same invoice — refused, and the money says so."""
    first = _draft(db_session, platforms["entity_id"], platforms["getir"], number="GTR-77")
    _post(db_session, platforms, first)
    after_one = _commission_expense(db_session, platforms)
    assert after_one == NET

    second = _draft(
        db_session, platforms["entity_id"], platforms["getir"], number="GTR-77"
    )
    with pytest.raises(DraftPostError) as caught:
        _post(db_session, platforms, second)
    assert "GTR-77" in str(caught.value)

    assert _commission_expense(db_session, platforms) == after_one, (
        "the second post was refused but the expense moved — the gate raised "
        "after writing, which is worse than not raising at all"
    )


def test_the_same_number_from_a_different_platform_is_not_a_duplicate(
    db_session, platforms
):
    """Platforms number their own invoices. Sharing a number is a coincidence.

    Without this the check above passes for a rule that refuses on the number
    alone, which would block real invoices.
    """
    first = _draft(db_session, platforms["entity_id"], platforms["getir"], number="INV-1")
    _post(db_session, platforms, first)

    other = _draft(
        db_session, platforms["entity_id"], platforms["yemeksepeti"], number="INV-1"
    )
    _post(db_session, platforms, other)

    assert _commission_expense(db_session, platforms) == NET * 2


def test_a_voided_commission_stops_being_a_duplicate(db_session, platforms):
    """Void it because it was wrong, then post the right one.

    "Live" is doing the work in `find_live_posted_invoice`: an invoice that
    has been taken out of the books is not something a new one duplicates.
    Get this wrong and voiding an invoice makes its number unusable forever —
    which is the same trap, in a different place, as a voided file that could
    never be uploaded again.
    """
    first = _draft(db_session, platforms["entity_id"], platforms["getir"], number="GTR-9")
    result = _post(db_session, platforms, first)

    void_delivery_commission_invoice(
        db_session,
        platforms["entity_id"],
        result.journal_entry.id,
        actor_id=ACTOR_ID,
    )
    assert _commission_expense(db_session, platforms) == 0

    replacement = _draft(
        db_session, platforms["entity_id"], platforms["getir"], number="GTR-9"
    )
    _post(db_session, platforms, replacement)

    assert _commission_expense(db_session, platforms) == NET, (
        "the replacement should be the only commission in the books"
    )
