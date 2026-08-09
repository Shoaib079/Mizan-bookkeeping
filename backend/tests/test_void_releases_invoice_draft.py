"""Voiding an invoice unposts its draft.

Reported: "i voided it but i can still see the invoice in review invoices and
i can open review and the invoice is there clicked void again nothing
happened just kinda flickered but still everything there."

Both halves are one stale field. `invoice_drafts.status` is what every screen
goes by, and voiding a supplier invoice left it reading `posted`:

  - Review → Invoices still listed it as booked, with Edit and Void.
  - Pressing Void again did nothing at all. The entry is already voided, so
    `resolve_ledger_entry_actions` returns no void path and the button gives
    up silently — the flicker was the request going out and coming back with
    nothing to do.
  - Re-uploading the same file was refused as already posted.

The delivery commission void had released its draft since it was written.
The supplier invoice void — the one anybody would actually reach for — never
did, so the fix lived beside the bug the whole time.
"""

from __future__ import annotations

import uuid
from datetime import date

import pytest
from sqlalchemy import select

from app.core.chart_of_accounts.default_chart import GENERAL_EXPENSE_CODE
from app.core.chart_of_accounts.models import Account
from app.core.chart_of_accounts.seed import seed_default_chart
from app.core.invoices.posting import post_confirmed_draft
from app.core.ledger.correction import void_supplier_invoice
from app.core.ledger.entry_actions import resolve_ledger_entry_actions
from app.db.session import entity_context
from app.features.invoices.models import (
    InvoiceDraft,
    InvoiceDraftStatus,
    InvoiceSourceType,
)
from app.features.suppliers.models import Supplier

ACTOR_ID = uuid.UUID("00000000-0000-4000-8000-000000000001")


@pytest.fixture
def posted_invoice(db_session, restaurant_a):
    seed_default_chart(db_session, restaurant_a.id)
    entity_id = restaurant_a.id
    with entity_context(db_session, entity_id):
        supplier = Supplier(name="Metro Gida", vkn="1234567890")
        db_session.add(supplier)
        db_session.commit()
        supplier_id = supplier.id
        expense_id = db_session.scalar(
            select(Account.id).where(Account.code == GENERAL_EXPENSE_CODE)
        )

        draft = InvoiceDraft(
            status=InvoiceDraftStatus.CONFIRMED,
            source_type=InvoiceSourceType.EFATURA_XML,
            file_fingerprint=f"void-release-{uuid.uuid4().hex[:8]}",
            supplier_id=supplier_id,
            invoice_number="VOID-REL-1",
            invoice_date=date(2026, 7, 31),
            net_kurus=100_000,
            gross_kurus=120_000,
            vat_breakdown=[
                {"rate_percent": 20, "base_kurus": 100_000, "vat_kurus": 20_000},
            ],
            currency="TRY",
            extraction_payload={},
            confirmed_by=ACTOR_ID,
        )
        db_session.add(draft)
        db_session.commit()
        draft_id = draft.id

    result = post_confirmed_draft(
        db_session, entity_id, draft_id, expense_account_id=expense_id, actor_id=ACTOR_ID
    )
    with entity_context(db_session, entity_id):
        entry_id = db_session.get(InvoiceDraft, draft_id).journal_entry_id
    assert result is not None
    return {"entity_id": entity_id, "draft_id": draft_id, "journal_entry_id": entry_id}


def _void(db_session, ctx):
    return void_supplier_invoice(
        db_session,
        ctx["entity_id"],
        ctx["journal_entry_id"],
        actor_id=ACTOR_ID,
        reason="wrong date",
    )


def test_the_draft_stops_saying_posted(db_session, posted_invoice):
    """`status` is what Review → Invoices reads. Left at `posted`, a voided
    invoice still shows as booked."""
    _void(db_session, posted_invoice)
    with entity_context(db_session, posted_invoice["entity_id"]):
        draft = db_session.get(InvoiceDraft, posted_invoice["draft_id"])
        assert draft.status == InvoiceDraftStatus.CONFIRMED
        assert draft.journal_entry_id is None
        assert draft.posted_at is None
        assert draft.posted_by is None


def test_the_draft_is_kept_not_discarded(db_session, posted_invoice):
    """The document was read and approved; only the posting was undone. It
    belongs in Ready to post, not deleted."""
    _void(db_session, posted_invoice)
    with entity_context(db_session, posted_invoice["entity_id"]):
        assert db_session.get(InvoiceDraft, posted_invoice["draft_id"]) is not None


def test_a_voided_entry_offers_no_actions(db_session, posted_invoice):
    """The second press did nothing because there was nothing to do — which
    is right, but it should never have been offered."""
    _void(db_session, posted_invoice)
    actions = resolve_ledger_entry_actions(
        db_session, posted_invoice["entity_id"], posted_invoice["journal_entry_id"]
    )
    assert actions.can_void is False
    assert actions.can_edit is False
    assert actions.void_path is None


def test_an_invoice_posted_by_hand_voids_without_a_draft(db_session, restaurant_a):
    """Most supplier invoices have an uploaded document behind them; one
    entered by hand does not, and the release must not assume it."""
    from app.core.payables import ledger as payables_ledger
    from app.core.ledger.models import JournalEntrySource
    from app.core.ledger.posting import prepare_journal_entry, PostingLine
    from app.core.chart_of_accounts.types import AccountNormalBalance
    from app.core.chart_of_accounts.default_chart import ACCOUNTS_PAYABLE_CODE

    seed_default_chart(db_session, restaurant_a.id)
    with entity_context(db_session, restaurant_a.id):
        supplier = Supplier(name="Hand Entered", vkn="1234567890")
        db_session.add(supplier)
        db_session.commit()
        supplier_id = supplier.id
        accounts = {a.code: a.id for a in db_session.scalars(select(Account))}
        entry = prepare_journal_entry(
            db_session,
            restaurant_a.id,
            date(2026, 7, 31),
            "Hand-entered invoice",
            [
                PostingLine(
                    account_id=accounts[GENERAL_EXPENSE_CODE],
                    amount_kurus=50_000,
                    side=AccountNormalBalance.DEBIT,
                ),
                PostingLine(
                    account_id=accounts[ACCOUNTS_PAYABLE_CODE],
                    amount_kurus=50_000,
                    side=AccountNormalBalance.CREDIT,
                ),
            ],
            actor_id=ACTOR_ID,
            source=JournalEntrySource.INVOICE,
        )
        payables_ledger.persist_supplier_invoice_entry(
            db_session,
            supplier_id,
            movement_date=date(2026, 7, 31),
            amount_kurus=50_000,
            description="Hand-entered invoice",
            actor_id=ACTOR_ID,
            journal_entry_id=entry.id,
            reference_type="manual",
            reference_id=entry.id,
        )
        db_session.commit()
        entry_id = entry.id

    result = void_supplier_invoice(
        db_session, restaurant_a.id, entry_id, actor_id=ACTOR_ID
    )
    assert result.reversal is not None
