"""POS module entity settings helpers (Decisions §9, §13).

Per-restaurant configuration for card-tip handling via the card-terminal Z report:

- ``card_tips_z_report_enabled`` — whether this restaurant reconciles card tips
  using a card-terminal Z report (Z total = system card sale + card tips). When
  off, the daily summary posts gross card sales exactly as before (no tip leg).
- ``card_sale_basis`` — which figure to book as card revenue when a card tip
  exists for the day:
    * ``system``   — book the POS system card sale as revenue; the tip is a
                     pass-through (received via card clearing, paid to staff from
                     the drawer) and does NOT touch the P&L.
    * ``z_report`` — book the Z-report total as revenue and expense the tip to
                     5700 (tip paid to staff from the drawer).
    * ``ask``      — never auto-post a day that has a card tip; route it to
                     Needs Review so the owner decides system vs z_report per
                     entry (default — safest).
"""

from __future__ import annotations

import enum
import uuid

from sqlalchemy.orm import Session

from app.features.entities import service as entity_service

CARD_TIPS_Z_REPORT_ENABLED_KEY = "card_tips_z_report_enabled"
CARD_SALE_BASIS_KEY = "card_sale_basis"


class CardSaleBasis(str, enum.Enum):
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
    setting = entity_service.get_entity_setting_by_key(
        session, entity_id, CARD_SALE_BASIS_KEY
    )
    if setting is None:
        return DEFAULT_CARD_SALE_BASIS
    parsed = parse_card_sale_basis(setting.value)
    return parsed if parsed is not None else DEFAULT_CARD_SALE_BASIS
