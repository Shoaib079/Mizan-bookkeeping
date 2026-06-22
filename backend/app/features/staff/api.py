"""Staff HTTP routes — thin handlers (ARCHITECTURE.md)."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.ledger.posting import InvalidAccountError, PostingError
from app.core.staff.ledger import OverpaymentError, ZeroMovementError
from app.core.staff.posting import InvalidStaffPostingError
from app.db.session import get_session
from app.core.auth.deps import member_read_guard, operations_write_guard
from app.features.staff import service
from app.features.staff.schema import (
    EmployeeCreate,
    EmployeeRead,
    EmployeeUpdate,
    StaffAccrualCreate,
    StaffAccrualResponse,
    StaffAdvanceCreate,
    StaffAdvanceResponse,
    StaffLedgerRead,
    StaffPaymentCreate,
    StaffPaymentResponse,
)

router = APIRouter(prefix="/entities/{entity_id}/staff", tags=["staff"])


@router.post("/employees", response_model=EmployeeRead, status_code=201)
def create_employee(
    entity_id: uuid.UUID,
    payload: EmployeeCreate,
    session: Session = Depends(get_session),
    _: None = Depends(operations_write_guard),
) -> EmployeeRead:
    try:
        employee = service.create_employee(session, entity_id, payload)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return EmployeeRead.model_validate(employee)


@router.get("/employees", response_model=list[EmployeeRead])
def list_employees(
    entity_id: uuid.UUID,
    session: Session = Depends(get_session),
    _: None = Depends(member_read_guard),
    include_inactive: bool = Query(default=False),
) -> list[EmployeeRead]:
    try:
        employees = service.list_employees(
            session, entity_id, include_inactive=include_inactive
        )
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return [EmployeeRead.model_validate(e) for e in employees]


@router.get("/employees/{employee_id}", response_model=EmployeeRead)
def get_employee(
    entity_id: uuid.UUID,
    employee_id: uuid.UUID,
    session: Session = Depends(get_session),
    _: None = Depends(member_read_guard),
) -> EmployeeRead:
    try:
        employee = service.get_employee(session, entity_id, employee_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return EmployeeRead.model_validate(employee)


@router.patch("/employees/{employee_id}", response_model=EmployeeRead)
def update_employee(
    entity_id: uuid.UUID,
    employee_id: uuid.UUID,
    payload: EmployeeUpdate,
    session: Session = Depends(get_session),
    _: None = Depends(operations_write_guard),
) -> EmployeeRead:
    try:
        employee = service.update_employee(session, entity_id, employee_id, payload)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return EmployeeRead.model_validate(employee)


@router.get("/employees/{employee_id}/ledger", response_model=StaffLedgerRead)
def get_staff_ledger(
    entity_id: uuid.UUID,
    employee_id: uuid.UUID,
    session: Session = Depends(get_session),
    _: None = Depends(member_read_guard),
) -> StaffLedgerRead:
    try:
        return service.get_staff_ledger(session, entity_id, employee_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.post(
    "/employees/{employee_id}/accruals",
    response_model=StaffAccrualResponse,
    status_code=201,
)
def post_staff_accrual(
    entity_id: uuid.UUID,
    employee_id: uuid.UUID,
    payload: StaffAccrualCreate,
    session: Session = Depends(get_session),
    _: None = Depends(operations_write_guard),
) -> StaffAccrualResponse:
    try:
        return service.record_accrual(session, entity_id, employee_id, payload)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except (ZeroMovementError, ValueError) as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except InvalidAccountError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except PostingError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.post(
    "/employees/{employee_id}/advances",
    response_model=StaffAdvanceResponse,
    status_code=201,
)
def post_staff_advance(
    entity_id: uuid.UUID,
    employee_id: uuid.UUID,
    payload: StaffAdvanceCreate,
    session: Session = Depends(get_session),
    _: None = Depends(operations_write_guard),
) -> StaffAdvanceResponse:
    try:
        return service.record_advance(session, entity_id, employee_id, payload)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except (ZeroMovementError, ValueError, InvalidStaffPostingError) as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except InvalidAccountError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except PostingError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.post(
    "/employees/{employee_id}/payments",
    response_model=StaffPaymentResponse,
    status_code=201,
)
def post_staff_payment(
    entity_id: uuid.UUID,
    employee_id: uuid.UUID,
    payload: StaffPaymentCreate,
    session: Session = Depends(get_session),
    _: None = Depends(operations_write_guard),
) -> StaffPaymentResponse:
    try:
        return service.record_payment(session, entity_id, employee_id, payload)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except (ZeroMovementError, ValueError, InvalidStaffPostingError) as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except OverpaymentError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except InvalidAccountError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except PostingError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
