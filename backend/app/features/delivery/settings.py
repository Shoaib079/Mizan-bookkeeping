"""Delivery module entity settings helpers (Decisions §9)."""

from __future__ import annotations

import uuid

from sqlalchemy.orm import Session

from app.core.delivery.platforms import DeliveryPlatform, parse_platform
from app.features.entities import service as entity_service

DELIVERY_ENABLED_KEY = "delivery_enabled"
DELIVERY_PLATFORMS_KEY = "delivery_platforms"


class DeliveryNotEnabledError(ValueError):
    """Delivery module is not enabled for this entity."""


class DeliveryPlatformNotEnabledError(ValueError):
    """Platform is not enabled for this entity."""


def is_delivery_enabled(session: Session, entity_id: uuid.UUID) -> bool:
    setting = entity_service.get_entity_setting_by_key(
        session, entity_id, DELIVERY_ENABLED_KEY
    )
    return setting is not None and setting.value.lower() == "true"


def get_enabled_platforms(session: Session, entity_id: uuid.UUID) -> set[DeliveryPlatform]:
    setting = entity_service.get_entity_setting_by_key(
        session, entity_id, DELIVERY_PLATFORMS_KEY
    )
    if setting is None or not setting.value.strip():
        return set()
    platforms: set[DeliveryPlatform] = set()
    for part in setting.value.split(","):
        token = part.strip()
        if token:
            platforms.add(parse_platform(token))
    return platforms


def require_delivery_enabled(session: Session, entity_id: uuid.UUID) -> None:
    if not is_delivery_enabled(session, entity_id):
        raise DeliveryNotEnabledError("Delivery module is not enabled for this entity")


def require_platform_enabled(
    session: Session, entity_id: uuid.UUID, platform: DeliveryPlatform
) -> None:
    require_delivery_enabled(session, entity_id)
    enabled = get_enabled_platforms(session, entity_id)
    if platform not in enabled:
        raise DeliveryPlatformNotEnabledError(
            f"Platform {platform.value} is not enabled for this entity"
        )
