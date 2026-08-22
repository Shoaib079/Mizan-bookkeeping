"""Group sale read models — remaining balances and linked discounts."""

from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.ledger.subledger_display import (
    SubledgerDisplayKind,
    subledger_display_for_row,
)
from app.core.receivables.models import CustomerLedgerEntry
from app.core.receivables.types import CustomerMovementType
from app.features.group_sales.fx_receivable import (
    native_balance_for_currency,
    remaining_on_group_sale,
)
from app.features.group_sales.models import GroupSale
from app.features.group_sales.schema import (
    GROUP_SALE_REFERENCE,
    GroupSaleDiscountRead,
    GroupSaleRead,
)


def to_group_sale_read(session: Session, group_sale: GroupSale) -> GroupSaleRead:
    remaining_kurus, remaining_native = remaining_on_group_sale(session, group_sale)
    discount_rows = session.scalars(
        select(CustomerLedgerEntry)
        .where(
            CustomerLedgerEntry.reference_type == GROUP_SALE_REFERENCE,
            CustomerLedgerEntry.reference_id == group_sale.id,
            CustomerLedgerEntry.movement_type == CustomerMovementType.DISCOUNT,
        )
        .order_by(CustomerLedgerEntry.movement_date, CustomerLedgerEntry.created_at)
    ).all()
    reversal_descriptions = {
        row.description
        for row in discount_rows
        if row.description.startswith("Reversal:")
    }
    discounts: list[GroupSaleDiscountRead] = []
    for row in discount_rows:
        if row.total_forex_minor is None or row.total_forex_minor >= 0:
            continue
        kind, _ = subledger_display_for_row(
            session,
            journal_entry_id=row.journal_entry_id,
            description=row.description,
        )
        if kind != SubledgerDisplayKind.EFFECTIVE:
            continue
        if f"Reversal: {row.description}" in reversal_descriptions:
            continue
        discounts.append(
            GroupSaleDiscountRead(
                customer_ledger_entry_id=row.id,
                discount_native_minor=abs(row.total_forex_minor),
                description=row.description,
                movement_date=row.movement_date,
            )
        )
    data = GroupSaleRead.model_validate(group_sale)
    return data.model_copy(
        update={
            "remaining_kurus": remaining_kurus,
            "remaining_forex_minor": remaining_native,
            "discounts": discounts,
        }
    )


def customer_forex_balance(
    session: Session, entity_id: uuid.UUID, customer_id: uuid.UUID, currency: str
) -> int:
    from app.db.session import entity_context
    from app.features.entities import service as entity_service

    if entity_service.get_entity(session, entity_id) is None:
        raise LookupError("Entity not found")
    with entity_context(session, entity_id):
        return native_balance_for_currency(session, customer_id, currency)
