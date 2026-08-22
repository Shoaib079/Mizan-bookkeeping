"""GS-FX group sale posting helpers — rateless forex receivable, no GL at sale."""

from __future__ import annotations

import uuid

from sqlalchemy.orm import Session

from app.core.receivables import forex_only_posting
from app.core.duplicate_guard import (
    ensure_not_duplicate,
    find_duplicate_credit_sale,
    find_duplicate_forex_only_group_sale,
)
from app.features.group_sales.calculations import ComputedGroupSale
from app.features.group_sales.models import GroupSale
from app.features.group_sales.schema import GROUP_SALE_REFERENCE, GroupSaleCreate


def is_forex_only_sale(computed: ComputedGroupSale) -> bool:
    return computed.forex_currency is not None and computed.total_kurus == 0


def ensure_group_sale_not_duplicate(
    session: Session,
    payload: GroupSaleCreate,
    computed: ComputedGroupSale,
    *,
    forex_only: bool,
) -> None:
    if forex_only:
        ensure_not_duplicate(
            find_duplicate_forex_only_group_sale(
                session,
                customer_id=payload.customer_id,
                sale_date=payload.sale_date,
                forex_currency=computed.forex_currency,
                total_forex_minor=computed.total_forex_minor or 0,
            ),
            acknowledged=payload.acknowledge_duplicate,
        )
        return
    ensure_not_duplicate(
        find_duplicate_credit_sale(
            session,
            customer_id=payload.customer_id,
            sale_date=payload.sale_date,
            amount_kurus=computed.total_kurus,
        ),
        acknowledged=payload.acknowledge_duplicate,
    )


def post_forex_only_group_sale_ledger(
    session: Session,
    entity_id: uuid.UUID,
    payload: GroupSaleCreate,
    group_sale: GroupSale,
    computed: ComputedGroupSale,
) -> uuid.UUID:
    """Subledger-only credit sale; returns customer_ledger_entry_id."""
    result = forex_only_posting.post_forex_only_credit_sale(
        session,
        entity_id,
        payload.customer_id,
        sale_date=payload.sale_date,
        description=payload.description.strip(),
        actor_id=payload.actor_id,
        forex_currency=computed.forex_currency,
        total_forex_minor=computed.total_forex_minor or 0,
        reference_type=GROUP_SALE_REFERENCE,
        reference_id=group_sale.id,
    )
    return result.customer_ledger_entry.id
