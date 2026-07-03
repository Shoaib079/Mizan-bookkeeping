"""Supplier invoice edit — activity flags and expense account."""

from __future__ import annotations

import uuid
from datetime import date

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.chart_of_accounts.models import Account
from app.core.chart_of_accounts.seed import seed_default_chart

from app.core.invoices.posting import post_confirmed_draft
from app.core.ledger.correction import correct_supplier_invoice
from app.features.suppliers.models import Supplier
from app.db.session import entity_context
from app.features.invoices.models import InvoiceDraft, InvoiceDraftStatus, InvoiceSourceType
from app.features.payables.supplier_activity import get_supplier_activity

ACTOR_ID = uuid.UUID("00000000-0000-4000-8000-000000000001")


@pytest.fixture
def seeded_accounts(db_session, restaurant_a):
    seed_default_chart(db_session, restaurant_a.id)
    with entity_context(db_session, restaurant_a.id):
        accounts = list(db_session.scalars(select(Account)))
    return {account.code: account.id for account in accounts}


def _supplier(db_session: Session, entity) -> uuid.UUID:
    with entity_context(db_session, entity.id):
        supplier = Supplier(name="Metro Gida", vkn="1234567890")
        db_session.add(supplier)
        db_session.commit()
        db_session.refresh(supplier)
        return supplier.id


def test_activity_can_edit_only_current_invoice_row(
    db_session: Session, restaurant_a, seeded_accounts
) -> None:
    supplier_id = _supplier(db_session, restaurant_a)
    supplies_id = seeded_accounts["5220"]
    rent_id = seeded_accounts["5200"]

    with entity_context(db_session, restaurant_a.id):
        draft = InvoiceDraft(
            status=InvoiceDraftStatus.CONFIRMED,
            source_type=InvoiceSourceType.EFATURA_XML,
            file_fingerprint="activity-edit",
            supplier_id=supplier_id,
            invoice_number="INV-ACT",
            invoice_date=date(2026, 4, 1),
            net_kurus=500_000,
            gross_kurus=600_000,
            vat_breakdown=[
                {"rate_percent": 20, "base_kurus": 500_000, "vat_kurus": 100_000},
            ],
            currency="TRY",
            extraction_payload={},
            confirmed_by=ACTOR_ID,
        )
        db_session.add(draft)
        db_session.commit()
        draft_id = draft.id

    post_confirmed_draft(
        db_session,
        restaurant_a.id,
        draft_id,
        expense_account_id=rent_id,
        actor_id=ACTOR_ID,
    )

    with entity_context(db_session, restaurant_a.id):
        draft = db_session.get(InvoiceDraft, draft_id)
        assert draft is not None
        original_je = draft.journal_entry_id
        assert original_je is not None

    correct_supplier_invoice(
        db_session,
        restaurant_a.id,
        original_je,
        invoice_date=date(2026, 4, 1),
        description="Invoice INV-ACT",
        actor_id=ACTOR_ID,
        expense_account_id=supplies_id,
        net_kurus=500_000,
        gross_kurus=600_000,
        vat_breakdown=[
            {"rate_percent": 20, "base_kurus": 500_000, "vat_kurus": 100_000},
        ],
    )

    activity = get_supplier_activity(
        db_session,
        restaurant_a.id,
        supplier_id,
        from_date=date(2026, 4, 1),
        to_date=date(2026, 4, 30),
    )
    invoice_rows = [row for row in activity.rows if row.movement_kind == "invoice"]
    editable = [row for row in invoice_rows if row.can_edit]
    assert len(editable) == 1
    assert editable[0].expense_account_id == supplies_id


def test_edit_from_reversal_je_resolves_to_corrected(
    client, db_session: Session, restaurant_a, seeded_accounts
) -> None:
    """Editing via a reversal journal entry id still updates the live invoice."""
    supplier_id = _supplier(db_session, restaurant_a)
    supplies_id = seeded_accounts["5220"]
    rent_id = seeded_accounts["5200"]
    entity_id = restaurant_a.id

    with entity_context(db_session, entity_id):
        draft = InvoiceDraft(
            status=InvoiceDraftStatus.CONFIRMED,
            source_type=InvoiceSourceType.EFATURA_XML,
            file_fingerprint="resolve-edit",
            supplier_id=supplier_id,
            invoice_number="INV-RES",
            invoice_date=date(2026, 5, 1),
            net_kurus=400_000,
            gross_kurus=480_000,
            vat_breakdown=[
                {"rate_percent": 20, "base_kurus": 400_000, "vat_kurus": 80_000},
            ],
            currency="TRY",
            extraction_payload={},
            confirmed_by=ACTOR_ID,
        )
        db_session.add(draft)
        db_session.commit()
        draft_id = draft.id

    post_confirmed_draft(
        db_session,
        entity_id,
        draft_id,
        expense_account_id=rent_id,
        actor_id=ACTOR_ID,
    )

    with entity_context(db_session, entity_id):
        draft = db_session.get(InvoiceDraft, draft_id)
        assert draft is not None
        original_je = draft.journal_entry_id

    first = client.post(
        f"/entities/{entity_id}/suppliers/{supplier_id}/invoices/{original_je}/correct",
        json={
            "invoice_date": "2026-05-01",
            "description": "Invoice INV-RES",
            "actor_id": str(ACTOR_ID),
            "expense_account_id": str(rent_id),
            "net_kurus": 400_000,
            "gross_kurus": 480_000,
            "vat_breakdown": [
                {"rate_percent": 20, "base_kurus": 400_000, "vat_kurus": 80_000},
            ],
        },
    )
    assert first.status_code == 200
    reversal_je = first.json()["reversal_journal_entry_id"]

    second = client.post(
        f"/entities/{entity_id}/suppliers/{supplier_id}/invoices/{reversal_je}/correct",
        json={
            "invoice_date": "2026-05-01",
            "description": "Invoice INV-RES",
            "actor_id": str(ACTOR_ID),
            "expense_account_id": str(supplies_id),
            "net_kurus": 400_000,
            "gross_kurus": 480_000,
            "vat_breakdown": [
                {"rate_percent": 20, "base_kurus": 400_000, "vat_kurus": 80_000},
            ],
        },
    )
    assert second.status_code == 200
    assert second.json()["corrected_journal_entry_id"] != first.json()["corrected_journal_entry_id"]
