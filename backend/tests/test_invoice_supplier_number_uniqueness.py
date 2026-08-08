"""Supplier + invoice number uniqueness — live posted guard (Decisions §7)."""

from __future__ import annotations

import uuid
from datetime import date
from pathlib import Path

import pytest
from sqlalchemy import select

from app.core.chart_of_accounts.models import Account
from app.core.chart_of_accounts.seed import seed_default_chart
from app.core.invoices.posting import DraftPostError, post_confirmed_draft
from app.core.ledger.correction import correct_supplier_invoice
from app.db.session import entity_context
from app.features.invoices.invoice_uniqueness import normalize_invoice_number
from app.features.invoices.models import InvoiceDraft, InvoiceDraftStatus, InvoiceSourceType
from app.features.invoices import service as invoice_service
from app.features.suppliers.models import Supplier

FIXTURES = Path(__file__).resolve().parent / "fixtures" / "efatura"
SAMPLE_XML = FIXTURES / "sample.xml"

ACTOR_ID = uuid.UUID("00000000-0000-4000-8000-000000000001")


@pytest.fixture
def seeded_accounts(db_session, restaurant_a):
    seed_default_chart(db_session, restaurant_a.id)
    with entity_context(db_session, restaurant_a.id):
        accounts = list(db_session.scalars(select(Account)))
    return {account.code: account.id for account in accounts}


def _supplier(db_session, entity) -> uuid.UUID:
    with entity_context(db_session, entity.id):
        supplier = Supplier(name="Metro Gida", vkn="1234567890")
        db_session.add(supplier)
        db_session.commit()
        db_session.refresh(supplier)
        return supplier.id


def _confirmed_draft(
    db_session,
    entity,
    supplier_id,
    *,
    invoice_number: str,
    fingerprint: str,
) -> InvoiceDraft:
    with entity_context(db_session, entity.id):
        draft = InvoiceDraft(
            status=InvoiceDraftStatus.CONFIRMED,
            source_type=InvoiceSourceType.EFATURA_XML,
            file_fingerprint=fingerprint,
            supplier_id=supplier_id,
            invoice_number=invoice_number,
            invoice_date=date(2026, 3, 15),
            net_kurus=1_000_000,
            gross_kurus=1_200_000,
            vat_breakdown=[
                {"rate_percent": 20, "base_kurus": 1_000_000, "vat_kurus": 200_000},
            ],
            currency="TRY",
            extraction_payload={},
            confirmed_by=ACTOR_ID,
        )
        db_session.add(draft)
        db_session.commit()
        db_session.refresh(draft)
        return draft


def test_normalize_invoice_number_strips_and_casefolds() -> None:
    assert normalize_invoice_number("  EF2026000123  ") == "ef2026000123"
    assert normalize_invoice_number("AbC-123") == "abc-123"


def test_post_blocks_same_number_different_fingerprint(
    db_session, restaurant_a, seeded_accounts
) -> None:
    supplier_id = _supplier(db_session, restaurant_a)
    expense_id = seeded_accounts["5200"]
    number = "EF2026000123"

    first = _confirmed_draft(
        db_session,
        restaurant_a,
        supplier_id,
        invoice_number=number,
        fingerprint="fp-first",
    )
    post_confirmed_draft(
        db_session,
        restaurant_a.id,
        first.id,
        expense_account_id=expense_id,
        actor_id=ACTOR_ID,
    )

    second = _confirmed_draft(
        db_session,
        restaurant_a,
        supplier_id,
        invoice_number="  ef2026000123 ",
        fingerprint="fp-second-different-bytes",
    )
    with pytest.raises(DraftPostError, match="already has a posted invoice"):
        post_confirmed_draft(
            db_session,
            restaurant_a.id,
            second.id,
            expense_account_id=expense_id,
            actor_id=ACTOR_ID,
        )


def test_upload_marks_duplicate_when_live_posted_exists(
    db_session, restaurant_a, seeded_accounts
) -> None:
    supplier_id = _supplier(db_session, restaurant_a)
    expense_id = seeded_accounts["5200"]

    first = _confirmed_draft(
        db_session,
        restaurant_a,
        supplier_id,
        invoice_number="EF2026000123",
        fingerprint="posted-original",
    )
    post_confirmed_draft(
        db_session,
        restaurant_a.id,
        first.id,
        expense_account_id=expense_id,
        actor_id=ACTOR_ID,
    )

    altered = SAMPLE_XML.read_bytes().replace(
        b"<cbc:ID>EF2026000123</cbc:ID>",
        b"<cbc:ID>EF2026000123</cbc:ID>",
    )
    # Different file bytes (alter a harmless field) but same invoice number.
    altered = altered.replace(
        b"Metro Gida Ticaret A.S.",
        b"Metro Gida Ticaret A.S. ",
    )

    out = invoice_service.create_efatura_draft_from_upload(
        db_session,
        restaurant_a.id,
        altered,
        filename="reshaped.xml",
    )
    assert out.status == InvoiceDraftStatus.DUPLICATE
    assert out.review_reason is not None
    assert "EF2026000123" in out.review_reason


#: The same invoice number in a file that is not byte-identical — a supplier
#: re-sending a corrected copy, and a supplier billing twice, look like this.
ALTERED_SAME_NUMBER = SAMPLE_XML.read_bytes().replace(
    b"Metro Gida Ticaret A.S.", b"Metro Gida Ticaret A.S. "
)


def test_rejecting_a_duplicate_does_not_blacklist_the_invoice(
    client, db_session, restaurant_a, seeded_accounts
) -> None:
    """Reject by mistake and you can upload it again.

    This is the property worth keeping: rejection is a decision about one row,
    not a permanent ban on a document.

    It used to be shown with the *same file* uploaded twice, which also pinned
    something else — that re-uploading a posted file creates a fresh review
    row every time. That was the owner's complaint ("it must delete that
    duplicate invoice"), and identical bytes are the same document, so the
    same file now returns 409 and creates nothing. The number-matches case is
    the one that still needs a person, and it is the one demonstrated here.
    """
    supplier_id = _supplier(db_session, restaurant_a)
    entity_id = restaurant_a.id
    url = f"/entities/{entity_id}/invoices/efatura/draft"

    first = client.post(
        url, files={"file": ("sample.xml", SAMPLE_XML.read_bytes(), "application/xml")}
    )
    assert first.status_code == 201
    draft_id = first.json()["id"]

    with entity_context(db_session, entity_id):
        draft = db_session.get(InvoiceDraft, uuid.UUID(draft_id))
        assert draft is not None
        draft.supplier_id = supplier_id
        draft.status = InvoiceDraftStatus.CONFIRMED.value
        draft.confirmed_by = ACTOR_ID
        db_session.commit()

    post_confirmed_draft(
        db_session,
        entity_id,
        uuid.UUID(draft_id),
        expense_account_id=seeded_accounts["5200"],
        actor_id=ACTOR_ID,
    )

    second = client.post(
        url, files={"file": ("reissued.xml", ALTERED_SAME_NUMBER, "application/xml")}
    )
    assert second.status_code == 201, second.text
    second_id = second.json()["id"]
    assert second.json()["status"] == "duplicate"

    reject = client.post(
        f"/entities/{entity_id}/invoices/drafts/{second_id}/reject",
        json={"reason": "Not needed"},
    )
    assert reject.status_code == 204

    third = client.post(
        url, files={"file": ("reissued.xml", ALTERED_SAME_NUMBER, "application/xml")}
    )
    assert third.status_code == 201, third.text
    assert third.json()["status"] == "duplicate"
    assert third.json()["id"] != second_id


def test_reuploading_a_posted_file_is_refused_not_queued(
    client, db_session, restaurant_a, seeded_accounts
) -> None:
    """The other half of the same change, through the API.

    409 with a message saying it is already posted, rather than a 201 that
    leaves a row to discard by hand.
    """
    supplier_id = _supplier(db_session, restaurant_a)
    entity_id = restaurant_a.id
    content = SAMPLE_XML.read_bytes()
    url = f"/entities/{entity_id}/invoices/efatura/draft"

    first = client.post(url, files={"file": ("sample.xml", content, "application/xml")})
    assert first.status_code == 201
    draft_id = first.json()["id"]

    with entity_context(db_session, entity_id):
        draft = db_session.get(InvoiceDraft, uuid.UUID(draft_id))
        draft.supplier_id = supplier_id
        draft.status = InvoiceDraftStatus.CONFIRMED.value
        draft.confirmed_by = ACTOR_ID
        db_session.commit()

    post_confirmed_draft(
        db_session,
        entity_id,
        uuid.UUID(draft_id),
        expense_account_id=seeded_accounts["5200"],
        actor_id=ACTOR_ID,
    )

    again = client.post(url, files={"file": ("sample.xml", content, "application/xml")})
    assert again.status_code == 409, again.text
    detail = again.json()["detail"]
    assert "already posted" in detail["message"]
    assert detail["existing_draft_id"] == draft_id


def test_correction_same_number_is_exempt(
    db_session, restaurant_a, seeded_accounts
) -> None:
    supplier_id = _supplier(db_session, restaurant_a)
    supplies_id = seeded_accounts["5220"]
    rent_id = seeded_accounts["5200"]

    draft = _confirmed_draft(
        db_session,
        restaurant_a,
        supplier_id,
        invoice_number="INV-CORR",
        fingerprint="corr-fp",
    )
    post_confirmed_draft(
        db_session,
        restaurant_a.id,
        draft.id,
        expense_account_id=rent_id,
        actor_id=ACTOR_ID,
    )

    with entity_context(db_session, restaurant_a.id):
        posted = db_session.get(InvoiceDraft, draft.id)
        assert posted is not None
        original_je = posted.journal_entry_id
        assert original_je is not None

    correct_supplier_invoice(
        db_session,
        restaurant_a.id,
        original_je,
        invoice_date=date(2026, 3, 15),
        description="Invoice INV-CORR",
        actor_id=ACTOR_ID,
        expense_account_id=supplies_id,
        net_kurus=900_000,
        gross_kurus=1_080_000,
        vat_breakdown=[
            {"rate_percent": 20, "base_kurus": 900_000, "vat_kurus": 180_000},
        ],
    )

    with entity_context(db_session, restaurant_a.id):
        refreshed = db_session.get(InvoiceDraft, draft.id)
        assert refreshed is not None
        assert refreshed.invoice_number == "INV-CORR"
        assert refreshed.gross_kurus == 1_080_000
        assert refreshed.net_kurus == 900_000

    with pytest.raises(DraftPostError, match="already has a posted invoice"):
        duplicate = _confirmed_draft(
            db_session,
            restaurant_a,
            supplier_id,
            invoice_number="INV-CORR",
            fingerprint="corr-dup",
        )
        post_confirmed_draft(
            db_session,
            restaurant_a.id,
            duplicate.id,
            expense_account_id=supplies_id,
            actor_id=ACTOR_ID,
        )


def test_reuploading_the_same_posted_file_makes_no_new_review_row(
    db_session, restaurant_a, seeded_accounts
) -> None:
    """The same file is never a second invoice.

    The duplicate-number branch mints a random fingerprint so the row can sit
    beside the posted original. That branch used to run *before* the ordinary
    same-file check, so re-uploading one posted file left a fresh review row
    every time — three uploads, three rows to discard by hand.

    A different file with the same number still becomes a review row; that is
    the case a person has to judge, and the test above covers it.
    """
    supplier_id = _supplier(db_session, restaurant_a)
    content = SAMPLE_XML.read_bytes()

    first = invoice_service.create_efatura_draft_from_upload(
        db_session, restaurant_a.id, content, filename="sample.xml"
    )
    with entity_context(db_session, restaurant_a.id):
        draft = db_session.get(InvoiceDraft, first.id)
        draft.status = InvoiceDraftStatus.CONFIRMED.value
        draft.supplier_id = supplier_id
        db_session.commit()
    post_confirmed_draft(
        db_session,
        restaurant_a.id,
        first.id,
        expense_account_id=seeded_accounts["5200"],
        actor_id=ACTOR_ID,
    )

    with entity_context(db_session, restaurant_a.id):
        before = len(list(db_session.scalars(select(InvoiceDraft))))

    with pytest.raises(invoice_service.DuplicateInvoiceDraftError) as caught:
        invoice_service.create_efatura_draft_from_upload(
            db_session, restaurant_a.id, content, filename="sample.xml"
        )
    # It points at the invoice already in the books, so the caller can say so.
    assert caught.value.existing.id == first.id

    with entity_context(db_session, restaurant_a.id):
        after = len(list(db_session.scalars(select(InvoiceDraft))))
    assert after == before, "re-uploading a posted file left a duplicate to clean up"
