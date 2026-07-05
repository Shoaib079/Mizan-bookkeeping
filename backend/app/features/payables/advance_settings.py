"""Supplier advance confirmation entity settings (BSF-2)."""

from __future__ import annotations

import uuid

from sqlalchemy.orm import Session

from app.features.entities import service as entity_service

SUPPLIER_ADVANCE_CONFIRM_THRESHOLD_KEY = "supplier_advance_confirm_threshold_kurus"
DEFAULT_SUPPLIER_ADVANCE_CONFIRM_THRESHOLD_KURUS = 100_000  # ₺1,000


def get_supplier_advance_confirm_threshold_kurus(
    session: Session, entity_id: uuid.UUID
) -> int:
    setting = entity_service.get_entity_setting_by_key(
        session, entity_id, SUPPLIER_ADVANCE_CONFIRM_THRESHOLD_KEY
    )
    if setting is None or not setting.value.strip():
        return DEFAULT_SUPPLIER_ADVANCE_CONFIRM_THRESHOLD_KURUS
    try:
        value = int(setting.value.strip())
    except ValueError:
        return DEFAULT_SUPPLIER_ADVANCE_CONFIRM_THRESHOLD_KURUS
    return max(value, 0)
