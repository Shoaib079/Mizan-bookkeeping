"""Supplier activity timeline — void rows and live invoice totals."""

from __future__ import annotations

import uuid
from datetime import date

import pytest
from sqlalchemy import select

from app.core.chart_of_accounts.models import Account
from app.core.chart_of_accounts.seed import seed_default_chart
from app.core.invoices.posting import post_confirmed_draft
from app.core.ledger.correction import correct_supplier_invoice
from app.db.session import entity_context
from app.features.invoices.models import InvoiceDraft, InvoiceDraftStatus, InvoiceSourceType
from app.features.payables import supplier_activity
from app.features.suppliers.models import Supplier

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


def test_void_reversal_row_shows_negative_amount(
    db_session, restaurant_a, seeded_accounts
) -> None:
    supplier_id = _supplier(db_session, restaurant_a)
    rent_id = seeded_accounts["5200"]
    supplies_id = seeded_accounts["5220"]

    with entity_context(db_session, restaurant_a.id):
        draft = InvoiceDraft(
            status=InvoiceDraftStatus.CONFIRMED,
            source_type=InvoiceSourceType.EFATURA_XML,
            file_fingerprint="void-display",
            supplier_id=supplier_id,
            invoice_number="INV-VOID",
            invoice_date=date(2026, 6, 1),
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
        posted = db_session.get(InvoiceDraft, draft_id)
        assert posted is not None
        original_je = posted.journal_entry_id
        assert original_je is not None

    correct_supplier_invoice(
        db_session,
        restaurant_a.id,
        original_je,
        invoice_date=date(2026, 6, 1),
        description="Invoice INV-VOID",
        actor_id=ACTOR_ID,
        expense_account_id=supplies_id,
        net_kurus=500_000,
        gross_kurus=600_000,
        vat_breakdown=[
            {"rate_percent": 20, "base_kurus": 500_000, "vat_kurus": 100_000},
        ],
        void_date=date(2026, 6, 1),
    )

    report = supplier_activity.get_supplier_activity(
        db_session,
        restaurant_a.id,
        supplier_id,
        from_date=date(2026, 6, 1),
        to_date=date(2026, 6, 30),
    )

    invoice_rows = [row for row in report.rows if row.movement_kind == "invoice"]
    void_rows = [row for row in invoice_rows if row.movement_label == "İptal"]
    live_rows = [
        row
        for row in invoice_rows
        if row.affects_balance and (row.amount_kurus or 0) > 0
    ]

    assert len(void_rows) == 1
    assert void_rows[0].amount_kurus == -600_000
    assert len(live_rows) == 1
    assert live_rows[0].amount_kurus == 600_000
    assert report.total_invoices_gross_kurus == 600_000
