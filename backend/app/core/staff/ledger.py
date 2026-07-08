"""Single write boundary for staff ledger (ARCHITECTURE.md)."""

from __future__ import annotations

import uuid
from datetime import date

from sqlalchemy import select
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
    period_year: int | None = None,
    period_month: int | None = None,
    extra_days: int | None = None,
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
        period_year=period_year,
        period_month=period_month,
        extra_days=extra_days,
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
    from app.core.staff.ledger_effective import effective_balance_minor

    return effective_balance_minor(session, employee_id)


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
    from app.core.staff.ledger_effective import effective_sum_by_type

    return effective_sum_by_type(session, employee_id, movement_type)


def remaining_accrual_minor(session: Session, employee_id: uuid.UUID) -> int:
    """Gross accrued salary not yet cleared by salary payments (excludes advances)."""
    accrued = _sum_by_type(session, employee_id, StaffMovementType.SALARY_ACCRUED)
    paid = _sum_by_type(session, employee_id, StaffMovementType.SALARY_PAYMENT)
    return accrued + paid


def period_accrued_minor(
    session: Session, employee_id: uuid.UUID, *, period_year: int, period_month: int
) -> int:
    from app.core.staff.ledger_effective import period_accrued_minor_effective

    return period_accrued_minor_effective(
        session, employee_id, period_year=period_year, period_month=period_month
    )


def period_paid_minor(
    session: Session, employee_id: uuid.UUID, *, period_year: int, period_month: int
) -> int:
    """Cash + advance-applied salary settled for one pay period (positive kuruş)."""
    from app.core.staff.ledger_effective import period_paid_minor_effective

    return period_paid_minor_effective(
        session, employee_id, period_year=period_year, period_month=period_month
    )


def period_remaining_minor(
    session: Session,
    employee_id: uuid.UUID,
    *,
    period_year: int,
    period_month: int,
    period_salary_minor: int,
) -> int:
    paid = period_paid_minor(
        session, employee_id, period_year=period_year, period_month=period_month
    )
    return max(0, period_salary_minor - paid)


def outstanding_advance_minor(session: Session, employee_id: uuid.UUID) -> int:
    """Unapplied advance total in pay-currency minor units (positive number)."""
    advance = _sum_by_type(session, employee_id, StaffMovementType.ADVANCE_PAID)
    applied = _sum_by_type(session, employee_id, StaffMovementType.ADVANCE_APPLIED)
    returned = _sum_by_type(session, employee_id, StaffMovementType.ADVANCE_RETURNED)
    raw = -advance - applied - returned
    return raw if raw > 0 else 0


def outstanding_advance_try_kurus(session: Session, employee_id: uuid.UUID) -> int:
    """TRY book cost of unapplied advances (FX workers store try_cost on advance rows)."""
    from app.core.ledger.subledger_display import load_journals_for_rows
    from app.core.staff.ledger_effective import effective_amount_minor

    rows = session.scalars(
        select(StaffLedgerEntry).where(
            StaffLedgerEntry.employee_id == employee_id,
            StaffLedgerEntry.movement_type.in_(
                (
                    StaffMovementType.ADVANCE_PAID,
                    StaffMovementType.ADVANCE_APPLIED,
                    StaffMovementType.ADVANCE_RETURNED,
                )
            ),
        )
    ).all()
    if not rows:
        return 0
    journals = load_journals_for_rows(session, [r.journal_entry_id for r in rows])
    total = 0
    for row in rows:
        if effective_amount_minor(session, row, journals=journals) == 0:
            continue
        if row.movement_type == StaffMovementType.ADVANCE_PAID:
            if row.try_cost_kurus is not None:
                total += row.try_cost_kurus
            else:
                total += -row.amount_minor
        else:
            if row.try_cost_kurus is not None:
                total -= row.try_cost_kurus
            else:
                total -= row.amount_minor
    return total if total > 0 else 0


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
