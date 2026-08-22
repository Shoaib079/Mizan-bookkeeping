"""Group-sale discount posting — all sale types."""

from __future__ import annotations

import uuid
from datetime import date

from sqlalchemy.orm import Session

from app.core.receivables import posting as receivables_posting
from app.db.session import entity_context, require_entity_context
from app.features.entities import service as entity_service
from app.features.group_sales.discount_amounts import (
    GroupSaleDiscountError,
    resolve_group_sale_discount_amounts,
)
from app.features.group_sales.forex_only_discount import (
    post_forex_only_group_sale_discount_if_applicable,
)
from app.features.group_sales.fx_receivable import remaining_on_group_sale
from app.features.group_sales.errors import GroupSaleError
from app.features.group_sales.models import GroupSale, GroupSaleStatus


def _require_entity(session: Session, entity_id: uuid.UUID) -> None:
    if entity_service.get_entity(session, entity_id) is None:
        raise LookupError("Entity not found")


def post_group_sale_discount(
    session: Session,
    entity_id: uuid.UUID,
    group_sale_id: uuid.UUID,
    *,
    discount_kurus: int,
    discount_native: int | None = None,
    description: str | None = None,
    actor_id: uuid.UUID,
    discount_date: date | None = None,
) -> GroupSale:
    """Write off unpaid remainder — 5800 for TRY/rated FX; native-only for forex-only."""
    _require_entity(session, entity_id)
    with entity_context(session, entity_id):
        require_entity_context()
        group_sale = session.get(GroupSale, group_sale_id)
        if group_sale is None:
            raise LookupError("Group sale not found")
        if group_sale.status != GroupSaleStatus.POSTED.value:
            raise GroupSaleError(
                f"Cannot discount group sale in status {group_sale.status!r}"
            )
        if discount_kurus <= 0 and (discount_native is None or discount_native <= 0):
            raise GroupSaleError("discount must be positive")
        try:
            if post_forex_only_group_sale_discount_if_applicable(
                session,
                entity_id,
                group_sale,
                discount_kurus=discount_kurus,
                discount_native=discount_native,
                description=description,
                actor_id=actor_id,
                discount_date=discount_date,
            ):
                return session.get(GroupSale, group_sale_id)
        except ValueError as exc:
            raise GroupSaleError(str(exc)) from exc
        try:
            discount_kurus, discount_native = resolve_group_sale_discount_amounts(
                group_sale,
                discount_kurus=discount_kurus,
                discount_native=discount_native,
            )
        except GroupSaleDiscountError as exc:
            raise GroupSaleError(str(exc)) from exc
        remaining_kurus, remaining_native = remaining_on_group_sale(session, group_sale)
        if discount_kurus > remaining_kurus:
            raise GroupSaleError("discount exceeds remaining balance")
        if group_sale.forex_currency and discount_native is not None:
            if remaining_native is None or discount_native > remaining_native:
                raise GroupSaleError("discount exceeds remaining forex balance")
        customer_id = group_sale.customer_id
        forex_currency = group_sale.forex_currency
        sale_date = group_sale.sale_date

    receivables_posting.post_group_sale_discount(
        session,
        entity_id,
        customer_id,
        discount_date=discount_date or sale_date,
        discount_kurus=discount_kurus,
        description=(description or "Group sale discount").strip(),
        actor_id=actor_id,
        group_sale_id=group_sale_id,
        forex_currency=forex_currency,
        discount_native=discount_native,
    )

    with entity_context(session, entity_id):
        require_entity_context()
        return session.get(GroupSale, group_sale_id)
