"""Delivery module entity settings helpers (Decisions §9)."""

from __future__ import annotations

import uuid

from sqlalchemy.orm import Session

from app.features.entities import service as entity_service

DELIVERY_ENABLED_KEY = "delivery_enabled"


class DeliveryNotEnabledError(ValueError):
    """Delivery module is not enabled for this entity."""


def is_delivery_enabled(session: Session, entity_id: uuid.UUID) -> bool:
    setting = entity_service.get_entity_setting_by_key(
        session, entity_id, DELIVERY_ENABLED_KEY
    )
    return setting is not None and setting.value.lower() == "true"


def require_delivery_enabled(session: Session, entity_id: uuid.UUID) -> None:
    if not is_delivery_enabled(session, entity_id):
        raise DeliveryNotEnabledError("Delivery module is not enabled for this entity")
