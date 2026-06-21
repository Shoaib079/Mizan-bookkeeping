"""Staff feature service — employees + posting wrappers (ARCHITECTURE.md)."""

from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.staff import posting as staff_posting
from app.core.staff.ledger import current_balance_minor, list_ledger_entries
from app.db.session import entity_context, require_entity_context
from app.features.entities import service as entity_service
from app.features.staff.models import Employee
from app.features.staff.schema import (
    EmployeeCreate,
    EmployeeUpdate,
    StaffAccrualCreate,
    StaffAccrualResponse,
    StaffAdvanceCreate,
    StaffAdvanceResponse,
    StaffLedgerEntryRead,
    StaffLedgerRead,
    StaffPaymentCreate,
    StaffPaymentResponse,
)


def create_employee(
    session: Session, entity_id: uuid.UUID, payload: EmployeeCreate
) -> Employee:
    if entity_service.get_entity(session, entity_id) is None:
        raise LookupError("Entity not found")

    with entity_context(session, entity_id):
        employee = Employee(
            name=payload.name,
            pay_currency=payload.pay_currency,
            notes=payload.notes,
        )
        session.add(employee)
        session.commit()
        session.refresh(employee)
        return employee


def list_employees(
    session: Session, entity_id: uuid.UUID, *, include_inactive: bool = False
) -> list[Employee]:
    if entity_service.get_entity(session, entity_id) is None:
        raise LookupError("Entity not found")

    with entity_context(session, entity_id):
        require_entity_context()
        query = select(Employee).order_by(Employee.name)
        if not include_inactive:
            query = query.where(Employee.is_active.is_(True))
        return list(session.scalars(query))


def get_employee(
    session: Session, entity_id: uuid.UUID, employee_id: uuid.UUID
) -> Employee:
    if entity_service.get_entity(session, entity_id) is None:
        raise LookupError("Entity not found")

    with entity_context(session, entity_id):
        employee = session.get(Employee, employee_id)
        if employee is None:
            raise LookupError("Employee not found")
        return employee


def update_employee(
    session: Session,
    entity_id: uuid.UUID,
    employee_id: uuid.UUID,
    payload: EmployeeUpdate,
) -> Employee:
    if entity_service.get_entity(session, entity_id) is None:
        raise LookupError("Entity not found")

    with entity_context(session, entity_id):
        employee = session.get(Employee, employee_id)
        if employee is None:
            raise LookupError("Employee not found")

        if payload.name is not None:
            employee.name = payload.name
        if payload.notes is not None:
            employee.notes = payload.notes
        if payload.is_active is not None:
            employee.is_active = payload.is_active

        session.commit()
        session.refresh(employee)
        return employee


def get_staff_ledger(
    session: Session, entity_id: uuid.UUID, employee_id: uuid.UUID
) -> StaffLedgerRead:
    balance = current_balance_minor(session, entity_id, employee_id)
    entries = list_ledger_entries(session, entity_id, employee_id)
    return StaffLedgerRead(
        employee_id=employee_id,
        balance_minor=balance,
        entries=[StaffLedgerEntryRead.model_validate(e) for e in entries],
    )


def record_accrual(
    session: Session,
    entity_id: uuid.UUID,
    employee_id: uuid.UUID,
    payload: StaffAccrualCreate,
) -> StaffAccrualResponse:
    result = staff_posting.post_salary_accrual(
        session,
        entity_id,
        employee_id,
        accrual_date=payload.accrual_date,
        amount_minor=payload.amount_minor,
        description=payload.description,
        actor_id=payload.actor_id,
    )
    return StaffAccrualResponse(
        journal_entry_id=result.journal_entry.id if result.journal_entry else None,
        staff_ledger_entry=StaffLedgerEntryRead.model_validate(result.staff_ledger_entry),
        balance_minor=result.balance_minor,
    )


def record_advance(
    session: Session,
    entity_id: uuid.UUID,
    employee_id: uuid.UUID,
    payload: StaffAdvanceCreate,
) -> StaffAdvanceResponse:
    result = staff_posting.post_advance_paid(
        session,
        entity_id,
        employee_id,
        payment_date=payload.payment_date,
        amount_minor=payload.amount_minor,
        description=payload.description,
        actor_id=payload.actor_id,
        payment_account_id=payload.payment_account_id,
        fx_money_account_id=payload.fx_money_account_id,
        try_cost_kurus=payload.try_cost_kurus,
    )
    return StaffAdvanceResponse(
        journal_entry_id=result.journal_entry.id,
        staff_ledger_entry=StaffLedgerEntryRead.model_validate(result.staff_ledger_entry),
        balance_minor=result.balance_minor,
        fx_ledger_entry_id=(
            result.fx_ledger_entry.id if result.fx_ledger_entry else None
        ),
    )


def record_payment(
    session: Session,
    entity_id: uuid.UUID,
    employee_id: uuid.UUID,
    payload: StaffPaymentCreate,
) -> StaffPaymentResponse:
    result = staff_posting.post_salary_payment(
        session,
        entity_id,
        employee_id,
        payment_date=payload.payment_date,
        amount_minor=payload.amount_minor,
        description=payload.description,
        actor_id=payload.actor_id,
        payment_account_id=payload.payment_account_id,
        fx_money_account_id=payload.fx_money_account_id,
        try_cost_kurus=payload.try_cost_kurus,
    )
    return StaffPaymentResponse(
        journal_entry_id=result.journal_entry.id,
        staff_ledger_entry=StaffLedgerEntryRead.model_validate(result.staff_ledger_entry),
        balance_minor=result.balance_minor,
        fx_ledger_entry_id=(
            result.fx_ledger_entry.id if result.fx_ledger_entry else None
        ),
    )
