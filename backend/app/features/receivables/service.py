"""Receivables summary service (ARCHITECTURE.md)."""

from __future__ import annotations

import uuid

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.receivables.models import CustomerLedgerEntry
from app.db.session import entity_context, require_entity_context
from app.features.customers.models import Customer
from app.features.entities import service as entity_service


def list_receivables(
    session: Session, entity_id: uuid.UUID
) -> tuple[int, list[tuple[Customer, int]]]:
    if entity_service.get_entity(session, entity_id) is None:
        raise LookupError("Entity not found")

    with entity_context(session, entity_id):
        require_entity_context()
        rows = session.execute(
            select(
                Customer,
                func.coalesce(func.sum(CustomerLedgerEntry.amount_kurus), 0).label(
                    "balance_kurus"
                ),
            )
            .outerjoin(
                CustomerLedgerEntry,
                CustomerLedgerEntry.customer_id == Customer.id,
            )
            .where(Customer.is_active.is_(True))
            .group_by(Customer.id)
            .order_by(Customer.name)
        ).all()

        balances: list[tuple[Customer, int]] = []
        total = 0
        for customer, balance in rows:
            amount = int(balance or 0)
            if amount != 0:
                balances.append((customer, amount))
                total += amount

        return total, balances
