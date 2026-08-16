"""A correction that can only rebuild one leg must refuse, not rebuild one leg.

Two routes decided what to repost from a *row*, when the entry had more than
one. Neither failed. Both quietly turned a two-legged transaction into a
one-legged one, and the books went on balancing afterwards — which is why
neither was ever reported.

**Partners.** `build_partner_correction_lines` reads the row's movement type
and nothing else. Three kinds of row have a movement type that does not
describe their entry: a partner-paid supplier invoice writes `expense_fronted`
under `partner_supplier_paid`, and a personal expense or supplier-payment
split writes `drawing` under `expense_personal_split`. Correcting one rebuilt
it as a plain drawing or a plain fronted expense and dropped the other half.

**Staff.** `correct_staff_journal_entry` read one row with `session.scalar`
and reposted one row. A salary payment that consumed an advance writes two;
a period payment writes three. `scalar` does not promise which row it returns,
so the correction might keep the advance offset and drop the payment.

Both now refuse and say why. Voiding still works, and is the right answer:
it reverses the whole entry.
"""

from __future__ import annotations

import uuid
from datetime import date
from decimal import Decimal

import pytest
from sqlalchemy import select

from app.core.chart_of_accounts.models import Account
from app.core.chart_of_accounts.seed import seed_default_chart
from app.core.ledger.correction import CorrectionNotFoundError
from app.db.session import entity_context
from app.features.banking import service as banking_service
from app.features.banking.models import MoneyAccountKind
from app.features.banking.schema import MoneyAccountCreate
from app.features.partners.models import Partner

ACTOR_ID = uuid.UUID("00000000-0000-4000-8000-000000000001")


@pytest.fixture
def partner_books(db_session, restaurant_a):
    seed_default_chart(db_session, restaurant_a.id)
    drawer = banking_service.create_money_account(
        db_session,
        restaurant_a.id,
        MoneyAccountCreate(account_kind=MoneyAccountKind.CASH, name="Drawer"),
    )
    with entity_context(db_session, restaurant_a.id):
        partner = Partner(name="Ali", ownership_share_pct=Decimal("100"))
        db_session.add(partner)
        db_session.commit()
        db_session.refresh(partner)
        accounts = {a.code: a.id for a in db_session.scalars(select(Account))}
        return {
            "entity_id": restaurant_a.id,
            "partner_id": partner.id,
            "drawer": drawer,
            "accounts": accounts,
        }


def test_a_plain_drawing_can_still_be_corrected(partner_books, db_session):
    """The half that must keep working.

    Without this, a guard that refused everything would satisfy the test
    below and quietly remove correction from the whole partner page.
    """
    from app.core.partners import posting as partner_posting
    from app.features.partners import service as partner_service
    from app.features.partners.schema import PartnerJournalEntryCorrect

    ctx = partner_books
    result = partner_posting.post_drawing(
        db_session,
        ctx["entity_id"],
        ctx["partner_id"],
        drawing_date=date(2026, 7, 1),
        amount_kurus=50_000,
        description="Took cash",
        actor_id=ACTOR_ID,
        payment_account_id=ctx["drawer"].gl_account_id,
    )

    out = partner_service.correct_partner_journal_entry_http(
        db_session,
        ctx["entity_id"],
        ctx["partner_id"],
        result.journal_entry.id,
        PartnerJournalEntryCorrect(
            entry_date=date(2026, 7, 1),
            description="Took cash — corrected",
            amount_kurus=40_000,
            actor_id=ACTOR_ID,
            payment_account_id=ctx["drawer"].gl_account_id,
        ),
    )
    assert out is not None


def test_a_personal_split_drawing_refuses_correction(partner_books, db_session):
    """The row says `drawing`; the entry is a split with an expense leg.

    Correcting it used to rebuild a plain drawing and leave the expense side
    reversed and gone.
    """
    from app.core.chart_of_accounts.default_chart import (
        GENERAL_EXPENSE_CODE,
        OWNER_DRAWINGS_CODE,
    )
    from app.core.chart_of_accounts.types import AccountNormalBalance
    from app.core.ledger.models import JournalEntrySource
    from app.core.ledger.posting import PostingLine, prepare_journal_entry
    from app.core.partners import ledger as partner_ledger
    from app.core.partners.types import PartnerMovementType
    from app.features.partners import service as partner_service
    from app.features.partners.schema import PartnerJournalEntryCorrect

    ctx = partner_books

    # The shape, built directly: one entry under `expense_personal_split`
    # carrying a partner row that reads `drawing`. Assembling it through
    # `post_expense_personal_split` would need an expense to split first, and
    # what is being tested is the guard, not the posting.
    with entity_context(db_session, ctx["entity_id"]):
        entry = prepare_journal_entry(
            db_session,
            ctx["entity_id"],
            date(2026, 7, 2),
            "Shared shop run",
            [
                PostingLine(
                    account_id=ctx["accounts"][OWNER_DRAWINGS_CODE],
                    amount_kurus=20_000,
                    side=AccountNormalBalance.DEBIT,
                ),
                PostingLine(
                    account_id=ctx["accounts"][GENERAL_EXPENSE_CODE],
                    amount_kurus=20_000,
                    side=AccountNormalBalance.CREDIT,
                ),
            ],
            actor_id=ACTOR_ID,
            source=JournalEntrySource.EXPENSE_PERSONAL_SPLIT,
        )
        db_session.flush()
        partner_ledger.persist_partner_ledger_entry(
            db_session,
            ctx["partner_id"],
            movement_date=date(2026, 7, 2),
            movement_type=PartnerMovementType.DRAWING,
            amount_kurus=-20_000,
            description="Personal share",
            actor_id=ACTOR_ID,
            journal_entry_id=entry.id,
        )
        db_session.commit()
        entry_id = entry.id

    with pytest.raises(CorrectionNotFoundError) as caught:
        partner_service.correct_partner_journal_entry_http(
            db_session,
            ctx["entity_id"],
            ctx["partner_id"],
            entry_id,
            PartnerJournalEntryCorrect(
                entry_date=date(2026, 7, 2),
                description="changed my mind",
                amount_kurus=10_000,
                actor_id=ACTOR_ID,
                payment_account_id=ctx["drawer"].gl_account_id,
            ),
        )
    assert "another leg" in str(caught.value), (
        "the refusal should say why, not just that it will not"
    )


def test_the_guard_reads_the_capability_table(db_session):
    """Not a fourth hand-written list.

    "Can this source be edited" is already decided in one place. A separate
    list here would be a copy, and copies are what this whole phase is about.
    """
    import inspect

    from app.features.partners import correction_lines

    source = inspect.getsource(correction_lines.assert_source_is_correctable)
    assert "CAPABILITIES" in source
