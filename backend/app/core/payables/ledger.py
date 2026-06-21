"""Single write boundary for supplier payables ledger (ARCHITECTURE.md)."""

from __future__ import annotations

import uuid
from datetime import date

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.payables.models import SupplierLedgerEntry
from app.core.payables.types import (
    WRITABLE_MOVEMENT_TYPES,
    SupplierMovementType,
)
from app.db.session import entity_context, require_entity_context
from app.features.entities import service as entity_service
from app.features.suppliers.models import Supplier


class PayablesLedgerError(ValueError):
    """Base payables ledger validation failure."""


class ZeroMovementError(PayablesLedgerError):
    """Movement amount must be non-zero."""


class DisallowedMovementTypeError(PayablesLedgerError):
    """Movement type not allowed in this slice."""


class OverpaymentError(PayablesLedgerError):
    """Payment would exceed current payable balance."""


def record_supplier_movement(
    session: Session,
    entity_id: uuid.UUID,
    supplier_id: uuid.UUID,
    *,
    movement_date: date,
    movement_type: SupplierMovementType,
    amount_kurus: int,
    description: str,
    actor_id: uuid.UUID,
    reference_type: str | None = None,
    reference_id: uuid.UUID | None = None,
) -> SupplierLedgerEntry:
    """The only way to write supplier payables ledger rows."""
    if entity_service.get_entity(session, entity_id) is None:
        raise LookupError("Entity not found")

    if amount_kurus == 0:
        raise ZeroMovementError("amount_kurus must be non-zero")

    if movement_type not in WRITABLE_MOVEMENT_TYPES:
        raise DisallowedMovementTypeError(
            f"movement type {movement_type.value!r} is not writable in this slice"
        )

    with entity_context(session, entity_id):
        supplier = session.get(Supplier, supplier_id)
        if supplier is None:
            raise LookupError("Supplier not found")

        entry = SupplierLedgerEntry(
            supplier_id=supplier_id,
            movement_date=movement_date,
            movement_type=movement_type,
            amount_kurus=amount_kurus,
            description=description,
            actor_id=actor_id,
            reference_type=reference_type,
            reference_id=reference_id,
        )
        session.add(entry)
        session.commit()
        session.refresh(entry)
        return entry


def current_balance_kurus(
    session: Session, entity_id: uuid.UUID, supplier_id: uuid.UUID
) -> int:
    if entity_service.get_entity(session, entity_id) is None:
        raise LookupError("Entity not found")

    with entity_context(session, entity_id):
        supplier = session.get(Supplier, supplier_id)
        if supplier is None:
            raise LookupError("Supplier not found")

        total = session.scalar(
            select(func.coalesce(func.sum(SupplierLedgerEntry.amount_kurus), 0)).where(
                SupplierLedgerEntry.supplier_id == supplier_id
            )
        )
        return int(total or 0)


def record_supplier_payment(
    session: Session,
    entity_id: uuid.UUID,
    supplier_id: uuid.UUID,
    *,
    payment_date: date,
    amount_kurus: int,
    description: str,
    actor_id: uuid.UUID,
    reference_type: str | None = None,
    reference_id: uuid.UUID | None = None,
) -> SupplierLedgerEntry:
    """Record a supplier payment — positive API amount stored as negative movement."""
    if amount_kurus <= 0:
        raise ZeroMovementError("Payment amount_kurus must be positive")

    current = current_balance_kurus(session, entity_id, supplier_id)
    if current - amount_kurus < 0:
        raise OverpaymentError(
            f"Payment of {amount_kurus} kuruş exceeds payable balance of {current} kuruş"
        )

    if entity_service.get_entity(session, entity_id) is None:
        raise LookupError("Entity not found")

    with entity_context(session, entity_id):
        supplier = session.get(Supplier, supplier_id)
        if supplier is None:
            raise LookupError("Supplier not found")

        entry = SupplierLedgerEntry(
            supplier_id=supplier_id,
            movement_date=payment_date,
            movement_type=SupplierMovementType.PAYMENT,
            amount_kurus=-amount_kurus,
            description=description,
            actor_id=actor_id,
            reference_type=reference_type,
            reference_id=reference_id,
        )
        session.add(entry)
        session.commit()
        session.refresh(entry)
        return entry


def list_ledger_entries(
    session: Session, entity_id: uuid.UUID, supplier_id: uuid.UUID
) -> list[SupplierLedgerEntry]:
    if entity_service.get_entity(session, entity_id) is None:
        raise LookupError("Entity not found")

    with entity_context(session, entity_id):
        supplier = session.get(Supplier, supplier_id)
        if supplier is None:
            raise LookupError("Supplier not found")

        require_entity_context()
        return list(
            session.scalars(
                select(SupplierLedgerEntry)
                .where(SupplierLedgerEntry.supplier_id == supplier_id)
                .order_by(
                    SupplierLedgerEntry.movement_date,
                    SupplierLedgerEntry.created_at,
                )
            )
        )
