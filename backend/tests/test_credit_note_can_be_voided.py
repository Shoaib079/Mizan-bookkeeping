"""A wrong credit note can be taken back out of the books.

An iade posts under source `INVOICE` with a `CREDIT_NOTE` movement type.
`void_supplier_invoice` refuses it by movement type — correctly, since a
credit note moves the payable the opposite way — and until now nothing else
accepted it. So the ledger honestly offered no buttons, and a wrong credit
note stayed in the books permanently.

The machinery needed nothing new. `void_gl_with_subledger_rows` reverses the
GL and appends the supplier reversal whatever the movement type is, and
`_release_posted_draft` hands the draft back so the same document can be
uploaded again. What was missing was a second caller.

Its own route rather than a flag on the invoice one: an invoice and a credit
note move the payable in opposite directions, so a caller that thinks it is
voiding one when it is voiding the other has the supplier balance wrong by
twice the amount. Two routes cannot be confused.
"""

from __future__ import annotations

import uuid
from datetime import date

import pytest
from sqlalchemy import select

from app.core.chart_of_accounts.default_chart import ACCOUNTS_PAYABLE_CODE
from app.core.chart_of_accounts.models import Account
from app.core.chart_of_accounts.seed import seed_default_chart
from app.core.ledger.balances import balance_as_of_kurus
from app.core.ledger.correction import (
    CorrectionNotFoundError,
    void_supplier_credit_note,
    void_supplier_invoice,
)
from app.core.ledger.entry_actions import resolve_ledger_entry_actions
from app.core.payables import ledger as payables_ledger
from app.db.session import entity_context
from app.features.suppliers.models import Supplier

ACTOR_ID = uuid.UUID("00000000-0000-4000-8000-000000000001")


@pytest.fixture
def supplier(db_session, restaurant_a):
    seed_default_chart(db_session, restaurant_a.id)
    with entity_context(db_session, restaurant_a.id):
        row = Supplier(name="Metro Toptancı", vkn="1234567890")
        db_session.add(row)
        db_session.commit()
        db_session.refresh(row)
        accounts = {a.code: a.id for a in db_session.scalars(select(Account))}
        return {
            "entity_id": restaurant_a.id,
            "supplier_id": row.id,
            "ap_account_id": accounts[ACCOUNTS_PAYABLE_CODE],
        }


def _payables_balance(db_session, ctx) -> int:
    with entity_context(db_session, ctx["entity_id"]):
        account = db_session.get(Account, ctx["ap_account_id"])
        return balance_as_of_kurus(db_session, account, date(2030, 1, 1))


def _post_credit_note(db_session, ctx, amount_kurus: int = 30_000):
    """A credit note through the same path the app uses."""
    from app.core.chart_of_accounts.default_chart import GENERAL_EXPENSE_CODE
    from app.core.chart_of_accounts.types import AccountNormalBalance
    from app.core.ledger.models import JournalEntrySource
    from app.core.ledger.posting import PostingLine, prepare_journal_entry

    with entity_context(db_session, ctx["entity_id"]):
        accounts = {a.code: a.id for a in db_session.scalars(select(Account))}
        entry = prepare_journal_entry(
            db_session,
            ctx["entity_id"],
            date(2026, 7, 10),
            "Iade — returned goods",
            [
                PostingLine(
                    account_id=ctx["ap_account_id"],
                    amount_kurus=amount_kurus,
                    side=AccountNormalBalance.DEBIT,
                ),
                PostingLine(
                    account_id=accounts[GENERAL_EXPENSE_CODE],
                    amount_kurus=amount_kurus,
                    side=AccountNormalBalance.CREDIT,
                ),
            ],
            actor_id=ACTOR_ID,
            source=JournalEntrySource.INVOICE,
        )
        db_session.flush()
        payables_ledger.persist_supplier_credit_note_entry(
            db_session,
            ctx["supplier_id"],
            movement_date=date(2026, 7, 10),
            # Negative in the subledger: a credit note reduces what is owed,
            # and `persist_supplier_credit_note_entry` refuses a positive one.
            # The GL lines above are the same amount as a debit to payables —
            # the sign convention differs between the two, which is exactly
            # the sort of thing worth having a posting function enforce.
            amount_kurus=-amount_kurus,
            description="Iade — returned goods",
            actor_id=ACTOR_ID,
            journal_entry_id=entry.id,
            reference_type="manual",
            reference_id=None,
        )
        db_session.commit()
        return entry.id


def test_the_ledger_now_offers_a_void_on_a_credit_note(db_session, supplier):
    """Before this, an iade had no buttons and no way out of the app."""
    entry_id = _post_credit_note(db_session, supplier)

    actions = resolve_ledger_entry_actions(
        db_session, supplier["entity_id"], entry_id
    )

    assert actions.can_void is True
    assert actions.void_path == (
        f"suppliers/{supplier['supplier_id']}/credit-notes/{entry_id}/void"
    )
    # No correction route exists yet, so Edit stays off rather than opening
    # the supplier-invoice form for something that is not one.
    assert actions.can_edit is False
    assert actions.edit is None


def test_voiding_it_puts_the_payable_back(db_session, supplier):
    """The money, not just the flags.

    A credit note reduces what is owed. Voiding it has to put that back, or
    the supplier balance is wrong in the direction that looks like a discount.
    """
    before = _payables_balance(db_session, supplier)
    entry_id = _post_credit_note(db_session, supplier, amount_kurus=30_000)
    after_note = _payables_balance(db_session, supplier)
    assert after_note == before - 30_000

    void_supplier_credit_note(
        db_session, supplier["entity_id"], entry_id, actor_id=ACTOR_ID
    )

    assert _payables_balance(db_session, supplier) == before


def test_the_invoice_route_still_refuses_a_credit_note(db_session, supplier):
    """The guard that was right all along.

    It refused because a caller asking to void an invoice must not be handed a
    credit note. That was never the bug — the bug was that no other caller
    existed.
    """
    entry_id = _post_credit_note(db_session, supplier)

    with pytest.raises(CorrectionNotFoundError):
        void_supplier_invoice(
            db_session, supplier["entity_id"], entry_id, actor_id=ACTOR_ID
        )


def test_the_credit_note_route_refuses_an_invoice(db_session, supplier):
    """And the mirror, so the two cannot be used interchangeably.

    Without this, a credit-note route that accepted anything would pass every
    test above while making the supplier balance wrong by twice the amount
    whenever it was handed the wrong document.
    """
    from app.core.chart_of_accounts.types import AccountNormalBalance
    from app.core.chart_of_accounts.default_chart import GENERAL_EXPENSE_CODE
    from app.core.ledger.models import JournalEntrySource
    from app.core.ledger.posting import PostingLine, prepare_journal_entry

    with entity_context(db_session, supplier["entity_id"]):
        accounts = {a.code: a.id for a in db_session.scalars(select(Account))}
        entry = prepare_journal_entry(
            db_session,
            supplier["entity_id"],
            date(2026, 7, 11),
            "Ordinary invoice",
            [
                PostingLine(
                    account_id=accounts[GENERAL_EXPENSE_CODE],
                    amount_kurus=20_000,
                    side=AccountNormalBalance.DEBIT,
                ),
                PostingLine(
                    account_id=supplier["ap_account_id"],
                    amount_kurus=20_000,
                    side=AccountNormalBalance.CREDIT,
                ),
            ],
            actor_id=ACTOR_ID,
            source=JournalEntrySource.INVOICE,
        )
        db_session.flush()
        payables_ledger.persist_supplier_invoice_entry(
            db_session,
            supplier["supplier_id"],
            movement_date=date(2026, 7, 11),
            amount_kurus=20_000,
            description="Ordinary invoice",
            actor_id=ACTOR_ID,
            journal_entry_id=entry.id,
            reference_type="manual",
            reference_id=None,
        )
        db_session.commit()
        invoice_entry_id = entry.id

    with pytest.raises(CorrectionNotFoundError):
        void_supplier_credit_note(
            db_session, supplier["entity_id"], invoice_entry_id, actor_id=ACTOR_ID
        )

    # And the ordinary invoice still gets the invoice answer.
    actions = resolve_ledger_entry_actions(
        db_session, supplier["entity_id"], invoice_entry_id
    )
    assert actions.can_edit is True
    assert actions.edit is not None
    assert actions.edit.kind == "supplier_invoice"
    assert "/invoices/" in (actions.void_path or "")
