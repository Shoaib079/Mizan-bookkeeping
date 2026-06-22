"""Delivery platform HTTP routes (ARCHITECTURE.md)."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.delivery.platforms import DeliveryPlatform
from app.core.delivery.posting import InvalidDeliveryReportError
from app.db.session import get_session
from app.features.delivery import service as delivery_service
from app.features.delivery.models import DeliveryReportStatus
from app.features.delivery.schema import (
    DeliveryClearingReconciliationRead,
    DeliveryReportCreate,
    DeliveryReportListOut,
    DeliveryReportPostRequest,
    DeliveryReportRead,
    DeliverySettlementCreate,
    DeliverySettlementRead,
)
from app.features.delivery.settings import (
    DeliveryNotEnabledError,
    DeliveryPlatformNotEnabledError,
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


@reports_router.post("", response_model=DeliveryReportRead, status_code=201)
def create_delivery_report(
    entity_id: uuid.UUID,
    payload: DeliveryReportCreate,
    session: Session = Depends(get_session),
) -> DeliveryReportRead:
    try:
        return delivery_service.create_delivery_report(session, entity_id, payload)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except (DeliveryNotEnabledError, DeliveryPlatformNotEnabledError) as exc:
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
    platform: DeliveryPlatform | None = Query(default=None),
    status: DeliveryReportStatus | None = Query(default=None),
) -> DeliveryReportListOut:
    try:
        return delivery_service.list_delivery_reports(
            session, entity_id, platform=platform, status=status
        )
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@reports_router.get("/{report_id}", response_model=DeliveryReportRead)
def get_delivery_report(
    entity_id: uuid.UUID,
    report_id: uuid.UUID,
    session: Session = Depends(get_session),
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
) -> DeliveryReportRead:
    try:
        return delivery_service.post_delivery_report_intake(
            session, entity_id, report_id, payload
        )
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except (DeliveryNotEnabledError, DeliveryPlatformNotEnabledError) as exc:
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
) -> DeliverySettlementRead:
    try:
        return delivery_service.create_delivery_settlement(session, entity_id, payload)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except (DeliveryNotEnabledError, DeliveryPlatformNotEnabledError) as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@settlements_router.get("", response_model=list[DeliverySettlementRead])
def list_delivery_settlements(
    entity_id: uuid.UUID,
    session: Session = Depends(get_session),
    platform: DeliveryPlatform | None = Query(default=None),
    money_account_id: uuid.UUID | None = Query(default=None),
) -> list[DeliverySettlementRead]:
    try:
        return delivery_service.list_delivery_settlements(
            session,
            entity_id,
            platform=platform,
            money_account_id=money_account_id,
        )
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@reconciliation_router.get("", response_model=DeliveryClearingReconciliationRead)
def get_delivery_clearing_reconciliation(
    entity_id: uuid.UUID,
    session: Session = Depends(get_session),
) -> DeliveryClearingReconciliationRead:
    try:
        return delivery_service.get_delivery_clearing_reconciliation(session, entity_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except DeliveryNotEnabledError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
