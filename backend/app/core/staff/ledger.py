"""Single write boundary for staff ledger (ARCHITECTURE.md)."""

from __future__ import annotations

import uuid
from datetime import date

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.staff.models import StaffLedgerEntry
from app.core.staff.types import (
    WRITABLE_MOVEMENT_TYPES,
    StaffMovementType,
)
from app.db.session import entity_context, get_current_entity_id, require_entity_context
from app.features.entities import service as entity_service
from app.features.staff.models import Employee


class StaffLedgerError(ValueError):
    """Base staff ledger validation failure."""


class ZeroMovementError(StaffLedgerError):
    """Movement amount must be non-zero."""


class DisallowedMovementTypeError(StaffLedgerError):
    """Movement type not allowed in this slice."""


class OverpaymentError(StaffLedgerError):
    """Payment would exceed current staff balance."""


def persist_staff_ledger_entry(
    session: Session,
    employee_id: uuid.UUID,
    *,
    movement_date: date,
    movement_type: StaffMovementType,
    amount_minor: int,
    description: str,
    actor_id: uuid.UUID,
    journal_entry_id: uuid.UUID | None = None,
    try_cost_kurus: int | None = None,
    reference_type: str | None = None,
    reference_id: uuid.UUID | None = None,
) -> StaffLedgerEntry:
    """Persist one staff subledger row — caller must hold entity_context."""
    if amount_minor == 0:
        raise ZeroMovementError("amount_minor must be non-zero")

    employee = session.get(Employee, employee_id)
    if employee is None:
        raise LookupError("Employee not found")

    entry = StaffLedgerEntry(
        employee_id=employee_id,
        movement_date=movement_date,
        movement_type=movement_type,
        amount_minor=amount_minor,
        try_cost_kurus=try_cost_kurus,
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


def record_staff_movement(
    session: Session,
    entity_id: uuid.UUID,
    employee_id: uuid.UUID,
    *,
    movement_date: date,
    movement_type: StaffMovementType,
    amount_minor: int,
    description: str,
    actor_id: uuid.UUID,
    try_cost_kurus: int | None = None,
    reference_type: str | None = None,
    reference_id: uuid.UUID | None = None,
) -> StaffLedgerEntry:
    """Direct subledger write — posting functions should be preferred for GL events."""
    if entity_service.get_entity(session, entity_id) is None:
        raise LookupError("Entity not found")

    if amount_minor == 0:
        raise ZeroMovementError("amount_minor must be non-zero")

    if movement_type not in WRITABLE_MOVEMENT_TYPES:
        raise DisallowedMovementTypeError(
            f"movement type {movement_type.value!r} is not writable in this slice"
        )

    with entity_context(session, entity_id):
        employee = session.get(Employee, employee_id)
        if employee is None:
            raise LookupError("Employee not found")

        entry = StaffLedgerEntry(
            employee_id=employee_id,
            movement_date=movement_date,
            movement_type=movement_type,
            amount_minor=amount_minor,
            try_cost_kurus=try_cost_kurus,
            description=description,
            actor_id=actor_id,
            reference_type=reference_type,
            reference_id=reference_id,
        )
        session.add(entry)
        session.commit()
        session.refresh(entry)
        return entry


def _balance_minor_in_context(session: Session, employee_id: uuid.UUID) -> int:
    require_entity_context()
    total = session.scalar(
        select(func.coalesce(func.sum(StaffLedgerEntry.amount_minor), 0)).where(
            StaffLedgerEntry.employee_id == employee_id
        )
    )
    return int(total or 0)


def current_balance_minor(
    session: Session, entity_id: uuid.UUID, employee_id: uuid.UUID
) -> int:
    if entity_service.get_entity(session, entity_id) is None:
        raise LookupError("Entity not found")

    if get_current_entity_id() == entity_id:
        employee = session.get(Employee, employee_id)
        if employee is None:
            raise LookupError("Employee not found")
        return _balance_minor_in_context(session, employee_id)

    with entity_context(session, entity_id):
        employee = session.get(Employee, employee_id)
        if employee is None:
            raise LookupError("Employee not found")
        return _balance_minor_in_context(session, employee_id)


def _sum_by_type(
    session: Session, employee_id: uuid.UUID, movement_type: StaffMovementType
) -> int:
    total = session.scalar(
        select(func.coalesce(func.sum(StaffLedgerEntry.amount_minor), 0)).where(
            StaffLedgerEntry.employee_id == employee_id,
            StaffLedgerEntry.movement_type == movement_type,
        )
    )
    return int(total or 0)


def remaining_accrual_minor(session: Session, employee_id: uuid.UUID) -> int:
    """Gross accrued salary not yet cleared by salary payments (excludes advances)."""
    accrued = _sum_by_type(session, employee_id, StaffMovementType.SALARY_ACCRUED)
    paid = _sum_by_type(session, employee_id, StaffMovementType.SALARY_PAYMENT)
    return accrued + paid


def outstanding_advance_minor(session: Session, employee_id: uuid.UUID) -> int:
    """Unapplied advance total in pay-currency minor units (positive number)."""
    advance = _sum_by_type(session, employee_id, StaffMovementType.ADVANCE_PAID)
    return -advance if advance < 0 else 0


def outstanding_advance_try_kurus(session: Session, employee_id: uuid.UUID) -> int:
    """TRY book cost of unapplied advances (FX workers store try_cost on advance rows)."""
    rows = session.scalars(
        select(StaffLedgerEntry).where(
            StaffLedgerEntry.employee_id == employee_id,
            StaffLedgerEntry.movement_type == StaffMovementType.ADVANCE_PAID,
        )
    ).all()
    total = 0
    for row in rows:
        if row.try_cost_kurus is not None:
            total += -row.try_cost_kurus
        else:
            total += -row.amount_minor
    return total


def list_ledger_entries(
    session: Session, entity_id: uuid.UUID, employee_id: uuid.UUID
) -> list[StaffLedgerEntry]:
    if entity_service.get_entity(session, entity_id) is None:
        raise LookupError("Entity not found")

    with entity_context(session, entity_id):
        employee = session.get(Employee, employee_id)
        if employee is None:
            raise LookupError("Employee not found")

        require_entity_context()
        return list(
            session.scalars(
                select(StaffLedgerEntry)
                .where(StaffLedgerEntry.employee_id == employee_id)
                .order_by(
                    StaffLedgerEntry.movement_date,
                    StaffLedgerEntry.created_at,
                )
            )
        )
