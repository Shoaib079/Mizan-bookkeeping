"""Invoice draft list filters — posted view, kind, platform, date range."""

from __future__ import annotations

import uuid
from datetime import date

from sqlalchemy import select

from app.core.chart_of_accounts.models import Account
from app.core.chart_of_accounts.seed import seed_default_chart
from app.core.delivery.commission_posting import post_delivery_commission_draft
from app.core.invoices.posting import post_confirmed_draft
from app.db.session import entity_context
from app.features.invoices.models import (
    InvoiceDraft,
    InvoiceDraftStatus,
    InvoiceKind,
    InvoiceSourceType,
)
from app.features.suppliers.models import Supplier
from tests.delivery_helpers import ACTOR_ID, delivery_setup as build_delivery_setup


def _supplier(db_session, entity_id) -> uuid.UUID:
    with entity_context(db_session, entity_id):
        supplier = Supplier(name="Metro Gida", vkn="1234567890")
        db_session.add(supplier)
        db_session.commit()
        db_session.refresh(supplier)
        return supplier.id


def _expense_account_id(db_session, entity_id, code: str) -> uuid.UUID:
    with entity_context(db_session, entity_id):
        expense = db_session.scalar(select(Account).where(Account.code == code))
        if expense is None:
            seed_default_chart(db_session, entity_id)
            expense = db_session.scalar(select(Account).where(Account.code == code))
        assert expense is not None
        return expense.id


def _manual_confirmed_supplier_draft(
    db_session,
    entity_id,
    supplier_id: uuid.UUID,
    *,
    invoice_date: date,
    invoice_number: str,
) -> InvoiceDraft:
    with entity_context(db_session, entity_id):
        draft = InvoiceDraft(
            status=InvoiceDraftStatus.CONFIRMED,
            invoice_kind=InvoiceKind.SUPPLIER.value,
            source_type=InvoiceSourceType.EFATURA_XML,
            file_fingerprint=f"list-filter-{invoice_number}",
            supplier_id=supplier_id,
            invoice_number=invoice_number,
            invoice_date=invoice_date,
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


def _posted_supplier_draft(
    db_session, entity, supplier_id, *, invoice_date: date, invoice_number: str = "LIST-001"
) -> InvoiceDraft:
    draft = _manual_confirmed_supplier_draft(
        db_session,
        entity.id,
        supplier_id,
        invoice_date=invoice_date,
        invoice_number=invoice_number,
    )
    expense_id = _expense_account_id(db_session, entity.id, "5200")
    with entity_context(db_session, entity.id):
        post_confirmed_draft(
            db_session,
            entity.id,
            draft.id,
            actor_id=ACTOR_ID,
            expense_account_id=expense_id,
        )
        db_session.commit()
        db_session.refresh(draft)
        return draft


def _posted_commission_draft(
    db_session,
    entity_id,
    supplier_id: uuid.UUID,
    platform_id: uuid.UUID,
    *,
    invoice_date: date,
    gross_kurus: int = 75_000,
) -> InvoiceDraft:
    net_kurus = gross_kurus * 5 // 6
    vat_kurus = gross_kurus - net_kurus
    with entity_context(db_session, entity_id):
        draft = InvoiceDraft(
            status=InvoiceDraftStatus.CONFIRMED,
            invoice_kind=InvoiceKind.DELIVERY_COMMISSION.value,
            source_type=InvoiceSourceType.EFATURA_XML,
            file_fingerprint=f"commission-list-{gross_kurus}-{uuid.uuid4().hex[:8]}",
            supplier_name="Getir Platform",
            supplier_vkn="9876543210",
            supplier_id=supplier_id,
            delivery_platform_id=platform_id,
            invoice_number=f"GETIR-LIST-{gross_kurus}",
            invoice_date=invoice_date,
            net_kurus=net_kurus,
            gross_kurus=gross_kurus,
            vat_breakdown=[
                {"rate_percent": 20, "base_kurus": net_kurus, "vat_kurus": vat_kurus},
            ],
            currency="TRY",
            extraction_payload={},
            confirmed_by=ACTOR_ID,
        )
        db_session.add(draft)
        db_session.commit()
        db_session.refresh(draft)
    expense_id = _expense_account_id(db_session, entity_id, "5500")
    with entity_context(db_session, entity_id):
        post_delivery_commission_draft(
            db_session,
            entity_id,
            draft.id,
            actor_id=ACTOR_ID,
            expense_account_id=expense_id,
        )
        db_session.commit()
        db_session.refresh(draft)
        return draft


def test_list_posted_includes_supplier_and_commission(
    client, restaurant_a, db_session
) -> None:
    supplier_id = _supplier(db_session, restaurant_a.id)
    setup = build_delivery_setup(db_session, restaurant_a.id)
    platform_id = setup["platforms"]["Getir"].id

    _posted_supplier_draft(
        db_session, restaurant_a, supplier_id, invoice_date=date(2026, 4, 10)
    )
    _posted_commission_draft(
        db_session,
        restaurant_a.id,
        supplier_id,
        platform_id,
        invoice_date=date(2026, 4, 12),
    )

    response = client.get(
        f"/entities/{restaurant_a.id}/invoices/drafts",
        params={"status": "posted"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["total"] == 2
    kinds = {item["invoice_kind"] for item in body["items"]}
    assert kinds == {"supplier", "delivery_commission"}
    for item in body["items"]:
        assert item["status"] == "posted"
        assert item["journal_entry_id"] is not None


def test_list_posted_date_range(client, restaurant_a, db_session) -> None:
    supplier_id = _supplier(db_session, restaurant_a.id)
    _posted_supplier_draft(
        db_session,
        restaurant_a,
        supplier_id,
        invoice_date=date(2026, 3, 5),
        invoice_number="LIST-MAR",
    )
    _posted_supplier_draft(
        db_session,
        restaurant_a,
        supplier_id,
        invoice_date=date(2026, 4, 15),
        invoice_number="LIST-APR",
    )

    in_range = client.get(
        f"/entities/{restaurant_a.id}/invoices/drafts",
        params={"status": "posted", "from": "2026-04-01", "to": "2026-04-30"},
    )
    assert in_range.status_code == 200
    assert in_range.json()["total"] == 1
    assert in_range.json()["items"][0]["invoice_date"] == "2026-04-15"

    empty = client.get(
        f"/entities/{restaurant_a.id}/invoices/drafts",
        params={"status": "posted", "from": "2026-01-01", "to": "2026-01-31"},
    )
    assert empty.json()["total"] == 0


def test_list_posted_commission_by_platform(client, restaurant_a, db_session) -> None:
    setup = build_delivery_setup(db_session, restaurant_a.id)
    getir_id = setup["platforms"]["Getir"].id
    yemek_id = setup["platforms"]["Yemeksepeti"].id
    supplier_id = _supplier(db_session, restaurant_a.id)

    _posted_commission_draft(
        db_session,
        restaurant_a.id,
        supplier_id,
        getir_id,
        invoice_date=date(2026, 4, 8),
        gross_kurus=75_000,
    )
    _posted_commission_draft(
        db_session,
        restaurant_a.id,
        supplier_id,
        yemek_id,
        invoice_date=date(2026, 4, 9),
        gross_kurus=90_000,
    )

    getir_only = client.get(
        f"/entities/{restaurant_a.id}/invoices/drafts",
        params={
            "status": "posted",
            "invoice_kind": "delivery_commission",
            "delivery_platform_id": str(getir_id),
        },
    )
    assert getir_only.status_code == 200
    assert getir_only.json()["total"] == 1
    assert getir_only.json()["items"][0]["delivery_platform_id"] == str(getir_id)

    all_commission = client.get(
        f"/entities/{restaurant_a.id}/invoices/drafts",
        params={"status": "posted", "invoice_kind": "delivery_commission"},
    )
    assert all_commission.json()["total"] == 2


def test_get_posted_draft_has_journal_entry(client, restaurant_a, db_session) -> None:
    supplier_id = _supplier(db_session, restaurant_a.id)
    draft = _posted_supplier_draft(
        db_session, restaurant_a, supplier_id, invoice_date=date(2026, 4, 1)
    )

    detail = client.get(
        f"/entities/{restaurant_a.id}/invoices/drafts/{draft.id}",
    )
    assert detail.status_code == 200
    body = detail.json()
    assert body["status"] == "posted"
    assert body["journal_entry_id"] is not None

    reject = client.post(
        f"/entities/{restaurant_a.id}/invoices/drafts/{draft.id}/reject",
        json={"reason": "too late"},
    )
    assert reject.status_code == 409
