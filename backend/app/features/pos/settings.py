"""POS module entity settings helpers (Decisions §9, §13).

Per-restaurant configuration for card-terminal Z-report reconciliation:

- ``card_tips_z_report_enabled`` — when on, the owner enters the card-terminal
  **Z report** total with the POS daily summary. The app compares **Z to the
  system card sale**; match → post as entered, mismatch → Needs Review. Tips
  are **not** derived or posted at POS — they belong on the expense list only.

``card_sale_basis`` is **deprecated** (ignored by the app). Existing stored
values are left in place for audit; new installs should not set it.
"""

from __future__ import annotations

import enum
import uuid

from sqlalchemy.orm import Session

from app.features.entities import service as entity_service

CARD_TIPS_Z_REPORT_ENABLED_KEY = "card_tips_z_report_enabled"
CARD_SALE_BASIS_KEY = "card_sale_basis"


class CardSaleBasis(str, enum.Enum):
    """Deprecated — retained for parsing legacy entity settings only."""

    SYSTEM = "system"
    Z_REPORT = "z_report"
    ASK = "ask"


DEFAULT_CARD_SALE_BASIS = CardSaleBasis.ASK


class InvalidCardSaleBasisError(ValueError):
    """Provided card_sale_basis value is not one of system|z_report|ask."""


def parse_card_sale_basis(value: str | None) -> CardSaleBasis | None:
    if value is None:
        return None
    try:
        return CardSaleBasis(value.strip().lower())
    except ValueError as exc:
        raise InvalidCardSaleBasisError(
            f"card_sale_basis must be one of {[b.value for b in CardSaleBasis]}"
        ) from exc


def is_card_tips_z_report_enabled(session: Session, entity_id: uuid.UUID) -> bool:
    setting = entity_service.get_entity_setting_by_key(
        session, entity_id, CARD_TIPS_Z_REPORT_ENABLED_KEY
    )
    return setting is not None and setting.value.strip().lower() == "true"


def get_card_sale_basis(session: Session, entity_id: uuid.UUID) -> CardSaleBasis:
    """Deprecated — no longer used for POS posting."""
    setting = entity_service.get_entity_setting_by_key(
        session, entity_id, CARD_SALE_BASIS_KEY
    )
    if setting is None:
        return DEFAULT_CARD_SALE_BASIS
    parsed = parse_card_sale_basis(setting.value)
    return parsed if parsed is not None else DEFAULT_CARD_SALE_BASIS
