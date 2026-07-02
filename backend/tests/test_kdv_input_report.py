"""Per-rate input KDV report (Phase 7 Slice 5)."""

from __future__ import annotations

import uuid
from datetime import date

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from app.core.chart_of_accounts.default_chart import DELIVERY_COMMISSION_EXPENSE_CODE
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
from app.features.invoices import service as invoice_service
from app.features.reports import kdv_input
from app.features.reports.service import InvalidDateRangeError
from app.features.suppliers.models import Supplier
from tests.delivery_helpers import ACTOR_ID, delivery_setup as build_delivery_setup

POST_ACTOR_ID = uuid.UUID("00000000-0000-4000-8000-000000000001")


@pytest.fixture
def seeded_accounts(db_session, restaurant_a):
    seed_default_chart(db_session, restaurant_a.id)
    with entity_context(db_session, restaurant_a.id):
        accounts = list(db_session.scalars(select(Account)))
    return {account.code: account.id for account in accounts}


@pytest.fixture
def commission_setup(db_session, restaurant_a):
    setup = build_delivery_setup(db_session, restaurant_a.id, platform_names=("Getir",))
    with entity_context(db_session, restaurant_a.id):
        supplier = Supplier(name="Getir Platform", vkn="9876543210")
        db_session.add(supplier)
        db_session.commit()
        db_session.refresh(supplier)
        accounts = {a.code: a.id for a in db_session.scalars(select(Account))}
    setup["accounts"] = accounts
    setup["supplier_id"] = supplier.id
    setup["getir"] = setup["platforms"]["Getir"]
    return setup


def _supplier(db_session, entity) -> uuid.UUID:
    with entity_context(db_session, entity.id):
        supplier = Supplier(name="Metro Gida", vkn="1234567890")
        db_session.add(supplier)
        db_session.commit()
        db_session.refresh(supplier)
        return supplier.id


def _supplier_draft(
    db_session,
    entity_id: uuid.UUID,
    supplier_id: uuid.UUID,
    *,
    invoice_date: date,
    invoice_number: str,
    net_kurus: int,
    gross_kurus: int,
    vat_breakdown: list[dict],
    file_fingerprint: str,
    status: InvoiceDraftStatus = InvoiceDraftStatus.CONFIRMED,
) -> InvoiceDraft:
    with entity_context(db_session, entity_id):
        draft = InvoiceDraft(
            status=status,
            invoice_kind=InvoiceKind.SUPPLIER.value,
            source_type=InvoiceSourceType.EFATURA_XML,
            file_fingerprint=file_fingerprint,
            supplier_id=supplier_id,
            invoice_number=invoice_number,
            invoice_date=invoice_date,
            net_kurus=net_kurus,
            gross_kurus=gross_kurus,
            vat_breakdown=vat_breakdown,
            currency="TRY",
            extraction_payload={},
            confirmed_by=POST_ACTOR_ID if status == InvoiceDraftStatus.CONFIRMED else None,
        )
        db_session.add(draft)
        db_session.commit()
        db_session.refresh(draft)
        return draft


def _post_supplier_draft(
    db_session,
    entity_id: uuid.UUID,
    draft_id: uuid.UUID,
    expense_account_id: uuid.UUID,
) -> None:
    post_confirmed_draft(
        db_session,
        entity_id,
        draft_id,
        expense_account_id=expense_account_id,
        actor_id=POST_ACTOR_ID,
    )


def test_two_posted_supplier_invoices_per_rate_totals(
    db_session, restaurant_a, seeded_accounts
) -> None:
    supplier_id = _supplier(db_session, restaurant_a)
    expense_id = seeded_accounts["5200"]

    draft_20 = _supplier_draft(
        db_session,
        restaurant_a.id,
        supplier_id,
        invoice_date=date(2026, 1, 10),
        invoice_number="INV-20",
        net_kurus=1_000_000,
        gross_kurus=1_200_000,
        vat_breakdown=[
            {"rate_percent": 20, "base_kurus": 1_000_000, "vat_kurus": 200_000},
        ],
        file_fingerprint="kdv-20-fp",
    )
    _post_supplier_draft(db_session, restaurant_a.id, draft_20.id, expense_id)

    draft_10 = _supplier_draft(
        db_session,
        restaurant_a.id,
        supplier_id,
        invoice_date=date(2026, 1, 15),
        invoice_number="INV-10",
        net_kurus=500_000,
        gross_kurus=550_000,
        vat_breakdown=[
            {"rate_percent": 10, "base_kurus": 500_000, "vat_kurus": 50_000},
        ],
        file_fingerprint="kdv-10-fp",
    )
    _post_supplier_draft(db_session, restaurant_a.id, draft_10.id, expense_id)

    report = kdv_input.get_kdv_input_report(
        db_session, restaurant_a.id, date(2026, 1, 1), date(2026, 1, 31)
    )

    assert report.invoice_count == 2
    assert report.total_base_kurus == 1_500_000
    assert report.total_vat_kurus == 250_000
    by_rate = {row.rate_percent: row for row in report.rates}
    assert by_rate[10.0].base_kurus == 500_000
    assert by_rate[10.0].vat_kurus == 50_000
    assert by_rate[10.0].invoice_count == 1
    assert by_rate[20.0].base_kurus == 1_000_000
    assert by_rate[20.0].vat_kurus == 200_000
    assert by_rate[20.0].invoice_count == 1


def test_invoice_outside_date_range_excluded(
    db_session, restaurant_a, seeded_accounts
) -> None:
    supplier_id = _supplier(db_session, restaurant_a)
    expense_id = seeded_accounts["5200"]

    in_range = _supplier_draft(
        db_session,
        restaurant_a.id,
        supplier_id,
        invoice_date=date(2026, 1, 10),
        invoice_number="IN-RANGE",
        net_kurus=100_000,
        gross_kurus=120_000,
        vat_breakdown=[
            {"rate_percent": 20, "base_kurus": 100_000, "vat_kurus": 20_000},
        ],
        file_fingerprint="kdv-in-range",
    )
    _post_supplier_draft(db_session, restaurant_a.id, in_range.id, expense_id)

    out_of_range = _supplier_draft(
        db_session,
        restaurant_a.id,
        supplier_id,
        invoice_date=date(2026, 2, 5),
        invoice_number="OUT-RANGE",
        net_kurus=900_000,
        gross_kurus=1_080_000,
        vat_breakdown=[
            {"rate_percent": 20, "base_kurus": 900_000, "vat_kurus": 180_000},
        ],
        file_fingerprint="kdv-out-range",
    )
    _post_supplier_draft(db_session, restaurant_a.id, out_of_range.id, expense_id)

    report = kdv_input.get_kdv_input_report(
        db_session, restaurant_a.id, date(2026, 1, 1), date(2026, 1, 31)
    )

    assert report.invoice_count == 1
    assert report.total_base_kurus == 100_000
    assert report.total_vat_kurus == 20_000


def test_confirmed_unposted_draft_excluded(
    db_session, restaurant_a, seeded_accounts
) -> None:
    supplier_id = _supplier(db_session, restaurant_a)
    expense_id = seeded_accounts["5200"]

    posted = _supplier_draft(
        db_session,
        restaurant_a.id,
        supplier_id,
        invoice_date=date(2026, 1, 10),
        invoice_number="POSTED",
        net_kurus=100_000,
        gross_kurus=120_000,
        vat_breakdown=[
            {"rate_percent": 20, "base_kurus": 100_000, "vat_kurus": 20_000},
        ],
        file_fingerprint="kdv-posted-only",
    )
    _post_supplier_draft(db_session, restaurant_a.id, posted.id, expense_id)

    _supplier_draft(
        db_session,
        restaurant_a.id,
        supplier_id,
        invoice_date=date(2026, 1, 12),
        invoice_number="CONFIRMED-NOT-POSTED",
        net_kurus=500_000,
        gross_kurus=600_000,
        vat_breakdown=[
            {"rate_percent": 20, "base_kurus": 500_000, "vat_kurus": 100_000},
        ],
        file_fingerprint="kdv-confirmed-only",
        status=InvoiceDraftStatus.CONFIRMED,
    )

    report = kdv_input.get_kdv_input_report(
        db_session, restaurant_a.id, date(2026, 1, 1), date(2026, 1, 31)
    )

    assert report.invoice_count == 1
    assert report.total_vat_kurus == 20_000


def test_delivery_commission_posted_invoice_included(
    db_session, commission_setup
) -> None:
    from app.features.delivery.schema import DeliveryReportCreate, DeliveryReportPostRequest
    from app.features.delivery import service as delivery_service
    from tests.delivery_helpers import calendar_month_period

    entity_id = commission_setup["entity_id"]
    getir = commission_setup["getir"]
    supplier_id = commission_setup["supplier_id"]
    expense_id = commission_setup["accounts"][DELIVERY_COMMISSION_EXPENSE_CODE]

    period_start, period_end = calendar_month_period(2026, 4)
    created = delivery_service.create_delivery_report(
        db_session,
        entity_id,
        DeliveryReportCreate(
            delivery_platform_id=getir.id,
            period_start=period_start,
            period_end=period_end,
            gross_kurus=500_000,
            description="April platform sales",
            actor_id=ACTOR_ID,
        ),
    )
    delivery_service.post_delivery_report_intake(
        db_session,
        entity_id,
        created.id,
        DeliveryReportPostRequest(actor_id=ACTOR_ID),
    )

    with entity_context(db_session, entity_id):
        draft = InvoiceDraft(
            status=InvoiceDraftStatus.DRAFT,
            invoice_kind=InvoiceKind.DELIVERY_COMMISSION.value,
            source_type=InvoiceSourceType.EFATURA_XML,
            file_fingerprint="commission-kdv-fp",
            supplier_name="Getir Platform",
            supplier_vkn="9876543210",
            supplier_id=supplier_id,
            delivery_platform_id=getir.id,
            invoice_number="GETIR-COM-75",
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

    invoice_service.confirm_invoice_draft(
        db_session, entity_id, draft.id, actor_id=ACTOR_ID
    )
    post_delivery_commission_draft(
        db_session,
        entity_id,
        draft.id,
        expense_account_id=expense_id,
        actor_id=ACTOR_ID,
    )

    kdv_report = kdv_input.get_kdv_input_report(
        db_session, entity_id, date(2026, 4, 1), date(2026, 4, 30)
    )

    assert kdv_report.invoice_count == 1
    assert kdv_report.total_base_kurus == 62_500
    assert kdv_report.total_vat_kurus == 12_500
    assert len(kdv_report.rates) == 1
    assert kdv_report.rates[0].rate_percent == 20.0


def test_multi_rate_single_invoice_counts_once_per_rate(
    db_session, restaurant_a, seeded_accounts
) -> None:
    supplier_id = _supplier(db_session, restaurant_a)
    expense_id = seeded_accounts["5200"]

    draft = _supplier_draft(
        db_session,
        restaurant_a.id,
        supplier_id,
        invoice_date=date(2026, 3, 15),
        invoice_number="MULTI-VAT",
        net_kurus=15_000_000,
        gross_kurus=17_500_000,
        vat_breakdown=[
            {"rate_percent": 10, "base_kurus": 10_000_000, "vat_kurus": 1_000_000},
            {"rate_percent": 20, "base_kurus": 5_000_000, "vat_kurus": 1_500_000},
        ],
        file_fingerprint="kdv-multi-rate",
    )
    _post_supplier_draft(db_session, restaurant_a.id, draft.id, expense_id)

    report = kdv_input.get_kdv_input_report(
        db_session, restaurant_a.id, date(2026, 3, 1), date(2026, 3, 31)
    )

    assert report.invoice_count == 1
    assert report.total_base_kurus == 15_000_000
    assert report.total_vat_kurus == 2_500_000
    by_rate = {row.rate_percent: row for row in report.rates}
    assert by_rate[10.0].invoice_count == 1
    assert by_rate[20.0].invoice_count == 1


def test_from_after_to_rejected(db_session, restaurant_a, seeded_accounts) -> None:
    with pytest.raises(InvalidDateRangeError):
        kdv_input.get_kdv_input_report(
            db_session,
            restaurant_a.id,
            date(2026, 2, 1),
            date(2026, 1, 1),
        )


def test_kdv_input_report_api_e2e(
    client: TestClient, db_session, restaurant_a, seeded_accounts
) -> None:
    supplier_id = _supplier(db_session, restaurant_a)
    expense_id = seeded_accounts["5200"]
    draft = _supplier_draft(
        db_session,
        restaurant_a.id,
        supplier_id,
        invoice_date=date(2026, 5, 1),
        invoice_number="API-INV",
        net_kurus=200_000,
        gross_kurus=240_000,
        vat_breakdown=[
            {"rate_percent": 20, "base_kurus": 200_000, "vat_kurus": 40_000},
        ],
        file_fingerprint="kdv-api-fp",
    )
    _post_supplier_draft(db_session, restaurant_a.id, draft.id, expense_id)

    resp = client.get(
        f"/entities/{restaurant_a.id}/reports/kdv-input",
        params={"from": "2026-05-01", "to": "2026-05-31"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["entity_id"] == str(restaurant_a.id)
    assert body["from_date"] == "2026-05-01"
    assert body["to_date"] == "2026-05-31"
    assert body["invoice_count"] == 1
    assert body["total_base_kurus"] == 200_000
    assert body["total_vat_kurus"] == 40_000
    assert body["rates"][0]["rate_percent"] == 20.0

    bad_range = client.get(
        f"/entities/{restaurant_a.id}/reports/kdv-input",
        params={"from": "2026-05-31", "to": "2026-05-01"},
    )
    assert bad_range.status_code == 422

    missing_entity = uuid.uuid4()
    missing = client.get(
        f"/entities/{missing_entity}/reports/kdv-input",
        params={"from": "2026-05-01", "to": "2026-05-31"},
    )
    assert missing.status_code == 404


def test_cross_entity_isolation(
    db_session, restaurant_a, restaurant_b, seeded_accounts
) -> None:
    seed_default_chart(db_session, restaurant_b.id)
    supplier_id = _supplier(db_session, restaurant_a)
    expense_id = seeded_accounts["5200"]

    draft = _supplier_draft(
        db_session,
        restaurant_a.id,
        supplier_id,
        invoice_date=date(2026, 1, 10),
        invoice_number="ENTITY-A",
        net_kurus=100_000,
        gross_kurus=120_000,
        vat_breakdown=[
            {"rate_percent": 20, "base_kurus": 100_000, "vat_kurus": 20_000},
        ],
        file_fingerprint="kdv-entity-a",
    )
    _post_supplier_draft(db_session, restaurant_a.id, draft.id, expense_id)

    report_b = kdv_input.get_kdv_input_report(
        db_session,
        restaurant_b.id,
        date(2026, 1, 1),
        date(2026, 1, 31),
    )
    assert report_b.invoice_count == 0
    assert report_b.total_vat_kurus == 0

    report_a = kdv_input.get_kdv_input_report(
        db_session,
        restaurant_a.id,
        date(2026, 1, 1),
        date(2026, 1, 31),
    )
    assert report_a.invoice_count == 1
    assert report_a.total_vat_kurus == 20_000
