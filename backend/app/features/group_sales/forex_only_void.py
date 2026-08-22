"""GS-FX — void/correct forex-only group sales (subledger only, no GL)."""

from __future__ import annotations

import uuid
from collections.abc import Callable
from datetime import date

from sqlalchemy.orm import Session

from app.core.receivables.models import CustomerLedgerEntry
from app.features.group_sales.models import GroupSale


def append_forex_only_customer_reversal(
    session: Session,
    original: CustomerLedgerEntry,
    *,
    actor_id: uuid.UUID,
    void_date: date | None,
) -> CustomerLedgerEntry:
    """Reverse a forex-only subledger row — no GL journal exists."""
    reversal_date = void_date or original.movement_date
    entry = CustomerLedgerEntry(
        customer_id=original.customer_id,
        movement_date=reversal_date,
        movement_type=original.movement_type,
        amount_kurus=0,
        description=f"Reversal: {original.description}",
        actor_id=actor_id,
        journal_entry_id=None,
        reference_type=original.reference_type,
        reference_id=original.reference_id,
        forex_currency=original.forex_currency,
        total_forex_minor=(
            -original.total_forex_minor if original.total_forex_minor else None
        ),
        payment_native_quantity=(
            -original.payment_native_quantity
            if original.payment_native_quantity
            else None
        ),
    )
    session.add(entry)
    session.flush()
    session.refresh(entry)
    return entry


def reverse_forex_only_group_sale(
    session: Session,
    group_sale: GroupSale,
    *,
    has_linked_payments: Callable[[Session, uuid.UUID], bool],
    actor_id: uuid.UUID,
    final_status: str,
    void_date: date | None = None,
) -> None:
    from app.features.group_sales.service import GroupSaleError, GroupSaleHasPaymentsError

    if has_linked_payments(session, group_sale.id):
        raise GroupSaleHasPaymentsError(
            "Cannot void — void or settle the linked payment first"
        )
    if group_sale.customer_ledger_entry_id is None:
        raise GroupSaleError("Group sale missing customer ledger link")

    customer_row = session.get(CustomerLedgerEntry, group_sale.customer_ledger_entry_id)
    if customer_row is None:
        raise LookupError("Customer ledger entry not found")

    append_forex_only_customer_reversal(
        session,
        customer_row,
        actor_id=actor_id,
        void_date=void_date,
    )
    group_sale.status = final_status
    session.flush()
