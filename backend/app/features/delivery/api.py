"""Delivery platform HTTP routes (ARCHITECTURE.md)."""

from __future__ import annotations

import uuid
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.delivery.posting import InvalidDeliveryReportError
from app.core.listing import ListParams, PaginatedListOut, list_params_dependency, paginated_list
from app.db.session import get_session
from app.core.auth.deps import member_read_guard, operations_write_guard
from app.features.delivery import platform_service
from app.features.delivery import service as delivery_service
from app.features.delivery.models import DeliveryReportStatus
from app.features.delivery.platform_schema import (
    DeliveryPlatformCreate,
    DeliveryPlatformRead,
    DeliveryPlatformUpdate,
)
from app.features.delivery.schema import (
    DeliveryClearingReconciliationRead,
    DeliveryReportCreate,
    DeliveryReportListOut,
    DeliveryReportPostRequest,
    DeliveryReportRead,
    DeliverySettlementCreate,
    DeliverySettlementRead,
)
from app.features.delivery.settings import DeliveryNotEnabledError
from app.features.delivery.platform_service import (
    DuplicateDeliveryPlatformError,
    InactiveDeliveryPlatformError,
)

platforms_router = APIRouter(
    prefix="/entities/{entity_id}/delivery/platforms", tags=["delivery"]
)
reports_router = APIRouter(
    prefix="/entities/{entity_id}/delivery/reports", tags=["delivery"]
)
settlements_router = APIRouter(
    prefix="/entities/{entity_id}/delivery/settlements", tags=["delivery"]
)
reconciliation_router = APIRouter(
    prefix="/entities/{entity_id}/delivery/clearing-reconciliation",
    tags=["delivery"],
)


@platforms_router.post("", response_model=DeliveryPlatformRead, status_code=201)
def create_delivery_platform(
    entity_id: uuid.UUID,
    payload: DeliveryPlatformCreate,
    session: Session = Depends(get_session),
    _: None = Depends(operations_write_guard),
) -> DeliveryPlatformRead:
    try:
        return platform_service.create_delivery_platform(session, entity_id, payload)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except DeliveryNotEnabledError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except DuplicateDeliveryPlatformError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@platforms_router.get("", response_model=PaginatedListOut[DeliveryPlatformRead])
def list_delivery_platforms(
    entity_id: uuid.UUID,
    session: Session = Depends(get_session),
    _: None = Depends(member_read_guard),
    include_inactive: bool = Query(default=False),
    q: str | None = Query(default=None, max_length=256),
    list_params: ListParams = Depends(list_params_dependency),
) -> PaginatedListOut[DeliveryPlatformRead]:
    try:
        items, total = platform_service.list_delivery_platforms(
            session,
            entity_id,
            include_inactive=include_inactive,
            q=q,
            list_params=list_params,
        )
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return paginated_list(
        items,
        total=total,
        limit=list_params.limit,
        offset=list_params.offset,
    )


@platforms_router.get("/{platform_id}", response_model=DeliveryPlatformRead)
def get_delivery_platform(
    entity_id: uuid.UUID,
    platform_id: uuid.UUID,
    session: Session = Depends(get_session),
    _: None = Depends(member_read_guard),
) -> DeliveryPlatformRead:
    try:
        return platform_service.get_delivery_platform(session, entity_id, platform_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@platforms_router.patch("/{platform_id}", response_model=DeliveryPlatformRead)
def update_delivery_platform(
    entity_id: uuid.UUID,
    platform_id: uuid.UUID,
    payload: DeliveryPlatformUpdate,
    session: Session = Depends(get_session),
    _: None = Depends(operations_write_guard),
) -> DeliveryPlatformRead:
    try:
        return platform_service.update_delivery_platform(
            session, entity_id, platform_id, payload
        )
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except DeliveryNotEnabledError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except DuplicateDeliveryPlatformError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@reports_router.post("", response_model=DeliveryReportRead, status_code=201)
def create_delivery_report(
    entity_id: uuid.UUID,
    payload: DeliveryReportCreate,
    session: Session = Depends(get_session),
    _: None = Depends(operations_write_guard),
) -> DeliveryReportRead:
    try:
        return delivery_service.create_delivery_report(session, entity_id, payload)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except (DeliveryNotEnabledError, InactiveDeliveryPlatformError) as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except delivery_service.DuplicateDeliveryReportError as exc:
        raise HTTPException(
            status_code=409,
            detail={
                "message": "Duplicate delivery report for this entity",
                "existing_report_id": str(exc.existing.id),
            },
        ) from exc


@reports_router.get("", response_model=DeliveryReportListOut)
def list_delivery_reports(
    entity_id: uuid.UUID,
    session: Session = Depends(get_session),
    _: None = Depends(member_read_guard),
    delivery_platform_id: uuid.UUID | None = Query(default=None),
    status: DeliveryReportStatus | None = Query(default=None),
    from_date: date | None = Query(default=None, alias="from"),
    to_date: date | None = Query(default=None, alias="to"),
    q: str | None = Query(default=None, max_length=256),
    min_amount: int | None = Query(default=None),
    max_amount: int | None = Query(default=None),
    list_params: ListParams = Depends(list_params_dependency),
) -> DeliveryReportListOut:
    try:
        items, total = delivery_service.list_delivery_reports(
            session,
            entity_id,
            delivery_platform_id=delivery_platform_id,
            status=status,
            from_date=from_date,
            to_date=to_date,
            q=q,
            min_amount=min_amount,
            max_amount=max_amount,
            list_params=list_params,
        )
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return paginated_list(
        items,
        total=total,
        limit=list_params.limit,
        offset=list_params.offset,
    )


@reports_router.get("/{report_id}", response_model=DeliveryReportRead)
def get_delivery_report(
    entity_id: uuid.UUID,
    report_id: uuid.UUID,
    session: Session = Depends(get_session),
    _: None = Depends(member_read_guard),
) -> DeliveryReportRead:
    try:
        return delivery_service.get_delivery_report(session, entity_id, report_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@reports_router.post("/{report_id}/post", response_model=DeliveryReportRead)
def post_delivery_report(
    entity_id: uuid.UUID,
    report_id: uuid.UUID,
    payload: DeliveryReportPostRequest,
    session: Session = Depends(get_session),
    _: None = Depends(operations_write_guard),
) -> DeliveryReportRead:
    try:
        return delivery_service.post_delivery_report_intake(
            session, entity_id, report_id, payload
        )
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except (DeliveryNotEnabledError, InactiveDeliveryPlatformError) as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except InvalidDeliveryReportError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except delivery_service.DeliveryReportImmutableError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@reports_router.post("/{report_id}/reject", response_model=DeliveryReportRead)
def reject_delivery_report(
    entity_id: uuid.UUID,
    report_id: uuid.UUID,
    session: Session = Depends(get_session),
    _: None = Depends(operations_write_guard),
    reason: str | None = Query(default=None, max_length=512),
) -> DeliveryReportRead:
    try:
        return delivery_service.reject_delivery_report(
            session, entity_id, report_id, reason=reason
        )
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except delivery_service.DeliveryReportImmutableError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@settlements_router.post("", response_model=DeliverySettlementRead, status_code=201)
def create_delivery_settlement(
    entity_id: uuid.UUID,
    payload: DeliverySettlementCreate,
    session: Session = Depends(get_session),
    _: None = Depends(operations_write_guard),
) -> DeliverySettlementRead:
    try:
        return delivery_service.create_delivery_settlement(session, entity_id, payload)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except (DeliveryNotEnabledError, InactiveDeliveryPlatformError) as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@settlements_router.get("", response_model=PaginatedListOut[DeliverySettlementRead])
def list_delivery_settlements(
    entity_id: uuid.UUID,
    session: Session = Depends(get_session),
    _: None = Depends(member_read_guard),
    delivery_platform_id: uuid.UUID | None = Query(default=None),
    money_account_id: uuid.UUID | None = Query(default=None),
    from_date: date | None = Query(default=None, alias="from"),
    to_date: date | None = Query(default=None, alias="to"),
    q: str | None = Query(default=None, max_length=256),
    min_amount: int | None = Query(default=None),
    max_amount: int | None = Query(default=None),
    list_params: ListParams = Depends(list_params_dependency),
) -> PaginatedListOut[DeliverySettlementRead]:
    try:
        items, total = delivery_service.list_delivery_settlements(
            session,
            entity_id,
            delivery_platform_id=delivery_platform_id,
            money_account_id=money_account_id,
            from_date=from_date,
            to_date=to_date,
            q=q,
            min_amount=min_amount,
            max_amount=max_amount,
            list_params=list_params,
        )
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return paginated_list(
        items,
        total=total,
        limit=list_params.limit,
        offset=list_params.offset,
    )


@reconciliation_router.get("", response_model=DeliveryClearingReconciliationRead)
def get_delivery_clearing_reconciliation(
    entity_id: uuid.UUID,
    session: Session = Depends(get_session),
    _: None = Depends(member_read_guard),
) -> DeliveryClearingReconciliationRead:
    try:
        return delivery_service.get_delivery_clearing_reconciliation(session, entity_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except DeliveryNotEnabledError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
