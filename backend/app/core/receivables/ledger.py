"""Single write boundary for customer receivables ledger (ARCHITECTURE.md)."""

from __future__ import annotations

import uuid
from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.receivables.models import CustomerLedgerEntry
from app.core.receivables.types import (
    WRITABLE_MOVEMENT_TYPES,
    CustomerMovementType,
)
from app.db.session import entity_context, get_current_entity_id, require_entity_context
from app.features.customers.models import Customer
from app.features.entities import service as entity_service


class ReceivablesLedgerError(ValueError):
    """Base receivables ledger validation failure."""


class ZeroMovementError(ReceivablesLedgerError):
    """Movement amount must be non-zero."""


class DisallowedMovementTypeError(ReceivablesLedgerError):
    """Movement type not allowed in this slice."""


class OverpaymentError(ReceivablesLedgerError):
    """Payment would exceed amount owed by customer."""


def persist_customer_opening_entry(
    session: Session,
    customer_id: uuid.UUID,
    *,
    movement_date: date,
    amount_kurus: int,
    description: str,
    actor_id: uuid.UUID,
    journal_entry_id: uuid.UUID,
    reference_type: str,
    reference_id: uuid.UUID,
) -> CustomerLedgerEntry:
    """Persist opening balance receivables movement without commit — caller holds entity_context."""
    if amount_kurus <= 0:
        raise ZeroMovementError("Opening balance amount_kurus must be positive")

    customer = session.get(Customer, customer_id)
    if customer is None:
        raise LookupError("Customer not found")

    entry = CustomerLedgerEntry(
        customer_id=customer_id,
        movement_date=movement_date,
        movement_type=CustomerMovementType.OPENING_BALANCE,
        amount_kurus=amount_kurus,
        description=description,
        actor_id=actor_id,
        journal_entry_id=journal_entry_id,
        reference_type=reference_type,
        reference_id=reference_id,
    )
    session.add(entry)
    session.flush()
    session.refresh(entry)
    return entry


def persist_customer_ledger_entry(
    session: Session,
    customer_id: uuid.UUID,
    *,
    movement_date: date,
    movement_type: CustomerMovementType,
    amount_kurus: int,
    description: str,
    actor_id: uuid.UUID,
    journal_entry_id: uuid.UUID | None = None,
    reference_type: str | None = None,
    reference_id: uuid.UUID | None = None,
    pax: int | None = None,
    rate_per_person_kurus: int | None = None,
    forex_currency: str | None = None,
    rate_per_person_forex_minor: int | None = None,
    total_forex_minor: int | None = None,
    payment_native_quantity: int | None = None,
) -> CustomerLedgerEntry:
    """Persist one customer subledger row — caller must hold entity_context."""
    if amount_kurus == 0:
        raise ZeroMovementError("amount_kurus must be non-zero")

    customer = session.get(Customer, customer_id)
    if customer is None:
        raise LookupError("Customer not found")

    entry = CustomerLedgerEntry(
        customer_id=customer_id,
        movement_date=movement_date,
        movement_type=movement_type,
        amount_kurus=amount_kurus,
        description=description,
        actor_id=actor_id,
        journal_entry_id=journal_entry_id,
        reference_type=reference_type,
        reference_id=reference_id,
        pax=pax,
        rate_per_person_kurus=rate_per_person_kurus,
        forex_currency=forex_currency,
        rate_per_person_forex_minor=rate_per_person_forex_minor,
        total_forex_minor=total_forex_minor,
        payment_native_quantity=payment_native_quantity,
    )
    session.add(entry)
    session.flush()
    session.refresh(entry)
    return entry


def record_customer_movement(
    session: Session,
    entity_id: uuid.UUID,
    customer_id: uuid.UUID,
    *,
    movement_date: date,
    movement_type: CustomerMovementType,
    amount_kurus: int,
    description: str,
    actor_id: uuid.UUID,
    reference_type: str | None = None,
    reference_id: uuid.UUID | None = None,
) -> CustomerLedgerEntry:
    """Direct subledger write — posting functions should be preferred for GL events."""
    if entity_service.get_entity(session, entity_id) is None:
        raise LookupError("Entity not found")

    if amount_kurus == 0:
        raise ZeroMovementError("amount_kurus must be non-zero")

    if movement_type not in WRITABLE_MOVEMENT_TYPES:
        raise DisallowedMovementTypeError(
            f"movement type {movement_type.value!r} is not writable in this slice"
        )

    with entity_context(session, entity_id):
        customer = session.get(Customer, customer_id)
        if customer is None:
            raise LookupError("Customer not found")

        entry = CustomerLedgerEntry(
            customer_id=customer_id,
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


def _balance_kurus_in_context(session: Session, customer_id: uuid.UUID) -> int:
    from app.core.ledger.subledger_effective import effective_total_for_scalars

    require_entity_context()
    rows = session.scalars(
        select(CustomerLedgerEntry).where(
            CustomerLedgerEntry.customer_id == customer_id
        )
    )
    return effective_total_for_scalars(
        session,
        rows,
        amount=lambda row: row.amount_kurus,
        journal_entry_id=lambda row: row.journal_entry_id,
        description=lambda row: row.description,
    )


def current_balance_kurus(
    session: Session, entity_id: uuid.UUID, customer_id: uuid.UUID
) -> int:
    if entity_service.get_entity(session, entity_id) is None:
        raise LookupError("Entity not found")

    if get_current_entity_id() == entity_id:
        customer = session.get(Customer, customer_id)
        if customer is None:
            raise LookupError("Customer not found")
        return _balance_kurus_in_context(session, customer_id)

    with entity_context(session, entity_id):
        customer = session.get(Customer, customer_id)
        if customer is None:
            raise LookupError("Customer not found")
        return _balance_kurus_in_context(session, customer_id)


def entity_total_balance_kurus(session: Session, entity_id: uuid.UUID) -> int:
    """Sum customer subledger balances for control-account reconciliation."""
    if entity_service.get_entity(session, entity_id) is None:
        raise LookupError("Entity not found")

    with entity_context(session, entity_id):
        require_entity_context()
        from app.core.ledger.subledger_effective import effective_total_for_scalars

        rows = session.scalars(select(CustomerLedgerEntry))
        return effective_total_for_scalars(
            session,
            rows,
            amount=lambda row: row.amount_kurus,
            journal_entry_id=lambda row: row.journal_entry_id,
            description=lambda row: row.description,
        )


def list_ledger_entries(
    session: Session, entity_id: uuid.UUID, customer_id: uuid.UUID
) -> list[CustomerLedgerEntry]:
    if entity_service.get_entity(session, entity_id) is None:
        raise LookupError("Entity not found")

    with entity_context(session, entity_id):
        customer = session.get(Customer, customer_id)
        if customer is None:
            raise LookupError("Customer not found")

        require_entity_context()
        return list(
            session.scalars(
                select(CustomerLedgerEntry)
                .where(CustomerLedgerEntry.customer_id == customer_id)
                .order_by(
                    CustomerLedgerEntry.movement_date,
                    CustomerLedgerEntry.created_at,
                )
            )
        )
