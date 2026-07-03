"""Invoice intake entity settings."""

from __future__ import annotations

import uuid

from sqlalchemy.orm import Session

from app.features.entities import service as entity_service

INVOICE_SUPPLIER_AUTO_POST_KEY = "invoice_supplier_auto_post"


def is_invoice_supplier_auto_post_enabled(session: Session, entity_id: uuid.UUID) -> bool:
    setting = entity_service.get_entity_setting_by_key(
        session, entity_id, INVOICE_SUPPLIER_AUTO_POST_KEY
    )
    return setting is not None and setting.value.strip().lower() == "true"
