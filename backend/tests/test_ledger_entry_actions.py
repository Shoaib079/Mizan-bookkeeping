"""What the ledger offers for an entry, asserted rather than compared.

This file began as a migration scaffold. It ran the capability table beside
the 46-branch resolver and asserted they agreed, field by field, so the
switchover in step 2 could be a change of caller rather than a change of
behaviour. That job is done — the resolver now *is* the table, and comparing
the two would be comparing a thing to itself.

So the comparisons are replaced with the answers themselves, written out.
That is worth more than the scaffold was: before this, four test files touched
`resolve_ledger_entry_actions` across 46 branches, and most sources had no
test at all. These are the first assertions that say what the ledger should
offer, rather than that two implementations happen to say the same thing.

The case that matters most is an entry whose owning record is **absent**. That
is not an edge case — it is what the General ledger sees for anything posted
outside the feature that owns it, and it is where a wrong answer puts an Edit
button on a row that has nothing to edit.
"""

from __future__ import annotations

import uuid
from datetime import date

import pytest
from sqlalchemy import select

from app.core.chart_of_accounts.default_chart import (
    ACCOUNTS_PAYABLE_CODE,
    GENERAL_EXPENSE_CODE,
)
from app.core.chart_of_accounts.models import Account
from app.core.chart_of_accounts.seed import seed_default_chart
from app.core.chart_of_accounts.types import AccountNormalBalance
from app.core.ledger.entry_actions import resolve_ledger_entry_actions
from app.core.ledger.models import JournalEntrySource
from app.core.ledger.posting import PostingLine, prepare_journal_entry
from app.db.session import entity_context

ACTOR_ID = uuid.UUID("00000000-0000-4000-8000-000000000001")


@pytest.fixture
def books(db_session, restaurant_a):
    seed_default_chart(db_session, restaurant_a.id)
    return restaurant_a.id


def _post(db_session, entity_id, source: JournalEntrySource):
    with entity_context(db_session, entity_id):
        accounts = {a.code: a.id for a in db_session.scalars(select(Account))}
        entry = prepare_journal_entry(
            db_session,
            entity_id,
            date(2026, 7, 15),
            "Actions fixture",
            [
                PostingLine(
                    account_id=accounts[GENERAL_EXPENSE_CODE],
                    amount_kurus=10_000,
                    side=AccountNormalBalance.DEBIT,
                ),
                PostingLine(
                    account_id=accounts[ACCOUNTS_PAYABLE_CODE],
                    amount_kurus=10_000,
                    side=AccountNormalBalance.CREDIT,
                ),
            ],
            actor_id=ACTOR_ID,
            source=source,
        )
        db_session.commit()
        return entry.id


# --- entries that stand on their own -------------------------------------


def test_a_manual_entry_can_be_edited_and_voided_in_place(db_session, books):
    """The generic case: no feature owns it, so the ledger corrects it."""
    entry_id = _post(db_session, books, JournalEntrySource.MANUAL)
    actions = resolve_ledger_entry_actions(db_session, books, entry_id)

    assert actions.can_edit is True
    assert actions.can_void is True
    assert actions.void_path == f"ledger/entries/{entry_id}/void"
    assert actions.edit is not None
    assert actions.edit.kind == "generic_ledger"


def test_a_transfer_can_be_voided_but_not_edited(db_session, books):
    """Both halves of a transfer move together; editing one side in the ledger
    would leave the other standing."""
    entry_id = _post(db_session, books, JournalEntrySource.TRANSFER)
    actions = resolve_ledger_entry_actions(db_session, books, entry_id)

    assert actions.can_edit is False
    assert actions.can_void is True
    assert actions.void_path == f"ledger/entries/{entry_id}/void"
    assert actions.edit is None


@pytest.mark.parametrize(
    "source", [JournalEntrySource.RULE_AUTO, JournalEntrySource.SYSTEM]
)
def test_machine_written_entries_can_be_voided_from_the_ledger(
    db_session, books, source
):
    """A rule posted it without anyone looking, so the ledger is where it gets
    taken back out."""
    entry_id = _post(db_session, books, source)
    actions = resolve_ledger_entry_actions(db_session, books, entry_id)

    assert actions.can_edit is False
    assert actions.can_void is True
    assert actions.void_path == f"ledger/entries/{entry_id}/void"


@pytest.mark.parametrize(
    "source",
    [
        JournalEntrySource.OPENING_BALANCE,
        JournalEntrySource.CASH_MOVEMENT,
        JournalEntrySource.POS_CARD_TIP,
        JournalEntrySource.CREDIT_CARD_PAYMENT,
    ],
)
def test_entries_owned_by_another_record_offer_nothing_here(
    db_session, books, source
):
    """Deliberately no buttons, not an oversight.

    Each of these is corrected through the record that owns it — a cash
    movement or card tip through its POS daily summary, a card payment through
    the card, an opening balance through onboarding. Voiding half of one from
    the General ledger would leave the other half standing.
    """
    entry_id = _post(db_session, books, source)
    actions = resolve_ledger_entry_actions(db_session, books, entry_id)

    assert actions.can_edit is False
    assert actions.can_void is False
    assert actions.void_path is None


# --- entries whose owning record is missing ------------------------------


@pytest.mark.parametrize(
    "source",
    [
        JournalEntrySource.EXPENSE_ENTRY,
        JournalEntrySource.PAYMENT,
        JournalEntrySource.INVOICE,
        JournalEntrySource.PARTNER_DRAWING,
        JournalEntrySource.STAFF_PAYMENT,
        JournalEntrySource.CUSTOMER_PAYMENT_RECEIVED,
        JournalEntrySource.DELIVERY_COMMISSION,
    ],
)
def test_no_buttons_when_the_owning_record_is_not_there(db_session, books, source):
    """A source claims a subledger row; without one there is nothing to act on.

    Every one of the 46 branches used to carry its own copy of this check, and
    a branch that forgot it would have built a void path from `None` — a URL
    that looks right and matches no route. One table row cannot forget.
    """
    entry_id = _post(db_session, books, source)
    actions = resolve_ledger_entry_actions(db_session, books, entry_id)

    assert actions.can_edit is False
    assert actions.can_void is False
    assert actions.void_path is None
    assert actions.edit is None


# --- the gates that belong to the entry, not to its source ---------------


def test_a_voided_entry_offers_nothing_whatever_it_was(db_session, books):
    """The second press of Void did nothing, which was right and should never
    have been offered."""
    from app.core.ledger.posting import void_journal_entry

    entry_id = _post(db_session, books, JournalEntrySource.MANUAL)
    before = resolve_ledger_entry_actions(db_session, books, entry_id)
    assert before.can_void is True

    void_journal_entry(db_session, books, entry_id, actor_id=ACTOR_ID, reason="test")

    after = resolve_ledger_entry_actions(db_session, books, entry_id)
    assert after.can_edit is False
    assert after.can_void is False
    assert after.void_path is None


def test_an_unknown_entry_is_an_error_not_an_empty_answer(db_session, books):
    """"No actions" and "no such entry" are different, and a caller that
    cannot tell them apart shows an empty row instead of failing."""
    from app.core.ledger.posting import EntryNotFoundError

    with pytest.raises(EntryNotFoundError):
        resolve_ledger_entry_actions(db_session, books, uuid.uuid4())


def test_an_unknown_restaurant_is_an_error(db_session, books):
    with pytest.raises(LookupError):
        resolve_ledger_entry_actions(db_session, uuid.uuid4(), uuid.uuid4())
