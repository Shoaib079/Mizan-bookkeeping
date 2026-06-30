"""Supplier activity timeline API."""

from __future__ import annotations

import uuid
from datetime import date
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from app.core.chart_of_accounts.models import Account
from app.core.chart_of_accounts.seed import ChartAlreadySeededError, seed_default_chart
from app.core.invoices.posting import post_confirmed_draft
from app.core.payables import posting as payables_posting
from app.db.session import entity_context
from app.features.invoices.models import InvoiceDraft, InvoiceDraftStatus, InvoiceKind, InvoiceSourceType
from app.features.invoices import service as invoice_service
from app.features.payables import supplier_activity
from app.features.suppliers import service as supplier_service
from app.features.suppliers.schema import SupplierCreate
from tests.delivery_helpers import ACTOR_ID, create_platform, enable_delivery

FIXTURES = Path(__file__).resolve().parent / "fixtures" / "efatura"


@pytest.fixture(autouse=True)
def _seed(db_session, restaurant_a):
    try:
        seed_default_chart(db_session, restaurant_a.id)
    except ChartAlreadySeededError:
        pass


def _supplier(db_session, entity_id):
    return supplier_service.create_supplier(
        db_session,
        entity_id,
        SupplierCreate(name="Metro Tedarik", vkn="1234567890", actor_id=ACTOR_ID),
    )


def test_supplier_activity_chronological(db_session, restaurant_a) -> None:
    entity_id = restaurant_a.id
    supplier = _supplier(db_session, entity_id)
    supplier_id = supplier.id

    with entity_context(db_session, entity_id):
        accounts = {a.code: a.id for a in db_session.scalars(select(Account))}

    draft = invoice_service.create_efatura_draft_from_upload(
        db_session,
        entity_id,
        (FIXTURES / "sample.xml").read_bytes(),
        filename="sample.xml",
    )
    invoice_service.link_supplier_to_draft(
        db_session, entity_id, draft.id, supplier_id=supplier_id
    )
    confirmed = invoice_service.confirm_invoice_draft(
        db_session, entity_id, draft.id, actor_id=ACTOR_ID
    )
    post_confirmed_draft(
        db_session,
        entity_id,
        confirmed.id,
        expense_account_id=accounts["5200"],
        actor_id=ACTOR_ID,
    )

    payables_posting.post_supplier_payment(
        db_session,
        entity_id,
        supplier_id,
        payment_date=date(2026, 3, 20),
        amount_kurus=5_000_000,
        description="Metro payment",
        actor_id=ACTOR_ID,
        payment_account_id=accounts["1000"],
        reference_type="DKT-123",
    )

    report = supplier_activity.get_supplier_activity(
        db_session,
        entity_id,
        supplier_id,
        from_date=date(2026, 3, 1),
        to_date=date(2026, 3, 31),
    )

    invoice_row = next(r for r in report.rows if r.movement_kind == "invoice")
    gross = invoice_row.amount_kurus or 0

    kinds = [row.movement_kind for row in report.rows]
    assert "opening" in kinds
    assert "invoice" in kinds
    assert "payment" in kinds
    assert "closing" in kinds
    assert report.total_payments_kurus == 5_000_000
    assert report.closing_balance_kurus == report.opening_balance_kurus + gross - 5_000_000


def test_commission_confirm_without_supplier(db_session, restaurant_a) -> None:
    entity_id = restaurant_a.id
    enable_delivery(db_session, entity_id)
    getir = create_platform(db_session, entity_id, "Getir")

    with entity_context(db_session, entity_id):
        draft = InvoiceDraft(
            status=InvoiceDraftStatus.DRAFT.value,
            invoice_kind=InvoiceKind.DELIVERY_COMMISSION.value,
            source_type=InvoiceSourceType.EFATURA_XML,
            file_fingerprint=f"commission-{uuid.uuid4().hex}",
            supplier_name="Getir",
            supplier_vkn="9876543210",
            supplier_id=None,
            delivery_platform_id=getir.id,
            invoice_number="GETIR-COM-1",
            invoice_date=date(2026, 4, 5),
            net_kurus=62_500,
            gross_kurus=75_000,
            vat_breakdown=[
                {"rate_percent": 20, "base_kurus": 62_500, "vat_kurus": 12_500},
            ],
            currency="TRY",
            extraction_payload={},
        )
        db_session.add(draft)
        db_session.commit()
        db_session.refresh(draft)

    confirmed = invoice_service.confirm_invoice_draft(
        db_session, entity_id, draft.id, actor_id=ACTOR_ID
    )
    assert confirmed.status == InvoiceDraftStatus.CONFIRMED


def test_activity_export_endpoint(db_session, restaurant_a, client: TestClient) -> None:
    entity_id = restaurant_a.id
    supplier = _supplier(db_session, entity_id)

    resp = client.get(
        f"/entities/{entity_id}/suppliers/{supplier.id}/activity/export"
        f"?from_date=2026-01-01&to_date=2026-01-31",
    )
    assert resp.status_code == 200, resp.text
    assert "spreadsheetml" in resp.headers["content-type"]
