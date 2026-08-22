"""GS-FX — forex-native discount on rateless group sales (subledger only)."""

from __future__ import annotations

import uuid
from datetime import date

from sqlalchemy.orm import Session

from app.core.receivables import forex_only_posting
from app.features.group_sales.fx_receivable import remaining_on_group_sale
from app.features.group_sales.models import GroupSale


def is_forex_only_group_sale(group_sale: GroupSale) -> bool:
    return group_sale.total_kurus == 0 and group_sale.forex_currency is not None


def post_forex_only_group_sale_discount(
    session: Session,
    entity_id: uuid.UUID,
    group_sale: GroupSale,
    *,
    discount_native: int,
    description: str,
    actor_id: uuid.UUID,
    discount_date: date | None = None,
) -> None:
    if discount_native <= 0:
        raise ValueError("discount must be positive")
    if group_sale.forex_currency is None:
        raise ValueError("group sale has no forex currency")

    _remaining_kurus, remaining_native = remaining_on_group_sale(session, group_sale)
    if remaining_native is None or discount_native > remaining_native:
        raise ValueError("discount exceeds remaining forex balance")

    forex_only_posting.post_forex_only_group_sale_discount(
        session,
        entity_id,
        group_sale.customer_id,
        discount_date=discount_date or group_sale.sale_date,
        description=description,
        actor_id=actor_id,
        forex_currency=group_sale.forex_currency,
        discount_native=discount_native,
        group_sale_id=group_sale.id,
    )


def post_forex_only_group_sale_discount_if_applicable(
    session: Session,
    entity_id: uuid.UUID,
    group_sale: GroupSale,
    *,
    discount_kurus: int,
    discount_native: int | None,
    description: str | None,
    actor_id: uuid.UUID,
    discount_date: date | None,
) -> bool:
    """Forex-only discount path — returns True when handled."""
    if not is_forex_only_group_sale(group_sale):
        return False
    if discount_kurus != 0:
        raise ValueError("discount_kurus must not be set on forex-only group sales")
    if discount_native is None:
        raise ValueError("discount_native is required for forex-only sales")
    post_forex_only_group_sale_discount(
        session,
        entity_id,
        group_sale,
        discount_native=discount_native,
        description=(description or "Group sale discount").strip(),
        actor_id=actor_id,
        discount_date=discount_date,
    )
    return True
