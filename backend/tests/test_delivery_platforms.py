"""User-managed delivery platforms (Decisions §9)."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from sqlalchemy import select

from app.core.chart_of_accounts.default_chart import DELIVERY_CLEARING_PARENT_CODE
from app.core.chart_of_accounts.models import Account
from app.core.chart_of_accounts.seed import seed_default_chart
from app.db.session import entity_context
from app.features.delivery import platform_service
from app.features.delivery.platform_schema import DeliveryPlatformCreate, DeliveryPlatformUpdate
from app.features.delivery.platform_service import (
    DuplicateDeliveryPlatformError,
    InactiveDeliveryPlatformError,
)
from app.features.delivery.settings import DeliveryNotEnabledError
from tests.delivery_helpers import ACTOR_ID, delivery_setup as build_delivery_setup, enable_delivery


def test_create_platform_allocates_clearing_sub_account(db_session, restaurant_a) -> None:
    seed_default_chart(db_session, restaurant_a.id)
    enable_delivery(db_session, restaurant_a.id)

    platform = platform_service.create_delivery_platform(
        db_session,
        restaurant_a.id,
        DeliveryPlatformCreate(name="Getir"),
    )

    with entity_context(db_session, restaurant_a.id):
        parent = db_session.scalar(
            select(Account).where(Account.code == DELIVERY_CLEARING_PARENT_CODE)
        )
        gl = db_session.get(Account, platform.gl_account_id)
    assert parent is not None
    assert gl is not None
    assert gl.parent_account_id == parent.id
    assert gl.code.startswith("145")
    assert platform.name == "Getir"


def test_rename_and_deactivate_platform(db_session, restaurant_a) -> None:
    setup = build_delivery_setup(db_session, restaurant_a.id, platform_names=("Getir",))
    platform_id = setup["platforms"]["Getir"].id

    updated = platform_service.update_delivery_platform(
        db_session,
        restaurant_a.id,
        platform_id,
        DeliveryPlatformUpdate(name="Getir Yemek"),
    )
    assert updated.name == "Getir Yemek"

    deactivated = platform_service.update_delivery_platform(
        db_session,
        restaurant_a.id,
        platform_id,
        DeliveryPlatformUpdate(is_active=False),
    )
    assert deactivated.is_active is False

    from app.features.delivery.schema import DeliveryReportCreate
    from app.features.delivery import service as delivery_service
    from datetime import date

    with pytest.raises(InactiveDeliveryPlatformError):
        delivery_service.create_delivery_report(
            db_session,
            restaurant_a.id,
            DeliveryReportCreate(
                delivery_platform_id=platform_id,
                period_year=2026,
                period_month=4,
                gross_kurus=100_000,
                description="Blocked",
                actor_id=ACTOR_ID,
            ),
        )


def test_duplicate_platform_name_rejected(db_session, restaurant_a) -> None:
    setup = build_delivery_setup(db_session, restaurant_a.id, platform_names=("Getir",))

    with pytest.raises(DuplicateDeliveryPlatformError):
        platform_service.create_delivery_platform(
            db_session,
            restaurant_a.id,
            DeliveryPlatformCreate(name="Getir"),
        )


def test_platforms_api_e2e(client: TestClient, db_session, restaurant_a) -> None:
    seed_default_chart(db_session, restaurant_a.id)
    enable_delivery(db_session, restaurant_a.id)
    entity_id = restaurant_a.id

    create_resp = client.post(
        f"/entities/{entity_id}/delivery/platforms",
        json={"name": "Trendyol Go"},
    )
    assert create_resp.status_code == 201
    body = create_resp.json()
    assert body["name"] == "Trendyol Go"
    assert body["gl_account_code"].startswith("145")

    list_resp = client.get(f"/entities/{entity_id}/delivery/platforms")
    assert list_resp.status_code == 200
    assert list_resp.json()["total"] == 1

    patch_resp = client.patch(
        f"/entities/{entity_id}/delivery/platforms/{body['id']}",
        json={"name": "Trendyol"},
    )
    assert patch_resp.status_code == 200
    assert patch_resp.json()["name"] == "Trendyol"


def test_platform_create_requires_delivery_enabled(db_session, restaurant_a) -> None:
    seed_default_chart(db_session, restaurant_a.id)

    with pytest.raises(DeliveryNotEnabledError):
        platform_service.create_delivery_platform(
            db_session,
            restaurant_a.id,
            DeliveryPlatformCreate(name="Getir"),
        )
