"""Payables read orchestration — writes delegate to core/payables (ARCHITECTURE.md)."""

from __future__ import annotations

import uuid

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.payables import ledger as payables_ledger
from app.core.payables import posting as payables_posting
from app.core.ledger.posting import InvalidAccountError, PostingError
from app.core.payables.models import SupplierLedgerEntry
from app.core.payables.types import SupplierMovementType
from app.db.session import entity_context, require_entity_context
from app.features.entities import service as entity_service
from app.features.suppliers.models import Supplier


def list_payables(session: Session, entity_id: uuid.UUID) -> tuple[int, list[tuple[Supplier, int]]]:
    """Return (total_payables_kurus, [(supplier, balance_kurus), ...]) for active suppliers."""
    if entity_service.get_entity(session, entity_id) is None:
        raise LookupError("Entity not found")

    with entity_context(session, entity_id):
        require_entity_context()
        balances = session.execute(
            select(
                Supplier,
                func.coalesce(func.sum(SupplierLedgerEntry.amount_kurus), 0).label("balance"),
            )
            .outerjoin(
                SupplierLedgerEntry,
                SupplierLedgerEntry.supplier_id == Supplier.id,
            )
            .where(Supplier.is_active.is_(True))
            .group_by(Supplier.id)
            .order_by(Supplier.name)
        ).all()

        rows: list[tuple[Supplier, int]] = [(supplier, int(balance)) for supplier, balance in balances]
        total = sum(balance for _, balance in rows)
        return total, rows


def get_supplier_ledger(
    session: Session, entity_id: uuid.UUID, supplier_id: uuid.UUID
) -> tuple[int, list]:
    balance = payables_ledger.current_balance_kurus(session, entity_id, supplier_id)
    entries = payables_ledger.list_ledger_entries(session, entity_id, supplier_id)
    return balance, entries


def record_movement(
    session: Session,
    entity_id: uuid.UUID,
    supplier_id: uuid.UUID,
    *,
    movement_date,
    movement_type: SupplierMovementType,
    amount_kurus: int,
    description: str,
    actor_id: uuid.UUID,
):
    return payables_ledger.record_supplier_movement(
        session,
        entity_id,
        supplier_id,
        movement_date=movement_date,
        movement_type=movement_type,
        amount_kurus=amount_kurus,
        description=description,
        actor_id=actor_id,
    )


def record_payment(
    session: Session,
    entity_id: uuid.UUID,
    supplier_id: uuid.UUID,
    *,
    payment_date,
    amount_kurus: int,
    description: str,
    actor_id: uuid.UUID,
    payment_account_id: uuid.UUID,
    reference: str | None = None,
):
    return payables_posting.post_supplier_payment(
        session,
        entity_id,
        supplier_id,
        payment_date=payment_date,
        amount_kurus=amount_kurus,
        description=description,
        actor_id=actor_id,
        payment_account_id=payment_account_id,
        reference_type=reference,
    )
