"""Customer HTTP routes — thin handlers (ARCHITECTURE.md)."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.listing import ListParams, PaginatedListOut, list_params_dependency, paginated_list
from app.core.ledger.posting import InvalidAccountError, PostingError
from app.core.receivables.ledger import OverpaymentError, ZeroMovementError
from app.db.session import get_session
from app.core.auth.deps import member_read_guard, operations_write_guard
from app.features.customers import service
from app.features.customers.schema import (
    CreditSaleCreate,
    CreditSaleResponse,
    CustomerCreate,
    CustomerLedgerRead,
    CustomerPaymentCreate,
    CustomerPaymentResponse,
    CustomerRead,
    CustomerUpdate,
)

router = APIRouter(prefix="/entities/{entity_id}/customers", tags=["customers"])


@router.post("", response_model=CustomerRead, status_code=201)
def create_customer(
    entity_id: uuid.UUID,
    payload: CustomerCreate,
    session: Session = Depends(get_session),
    _: None = Depends(operations_write_guard),
) -> CustomerRead:
    try:
        customer = service.create_customer(session, entity_id, payload)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return CustomerRead.model_validate(customer)


@router.get("", response_model=PaginatedListOut[CustomerRead])
def list_customers(
    entity_id: uuid.UUID,
    session: Session = Depends(get_session),
    _: None = Depends(member_read_guard),
    include_inactive: bool = Query(default=False),
    q: str | None = Query(default=None, max_length=256),
    list_params: ListParams = Depends(list_params_dependency),
) -> PaginatedListOut[CustomerRead]:
    try:
        customers, total = service.list_customers(
            session,
            entity_id,
            include_inactive=include_inactive,
            q=q,
            list_params=list_params,
        )
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return paginated_list(
        [CustomerRead.model_validate(c) for c in customers],
        total=total,
        limit=list_params.limit,
        offset=list_params.offset,
    )


@router.get("/{customer_id}", response_model=CustomerRead)
def get_customer(
    entity_id: uuid.UUID,
    customer_id: uuid.UUID,
    session: Session = Depends(get_session),
    _: None = Depends(member_read_guard),
) -> CustomerRead:
    try:
        customer = service.get_customer(session, entity_id, customer_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return CustomerRead.model_validate(customer)


@router.patch("/{customer_id}", response_model=CustomerRead)
def update_customer(
    entity_id: uuid.UUID,
    customer_id: uuid.UUID,
    payload: CustomerUpdate,
    session: Session = Depends(get_session),
    _: None = Depends(operations_write_guard),
) -> CustomerRead:
    try:
        customer = service.update_customer(session, entity_id, customer_id, payload)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return CustomerRead.model_validate(customer)


@router.get("/{customer_id}/ledger", response_model=CustomerLedgerRead)
def get_customer_ledger(
    entity_id: uuid.UUID,
    customer_id: uuid.UUID,
    session: Session = Depends(get_session),
    _: None = Depends(member_read_guard),
) -> CustomerLedgerRead:
    try:
        return service.get_customer_ledger(session, entity_id, customer_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.post(
    "/{customer_id}/credit-sales",
    response_model=CreditSaleResponse,
    status_code=201,
)
def post_credit_sale(
    entity_id: uuid.UUID,
    customer_id: uuid.UUID,
    payload: CreditSaleCreate,
    session: Session = Depends(get_session),
    _: None = Depends(operations_write_guard),
) -> CreditSaleResponse:
    try:
        return service.record_credit_sale(session, entity_id, customer_id, payload)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except (ZeroMovementError, ValueError) as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except InvalidAccountError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except PostingError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.post(
    "/{customer_id}/payments",
    response_model=CustomerPaymentResponse,
    status_code=201,
)
def post_customer_payment(
    entity_id: uuid.UUID,
    customer_id: uuid.UUID,
    payload: CustomerPaymentCreate,
    session: Session = Depends(get_session),
    _: None = Depends(operations_write_guard),
) -> CustomerPaymentResponse:
    try:
        return service.record_customer_payment(session, entity_id, customer_id, payload)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except (ZeroMovementError, ValueError) as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except OverpaymentError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except InvalidAccountError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except PostingError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
