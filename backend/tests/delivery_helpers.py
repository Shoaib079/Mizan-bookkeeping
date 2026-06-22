"""Shared helpers for delivery platform tests."""

from __future__ import annotations

import uuid

from app.core.chart_of_accounts.seed import seed_default_chart
from app.features.banking import service as banking_service
from app.features.banking.models import MoneyAccountKind
from app.features.banking.schema import MoneyAccountCreate
from app.features.delivery import platform_service
from app.features.delivery.platform_schema import DeliveryPlatformCreate
from app.features.delivery.settings import DELIVERY_ENABLED_KEY
from app.features.entities import service as entity_service
from app.features.entities.schema import EntitySettingCreate

ACTOR_ID = uuid.UUID("00000000-0000-4000-8000-000000000001")


def enable_delivery(db_session, entity_id: uuid.UUID) -> None:
    entity_service.create_entity_setting(
        db_session,
        entity_id,
        EntitySettingCreate(key=DELIVERY_ENABLED_KEY, value="true"),
    )


def create_platform(db_session, entity_id: uuid.UUID, name: str):
    return platform_service.create_delivery_platform(
        db_session,
        entity_id,
        DeliveryPlatformCreate(name=name),
    )


def bank_account(db_session, entity_id: uuid.UUID):
    return banking_service.create_money_account(
        db_session,
        entity_id,
        MoneyAccountCreate(
            account_kind=MoneyAccountKind.BANK,
            name="Garanti TRY",
            bank_name="Garanti BBVA",
        ),
    )


def delivery_setup(
    db_session,
    entity_id: uuid.UUID,
    *,
    platform_names: tuple[str, ...] = ("Getir", "Yemeksepeti", "Trendyol"),
):
    seed_default_chart(db_session, entity_id)
    enable_delivery(db_session, entity_id)
    bank = bank_account(db_session, entity_id)
    platforms = {
        name: create_platform(db_session, entity_id, name) for name in platform_names
    }
    return {
        "entity_id": entity_id,
        "bank": bank,
        "platforms": platforms,
    }
