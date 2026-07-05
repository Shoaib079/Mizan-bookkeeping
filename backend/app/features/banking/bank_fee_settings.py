"""Bank fee auto-post entity settings (BSF-1)."""

from __future__ import annotations

import uuid

from sqlalchemy.orm import Session

from app.features.entities import service as entity_service

BANK_FEE_AUTO_POST_CEILING_KEY = "bank_fee_auto_post_ceiling_kurus"
DEFAULT_BANK_FEE_AUTO_POST_CEILING_KURUS = 50_000  # ₺500


def get_bank_fee_auto_post_ceiling_kurus(session: Session, entity_id: uuid.UUID) -> int:
    setting = entity_service.get_entity_setting_by_key(
        session, entity_id, BANK_FEE_AUTO_POST_CEILING_KEY
    )
    if setting is None or not setting.value.strip():
        return DEFAULT_BANK_FEE_AUTO_POST_CEILING_KURUS
    try:
        value = int(setting.value.strip())
    except ValueError:
        return DEFAULT_BANK_FEE_AUTO_POST_CEILING_KURUS
    return max(value, 0)
