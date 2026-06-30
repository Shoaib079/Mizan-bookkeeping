"""Delivery sales report by platform (Phase 7 Slice 1)."""

from __future__ import annotations

from datetime import date

import pytest
from fastapi.testclient import TestClient

from app.core.chart_of_accounts.seed import seed_default_chart
from app.features.delivery import platform_service
from app.features.delivery.platform_schema import DeliveryPlatformUpdate
from app.features.delivery.schema import DeliveryReportCreate, DeliveryReportPostRequest
from app.features.delivery import service as delivery_service
from app.features.delivery.settings import DeliveryNotEnabledError
from app.features.reports import service as reports_service
from tests.delivery_helpers import ACTOR_ID, delivery_setup as build_delivery_setup


@pytest.fixture
def two_platform_setup(db_session, restaurant_a):
    setup = build_delivery_setup(
        db_session,
        restaurant_a.id,
        platform_names=("Getir", "Yemeksepeti"),
    )
    setup["getir"] = setup["platforms"]["Getir"]
    setup["yemeksepeti"] = setup["platforms"]["Yemeksepeti"]
    return setup


def _create_and_post(
    db_session,
    entity_id,
    platform_id,
    report_date: date,
    gross_kurus: int,
):
    created = delivery_service.create_delivery_report(
        db_session,
        entity_id,
        DeliveryReportCreate(
            delivery_platform_id=platform_id,
            period_year=report_date.year,
            period_month=report_date.month,
            gross_kurus=gross_kurus,
            description=f"Report {report_date}",
            actor_id=ACTOR_ID,
        ),
    )
    return delivery_service.post_delivery_report_intake(
        db_session,
        entity_id,
        created.id,
        DeliveryReportPostRequest(actor_id=ACTOR_ID),
    )


def test_two_platforms_posted_reports_in_range(db_session, two_platform_setup) -> None:
    entity_id = two_platform_setup["entity_id"]
    _create_and_post(
        db_session, entity_id, two_platform_setup["getir"].id, date(2026, 1, 5), 100_000
    )
    _create_and_post(
        db_session, entity_id, two_platform_setup["getir"].id, date(2026, 2, 20), 50_000
    )
    _create_and_post(
        db_session,
        entity_id,
        two_platform_setup["yemeksepeti"].id,
        date(2026, 1, 15),
        200_000,
    )

    report = reports_service.get_delivery_sales_report(
        db_session, entity_id, date(2026, 1, 1), date(2026, 1, 31)
    )

    assert report.total_gross_kurus == 300_000
    by_name = {row.platform_name: row for row in report.platforms}
    assert by_name["Getir"].gross_kurus == 100_000
    assert by_name["Getir"].report_count == 1
    assert by_name["Yemeksepeti"].gross_kurus == 200_000
    assert by_name["Yemeksepeti"].report_count == 1


def test_report_outside_date_range_excluded(db_session, two_platform_setup) -> None:
    entity_id = two_platform_setup["entity_id"]
    _create_and_post(
        db_session, entity_id, two_platform_setup["getir"].id, date(2026, 1, 10), 100_000
    )
    _create_and_post(
        db_session, entity_id, two_platform_setup["getir"].id, date(2026, 2, 5), 500_000
    )

    report = reports_service.get_delivery_sales_report(
        db_session, entity_id, date(2026, 1, 1), date(2026, 1, 31)
    )

    assert report.total_gross_kurus == 100_000
    getir = next(p for p in report.platforms if p.platform_name == "Getir")
    assert getir.gross_kurus == 100_000
    assert getir.report_count == 1


def test_non_posted_statuses_excluded(db_session, two_platform_setup) -> None:
    entity_id = two_platform_setup["entity_id"]
    getir_id = two_platform_setup["getir"].id

    _create_and_post(db_session, entity_id, getir_id, date(2026, 1, 10), 100_000)

    draft = delivery_service.create_delivery_report(
        db_session,
        entity_id,
        DeliveryReportCreate(
            delivery_platform_id=getir_id,
            period_year=2026,
            period_month=2,
            gross_kurus=200_000,
            description="Draft",
            actor_id=ACTOR_ID,
        ),
    )
    assert draft.status == "draft"

    rejected_created = delivery_service.create_delivery_report(
        db_session,
        entity_id,
        DeliveryReportCreate(
            delivery_platform_id=getir_id,
            period_year=2026,
            period_month=3,
            gross_kurus=400_000,
            description="To reject",
            actor_id=ACTOR_ID,
        ),
    )
    delivery_service.reject_delivery_report(
        db_session, entity_id, rejected_created.id, reason="bad data"
    )

    report = reports_service.get_delivery_sales_report(
        db_session, entity_id, date(2026, 1, 1), date(2026, 1, 31)
    )

    assert report.total_gross_kurus == 100_000
    getir = next(p for p in report.platforms if p.platform_name == "Getir")
    assert getir.gross_kurus == 100_000
    assert getir.report_count == 1


def test_inactive_platform_with_historical_posted_report(db_session, two_platform_setup) -> None:
    entity_id = two_platform_setup["entity_id"]
    getir = two_platform_setup["getir"]
    _create_and_post(db_session, entity_id, getir.id, date(2026, 1, 10), 75_000)

    platform_service.update_delivery_platform(
        db_session,
        entity_id,
        getir.id,
        DeliveryPlatformUpdate(is_active=False),
    )

    report = reports_service.get_delivery_sales_report(
        db_session, entity_id, date(2026, 1, 1), date(2026, 1, 31)
    )

    getir_row = next(p for p in report.platforms if p.platform_name == "Getir")
    assert getir_row.is_active is False
    assert getir_row.gross_kurus == 75_000
    assert getir_row.report_count == 1


def test_platform_with_no_reports_in_range_shows_zero(db_session, two_platform_setup) -> None:
    entity_id = two_platform_setup["entity_id"]
    _create_and_post(
        db_session,
        entity_id,
        two_platform_setup["getir"].id,
        date(2026, 1, 10),
        100_000,
    )

    report = reports_service.get_delivery_sales_report(
        db_session, entity_id, date(2026, 1, 1), date(2026, 1, 31)
    )

    yemek = next(p for p in report.platforms if p.platform_name == "Yemeksepeti")
    assert yemek.gross_kurus == 0
    assert yemek.report_count == 0
    assert len(report.platforms) == 2


def test_delivery_not_enabled_rejected(db_session, restaurant_a) -> None:
    seed_default_chart(db_session, restaurant_a.id)

    with pytest.raises(DeliveryNotEnabledError):
        reports_service.get_delivery_sales_report(
            db_session,
            restaurant_a.id,
            date(2026, 1, 1),
            date(2026, 1, 31),
        )


def test_from_after_to_rejected(db_session, two_platform_setup) -> None:
    entity_id = two_platform_setup["entity_id"]

    with pytest.raises(reports_service.InvalidDateRangeError):
        reports_service.get_delivery_sales_report(
            db_session,
            entity_id,
            date(2026, 2, 1),
            date(2026, 1, 1),
        )


def test_delivery_sales_report_api_e2e(
    client: TestClient, db_session, two_platform_setup
) -> None:
    entity_id = two_platform_setup["entity_id"]
    _create_and_post(
        db_session,
        entity_id,
        two_platform_setup["getir"].id,
        date(2026, 3, 1),
        120_000,
    )

    resp = client.get(
        f"/entities/{entity_id}/reports/delivery-sales",
        params={"from": "2026-03-01", "to": "2026-03-31"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["entity_id"] == str(entity_id)
    assert body["from_date"] == "2026-03-01"
    assert body["to_date"] == "2026-03-31"
    assert body["total_gross_kurus"] == 120_000
    getir = next(p for p in body["platforms"] if p["platform_name"] == "Getir")
    assert getir["gross_kurus"] == 120_000
    assert getir["report_count"] == 1

    disabled_resp = client.get(
        f"/entities/{entity_id}/reports/delivery-sales",
        params={"from": "2026-02-01", "to": "2026-01-01"},
    )
    assert disabled_resp.status_code == 422

    missing_resp = client.get(
        f"/entities/{entity_id}/reports/delivery-sales",
        params={"from": "2026-03-01"},
    )
    assert missing_resp.status_code == 422


def test_cross_entity_isolation(
    db_session, restaurant_a, restaurant_b, two_platform_setup
) -> None:
    entity_a = two_platform_setup["entity_id"]
    _create_and_post(
        db_session,
        entity_a,
        two_platform_setup["getir"].id,
        date(2026, 1, 10),
        100_000,
    )

    build_delivery_setup(db_session, restaurant_b.id, platform_names=("Getir",))

    report_b = reports_service.get_delivery_sales_report(
        db_session,
        restaurant_b.id,
        date(2026, 1, 1),
        date(2026, 1, 31),
    )
    assert report_b.total_gross_kurus == 0
    assert all(p.gross_kurus == 0 for p in report_b.platforms)

    report_a = reports_service.get_delivery_sales_report(
        db_session,
        entity_a,
        date(2026, 1, 1),
        date(2026, 1, 31),
    )
    assert report_a.total_gross_kurus == 100_000
