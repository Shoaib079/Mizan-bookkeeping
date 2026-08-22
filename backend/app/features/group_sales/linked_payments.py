"""Net linked payments on a group sale — blocks void while live receipts exist."""

from __future__ import annotations

import uuid

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.receivables.models import CustomerLedgerEntry
from app.core.receivables.types import CustomerMovementType
from app.features.group_sales.schema import GROUP_SALE_REFERENCE


def has_linked_payments(session: Session, group_sale_id: uuid.UUID) -> bool:
    """True only if a live (net, un-reversed) payment is applied to this sale."""
    net_try = session.scalar(
        select(func.coalesce(func.sum(CustomerLedgerEntry.amount_kurus), 0)).where(
            CustomerLedgerEntry.reference_type == GROUP_SALE_REFERENCE,
            CustomerLedgerEntry.reference_id == group_sale_id,
            CustomerLedgerEntry.movement_type == CustomerMovementType.PAYMENT_RECEIVED,
        )
    )
    net_native = session.scalar(
        select(
            func.coalesce(func.sum(CustomerLedgerEntry.payment_native_quantity), 0)
        ).where(
            CustomerLedgerEntry.reference_type == GROUP_SALE_REFERENCE,
            CustomerLedgerEntry.reference_id == group_sale_id,
            CustomerLedgerEntry.movement_type == CustomerMovementType.PAYMENT_RECEIVED,
        )
    )
    return int(net_try or 0) != 0 or int(net_native or 0) != 0
