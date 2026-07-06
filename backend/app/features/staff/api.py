"""Staff HTTP routes — thin handlers (ARCHITECTURE.md)."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.listing import ListParams, PaginatedListOut, list_params_dependency, paginated_list
from app.core.ledger.correction import CorrectionNotFoundError
from app.core.ledger.posting import InvalidAccountError, PostingError
from app.core.staff.ledger import OverpaymentError, ZeroMovementError
from app.core.staff.posting import InvalidStaffPostingError
from app.db.session import get_session
from app.core.auth.deps import member_read_guard, operations_write_guard, resolve_actor_id
from app.features.auth.models import User
from app.features.staff import service
from app.features.staff.schema import (
    EmployeeCreate,
    EmployeeRead,
    EmployeeUpdate,
    StaffAccrualCreate,
    StaffAccrualResponse,
    StaffAdvanceCreate,
    StaffAdvanceResponse,
    StaffExtraDaysPaidCreate,
    StaffExtraDaysPaidResponse,
    StaffLedgerRead,
    StaffPaymentCreate,
    StaffPaymentResponse,
    SalaryPeriodStatusRead,
    StaffJournalEntryCorrect,
    StaffJournalEntryCorrectOut,
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


@router.get("/employees", response_model=PaginatedListOut[EmployeeRead])
def list_employees(
    entity_id: uuid.UUID,
    session: Session = Depends(get_session),
    _: None = Depends(member_read_guard),
    include_inactive: bool = Query(default=False),
    q: str | None = Query(default=None, max_length=256),
    list_params: ListParams = Depends(list_params_dependency),
) -> PaginatedListOut[EmployeeRead]:
    try:
        employees, total = service.list_employees(
            session,
            entity_id,
            include_inactive=include_inactive,
            q=q,
            list_params=list_params,
        )
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return paginated_list(
        [EmployeeRead.model_validate(e) for e in employees],
        total=total,
        limit=list_params.limit,
        offset=list_params.offset,
    )


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


@router.get(
    "/employees/{employee_id}/salary-periods/{period_year}/{period_month}",
    response_model=SalaryPeriodStatusRead,
)
def get_salary_period_status(
    entity_id: uuid.UUID,
    employee_id: uuid.UUID,
    period_year: int,
    period_month: int,
    session: Session = Depends(get_session),
    _: None = Depends(member_read_guard),
    period_salary_minor: int | None = Query(default=None, gt=0),
) -> SalaryPeriodStatusRead:
    try:
        return service.get_salary_period_status(
            session,
            entity_id,
            employee_id,
            period_year=period_year,
            period_month=period_month,
            period_salary_minor=period_salary_minor,
        )
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
    _guard: User | None = Depends(operations_write_guard),
) -> StaffAccrualResponse:
    payload.actor_id = resolve_actor_id(_guard, payload.actor_id)
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
    _guard: User | None = Depends(operations_write_guard),
) -> StaffAdvanceResponse:
    payload.actor_id = resolve_actor_id(_guard, payload.actor_id)
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
    "/employees/{employee_id}/extra-days",
    response_model=StaffExtraDaysPaidResponse,
    status_code=201,
)
def post_staff_extra_days(
    entity_id: uuid.UUID,
    employee_id: uuid.UUID,
    payload: StaffExtraDaysPaidCreate,
    session: Session = Depends(get_session),
    _guard: User | None = Depends(operations_write_guard),
) -> StaffExtraDaysPaidResponse:
    payload.actor_id = resolve_actor_id(_guard, payload.actor_id)
    try:
        return service.record_extra_days_paid(session, entity_id, employee_id, payload)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except (ZeroMovementError, ValueError) as exc:
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
    _guard: User | None = Depends(operations_write_guard),
) -> StaffPaymentResponse:
    payload.actor_id = resolve_actor_id(_guard, payload.actor_id)
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


@router.post(
    "/employees/{employee_id}/ledger/{journal_entry_id}/correct",
    response_model=StaffJournalEntryCorrectOut,
)
def correct_staff_journal_entry(
    entity_id: uuid.UUID,
    employee_id: uuid.UUID,
    journal_entry_id: uuid.UUID,
    payload: StaffJournalEntryCorrect,
    session: Session = Depends(get_session),
    _guard: User | None = Depends(operations_write_guard),
) -> StaffJournalEntryCorrectOut:
    payload.actor_id = resolve_actor_id(_guard, payload.actor_id)
    try:
        return service.correct_staff_journal_entry_http(
            session, entity_id, employee_id, journal_entry_id, payload
        )
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except CorrectionNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except (ZeroMovementError, ValueError, InvalidStaffPostingError) as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except InvalidAccountError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except PostingError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
