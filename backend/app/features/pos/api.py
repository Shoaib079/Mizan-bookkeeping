"""POS HTTP routes (ARCHITECTURE.md)."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from sqlalchemy.orm import Session

from app.core.pos.posting import InvalidCardSalesBatchError, InvalidPosSettlementError
from app.db.session import get_session
from app.features.pos import daily_summary_service
from app.features.pos import service as pos_service
from app.features.pos.models import PosDailySummaryStatus
from app.features.pos.schema import (
    CardSalesBatchCreate,
    CardSalesBatchRead,
    ClearingReconciliationRead,
    ConfirmPosDailySummaryRequest,
    PosDailySummaryListOut,
    PosDailySummaryRead,
    PosSettlementCreate,
    PosSettlementRead,
    RejectPosDailySummaryRequest,
)

settlements_router = APIRouter(prefix="/entities/{entity_id}/pos/settlements", tags=["pos"])
card_sales_router = APIRouter(prefix="/entities/{entity_id}/pos/card-sales", tags=["pos"])
reconciliation_router = APIRouter(
    prefix="/entities/{entity_id}/pos/clearing-reconciliation", tags=["pos"]
)
daily_summaries_router = APIRouter(
    prefix="/entities/{entity_id}/pos/daily-summaries", tags=["pos"]
)


@settlements_router.post("", response_model=PosSettlementRead, status_code=201)
def create_pos_settlement(
    entity_id: uuid.UUID,
    payload: PosSettlementCreate,
    session: Session = Depends(get_session),
) -> PosSettlementRead:
    try:
        return pos_service.create_pos_settlement(session, entity_id, payload)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except (InvalidPosSettlementError, InvalidCardSalesBatchError) as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@settlements_router.get("", response_model=list[PosSettlementRead])
def list_pos_settlements(
    entity_id: uuid.UUID,
    session: Session = Depends(get_session),
    money_account_id: uuid.UUID | None = Query(default=None),
) -> list[PosSettlementRead]:
    try:
        return pos_service.list_pos_settlements(
            session, entity_id, money_account_id=money_account_id
        )
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@settlements_router.get("/{settlement_id}", response_model=PosSettlementRead)
def get_pos_settlement(
    entity_id: uuid.UUID,
    settlement_id: uuid.UUID,
    session: Session = Depends(get_session),
) -> PosSettlementRead:
    try:
        return pos_service.get_pos_settlement(session, entity_id, settlement_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@card_sales_router.post("", response_model=CardSalesBatchRead, status_code=201)
def create_card_sales_batch(
    entity_id: uuid.UUID,
    payload: CardSalesBatchCreate,
    session: Session = Depends(get_session),
) -> CardSalesBatchRead:
    try:
        return pos_service.create_card_sales_batch(session, entity_id, payload)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@card_sales_router.get("", response_model=list[CardSalesBatchRead])
def list_card_sales_batches(
    entity_id: uuid.UUID,
    session: Session = Depends(get_session),
) -> list[CardSalesBatchRead]:
    try:
        return pos_service.list_card_sales_batches(session, entity_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@reconciliation_router.get("", response_model=ClearingReconciliationRead)
def get_clearing_reconciliation(
    entity_id: uuid.UUID,
    session: Session = Depends(get_session),
) -> ClearingReconciliationRead:
    try:
        return pos_service.get_clearing_reconciliation(session, entity_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@daily_summaries_router.post("", response_model=PosDailySummaryRead, status_code=201)
async def upload_pos_daily_summary(
    entity_id: uuid.UUID,
    file: UploadFile = File(...),
    session: Session = Depends(get_session),
) -> PosDailySummaryRead:
    from app.adapters.ocr_ai.pos_summary import PosSummaryUnsupportedError

    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Empty file")

    try:
        return daily_summary_service.create_pos_daily_summary_from_upload(
            session,
            entity_id,
            content,
            filename=file.filename,
            content_type=file.content_type,
        )
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except daily_summary_service.DuplicatePosDailySummaryError as exc:
        raise HTTPException(
            status_code=409,
            detail={
                "message": "Duplicate POS daily-summary document for this entity",
                "existing_summary_id": str(exc.existing.id),
            },
        ) from exc
    except PosSummaryUnsupportedError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@daily_summaries_router.get("", response_model=PosDailySummaryListOut)
def list_pos_daily_summaries(
    entity_id: uuid.UUID,
    session: Session = Depends(get_session),
    status: PosDailySummaryStatus | None = Query(default=None),
) -> PosDailySummaryListOut:
    try:
        return daily_summary_service.list_pos_daily_summaries(
            session, entity_id, status=status
        )
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@daily_summaries_router.get("/{summary_id}", response_model=PosDailySummaryRead)
def get_pos_daily_summary(
    entity_id: uuid.UUID,
    summary_id: uuid.UUID,
    session: Session = Depends(get_session),
) -> PosDailySummaryRead:
    try:
        return daily_summary_service.get_pos_daily_summary(session, entity_id, summary_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@daily_summaries_router.post("/{summary_id}/confirm", response_model=PosDailySummaryRead)
def confirm_pos_daily_summary(
    entity_id: uuid.UUID,
    summary_id: uuid.UUID,
    payload: ConfirmPosDailySummaryRequest,
    session: Session = Depends(get_session),
) -> PosDailySummaryRead:
    try:
        return daily_summary_service.confirm_pos_daily_summary_intake(
            session, entity_id, summary_id, payload
        )
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except daily_summary_service.PosDailySummaryConfirmError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except daily_summary_service.PosDailySummaryImmutableError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@daily_summaries_router.post("/{summary_id}/reject", response_model=PosDailySummaryRead)
def reject_pos_daily_summary(
    entity_id: uuid.UUID,
    summary_id: uuid.UUID,
    payload: RejectPosDailySummaryRequest,
    session: Session = Depends(get_session),
) -> PosDailySummaryRead:
    try:
        return daily_summary_service.reject_pos_daily_summary(
            session, entity_id, summary_id, payload=payload
        )
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except daily_summary_service.PosDailySummaryImmutableError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
