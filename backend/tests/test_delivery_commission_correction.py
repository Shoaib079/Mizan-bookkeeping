"""Correcting and voiding a posted delivery commission invoice.

Until this existed, a delivery commission resolved to **neither edit nor
void** — the source sat in the void-and-re-enter set, and the ledger's action
resolver had no branch for it, so it fell through to "can_edit=False,
can_void=False". A commission posted for the wrong amount was in the books
with no way out from inside the app.

It is an invoice like any other. The only structural difference is where the
credit goes: a supplier invoice credits payables, a commission credits the
platform's clearing account. So there is no supplier subledger row to reverse,
and the correction is the GL plus the draft.

What these tests actually check is the money: that the clearing account ends
up carrying the corrected figure and not the sum of both, which is what a
correction that forgot to reverse would produce.
"""

from __future__ import annotations

import uuid
from datetime import date

import pytest
from sqlalchemy import select

from app.core.chart_of_accounts.default_chart import (
    DELIVERY_COMMISSION_EXPENSE_CODE,
    INPUT_VAT_CODE,
)
from app.core.chart_of_accounts.models import Account
from app.core.delivery.commission_posting import post_delivery_commission_draft
from app.core.ledger.balances import balance_as_of_kurus
from app.core.ledger.correction import (
    CorrectionNotFoundError,
    correct_delivery_commission_invoice,
    void_delivery_commission_invoice,
)
from app.core.ledger.entry_actions import resolve_ledger_entry_actions
from app.core.ledger.models import JournalEntry, JournalEntryStatus
from app.db.session import entity_context
from app.features.invoices.models import (
    InvoiceDraft,
    InvoiceDraftStatus,
    InvoiceKind,
    InvoiceSourceType,
)
from app.features.suppliers.models import Supplier
from tests.delivery_helpers import ACTOR_ID, delivery_setup as build_delivery_setup

NET = 62_500
GROSS = 75_000
CORRECTED_NET = 40_000
CORRECTED_GROSS = 48_000


@pytest.fixture
def commission(db_session, restaurant_a):
    """A posted commission invoice, with everything needed to correct it."""
    setup = build_delivery_setup(db_session, restaurant_a.id, platform_names=("Getir",))
    entity_id = setup["entity_id"]
    getir = setup["platforms"]["Getir"]

    with entity_context(db_session, entity_id):
        supplier = Supplier(name="Getir Platform", vkn="9876543210")
        db_session.add(supplier)
        db_session.commit()
        supplier_id = supplier.id
        accounts = {a.code: a.id for a in db_session.scalars(select(Account))}

    with entity_context(db_session, entity_id):
        draft = InvoiceDraft(
            status=InvoiceDraftStatus.CONFIRMED,
            invoice_kind=InvoiceKind.DELIVERY_COMMISSION.value,
            source_type=InvoiceSourceType.EFATURA_XML,
            file_fingerprint=f"commission-correct-{uuid.uuid4().hex[:8]}",
            supplier_name="Getir Platform",
            supplier_vkn="9876543210",
            supplier_id=supplier_id,
            delivery_platform_id=getir.id,
            invoice_number="GETIR-COM-1",
            invoice_date=date(2026, 4, 5),
            net_kurus=NET,
            gross_kurus=GROSS,
            vat_breakdown=[
                {"rate_percent": 20, "base_kurus": NET, "vat_kurus": GROSS - NET},
            ],
            currency="TRY",
            extraction_payload={},
            confirmed_by=ACTOR_ID,
        )
        db_session.add(draft)
        db_session.commit()
        draft_id = draft.id

    result = post_delivery_commission_draft(
        db_session,
        entity_id,
        draft_id,
        expense_account_id=accounts[DELIVERY_COMMISSION_EXPENSE_CODE],
        actor_id=ACTOR_ID,
    )
    return {
        "entity_id": entity_id,
        "draft_id": draft_id,
        "journal_entry_id": result.journal_entry.id,
        "clearing_id": getir.gl_account_id,
        "expense_id": accounts[DELIVERY_COMMISSION_EXPENSE_CODE],
        "vat_id": accounts[INPUT_VAT_CODE],
    }


def _balance(db_session, entity_id, account_id) -> int:
    """The balance the app itself reports for this account.

    Deliberately `balance_as_of_kurus` rather than a sum written here. The
    first version of this file summed lines with `status == POSTED`, which
    sounds right and is not: a void marks the original VOIDED and writes a
    *reversal* that stays POSTED, so filtering the original out while keeping
    its reversal leaves half a cancelling pair. A cleanly voided 75.000 read
    as −75.000, and a correction as −27.000 instead of 48.000. The code was
    fine; the test was measuring wrongly.

    `balances.py` drops both halves — `status == POSTED` *and*
    `reverses_entry_id IS NULL`. Calling it means these tests assert the
    figure the reports and the trial balance actually show, and cannot drift
    from it.

    Signs are natural to the account, which for a commission is worth stating
    plainly: the platform clearing account is an **asset** — what the platform
    owes the restaurant — and a commission invoice *credits* it. So a posted
    commission shows as a negative clearing balance: it reduces the payout
    still to come. The expense and the input VAT are debits and read positive.
    """
    with entity_context(db_session, entity_id):
        account = db_session.get(Account, account_id)
        return balance_as_of_kurus(db_session, account, date(2030, 1, 1))


# --- the actions it offers ----------------------------------------------


def test_a_posted_commission_can_be_edited_and_voided(db_session, commission):
    """The whole point. It used to offer neither."""
    actions = resolve_ledger_entry_actions(
        db_session, commission["entity_id"], commission["journal_entry_id"]
    )
    assert actions.can_edit is True, "a wrong commission had no way out of the app"
    assert actions.can_void is True
    assert actions.edit is not None
    assert actions.edit.kind == "delivery_commission"
    assert "delivery-commission" in actions.void_path


def test_the_edit_context_carries_what_the_form_needs(db_session, commission):
    actions = resolve_ledger_entry_actions(
        db_session, commission["entity_id"], commission["journal_entry_id"]
    )
    ctx = actions.edit.context
    assert ctx["gross_kurus"] == GROSS
    assert ctx["invoice_number"] == "GETIR-COM-1"
    assert ctx["movement_date"] == "2026-04-05"


# --- the money ----------------------------------------------------------


def test_correcting_leaves_only_the_new_figure_on_the_clearing_account(
    db_session, commission
):
    """The assertion that matters.

    A correction that reposted without reversing would leave the clearing
    account carrying 75.000 + 48.000, and the platform would look owed nearly
    twice what it is. Balancing the entry is not enough to catch that — both
    entries balance on their own.
    """
    entity_id = commission["entity_id"]
    before = _balance(db_session, entity_id, commission["clearing_id"])
    # Negative: the commission credits the clearing asset, reducing the payout
    # the platform still owes.
    assert before == -GROSS

    correct_delivery_commission_invoice(
        db_session,
        entity_id,
        commission["journal_entry_id"],
        invoice_date=date(2026, 4, 6),
        description="Getir commission (corrected)",
        actor_id=ACTOR_ID,
        expense_account_id=commission["expense_id"],
        net_kurus=CORRECTED_NET,
        gross_kurus=CORRECTED_GROSS,
        vat_breakdown=[
            {
                "rate_percent": 20,
                "base_kurus": CORRECTED_NET,
                "vat_kurus": CORRECTED_GROSS - CORRECTED_NET,
            }
        ],
        reason="Platform reissued at a lower amount",
    )

    after = _balance(db_session, entity_id, commission["clearing_id"])
    assert after == -CORRECTED_GROSS, (
        f"clearing carries {after}, expected {-CORRECTED_GROSS} — the original "
        "was not reversed, so both invoices are still weighing on the platform"
    )


def test_the_expense_and_vat_move_with_it(db_session, commission):
    entity_id = commission["entity_id"]
    correct_delivery_commission_invoice(
        db_session,
        entity_id,
        commission["journal_entry_id"],
        invoice_date=date(2026, 4, 6),
        description="Getir commission (corrected)",
        actor_id=ACTOR_ID,
        expense_account_id=commission["expense_id"],
        net_kurus=CORRECTED_NET,
        gross_kurus=CORRECTED_GROSS,
        vat_breakdown=[
            {
                "rate_percent": 20,
                "base_kurus": CORRECTED_NET,
                "vat_kurus": CORRECTED_GROSS - CORRECTED_NET,
            }
        ],
    )
    # Both are debit-normal, so a corrected invoice reads positive.
    assert _balance(db_session, entity_id, commission["expense_id"]) == CORRECTED_NET
    assert _balance(db_session, entity_id, commission["vat_id"]) == (
        CORRECTED_GROSS - CORRECTED_NET
    )


def test_the_draft_follows_the_correction(db_session, commission):
    """Or the invoice screen keeps showing the replaced figures, and the KDV
    report reads the old breakdown — both without complaint."""
    entity_id = commission["entity_id"]
    result = correct_delivery_commission_invoice(
        db_session,
        entity_id,
        commission["journal_entry_id"],
        invoice_date=date(2026, 4, 6),
        description="Getir commission (corrected)",
        actor_id=ACTOR_ID,
        expense_account_id=commission["expense_id"],
        net_kurus=CORRECTED_NET,
        gross_kurus=CORRECTED_GROSS,
        vat_breakdown=[
            {
                "rate_percent": 20,
                "base_kurus": CORRECTED_NET,
                "vat_kurus": CORRECTED_GROSS - CORRECTED_NET,
            }
        ],
    )
    with entity_context(db_session, entity_id):
        draft = db_session.get(InvoiceDraft, commission["draft_id"])
        assert draft.gross_kurus == CORRECTED_GROSS
        assert draft.net_kurus == CORRECTED_NET
        assert draft.invoice_date == date(2026, 4, 6)
        assert draft.journal_entry_id == result.corrected.id


def test_the_original_is_left_voided_not_deleted(db_session, commission):
    entity_id = commission["entity_id"]
    original_id = commission["journal_entry_id"]
    correct_delivery_commission_invoice(
        db_session,
        entity_id,
        original_id,
        invoice_date=date(2026, 4, 6),
        description="Getir commission (corrected)",
        actor_id=ACTOR_ID,
        expense_account_id=commission["expense_id"],
        net_kurus=CORRECTED_NET,
        gross_kurus=CORRECTED_GROSS,
        vat_breakdown=[
            {
                "rate_percent": 20,
                "base_kurus": CORRECTED_NET,
                "vat_kurus": CORRECTED_GROSS - CORRECTED_NET,
            }
        ],
    )
    with entity_context(db_session, entity_id):
        original = db_session.get(JournalEntry, original_id)
        assert original is not None
        assert original.status == JournalEntryStatus.VOIDED


# --- voiding ------------------------------------------------------------


def test_voiding_clears_the_clearing_account(db_session, commission):
    entity_id = commission["entity_id"]
    void_delivery_commission_invoice(
        db_session,
        entity_id,
        commission["journal_entry_id"],
        actor_id=ACTOR_ID,
        reason="Not our invoice",
    )
    assert _balance(db_session, entity_id, commission["clearing_id"]) == 0


def test_voiding_puts_the_draft_back_where_it_can_be_used(db_session, commission):
    """A voided invoice whose draft still reads `posted` is the state that made
    re-uploading the same file impossible earlier — and it keeps the invoice
    out of the review queue while its money is no longer in the ledger."""
    entity_id = commission["entity_id"]
    void_delivery_commission_invoice(
        db_session,
        entity_id,
        commission["journal_entry_id"],
        actor_id=ACTOR_ID,
    )
    with entity_context(db_session, entity_id):
        draft = db_session.get(InvoiceDraft, commission["draft_id"])
        assert draft.status == InvoiceDraftStatus.CONFIRMED
        assert draft.journal_entry_id is None
        assert draft.posted_at is None


# --- what it refuses ----------------------------------------------------


def _correct(db_session, entity_id, entry_id, commission):
    correct_delivery_commission_invoice(
        db_session,
        entity_id,
        entry_id,
        invoice_date=date(2026, 4, 6),
        description="wrong type",
        actor_id=ACTOR_ID,
        expense_account_id=commission["expense_id"],
        net_kurus=CORRECTED_NET,
        gross_kurus=CORRECTED_GROSS,
        vat_breakdown=[
            {
                "rate_percent": 20,
                "base_kurus": CORRECTED_NET,
                "vat_kurus": CORRECTED_GROSS - CORRECTED_NET,
            }
        ],
    )


def test_an_entry_with_no_invoice_behind_it_is_refused(db_session, commission):
    """Rather than posting a credit to a platform clearing account for
    something that is not a platform invoice."""
    with pytest.raises(CorrectionNotFoundError):
        _correct(db_session, commission["entity_id"], uuid.uuid4(), commission)


def test_a_supplier_invoice_is_not_correctable_through_this_route(
    db_session, commission
):
    """The routes are per document type on purpose: this one credits the
    platform's clearing account, which is wrong for a supplier invoice."""
    entity_id = commission["entity_id"]
    with entity_context(db_session, entity_id):
        draft = db_session.get(InvoiceDraft, commission["draft_id"])
        draft.invoice_kind = InvoiceKind.SUPPLIER.value
        db_session.commit()

    with pytest.raises(CorrectionNotFoundError):
        _correct(
            db_session, entity_id, commission["journal_entry_id"], commission
        )
