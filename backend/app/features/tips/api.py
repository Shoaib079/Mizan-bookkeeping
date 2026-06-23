"""Tips pass-through HTTP routes (ARCHITECTURE.md)."""

from __future__ import annotations

import uuid
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.listing import ListParams, PaginatedListOut, list_params_dependency, paginated_list
from app.core.ledger.posting import InvalidAccountError
from app.core.tips.posting import InvalidTipsPostingError
from app.db.session import get_session
from app.core.auth.deps import member_read_guard, operations_write_guard
from app.features.tips import service as tips_service
from app.features.tips.schema import (
    TipAccrualCreate,
    TipAccrualRead,
    TipPayoutCreate,
    TipPayoutRead,
    TipsBalanceRead,
)

router = APIRouter(prefix="/entities/{entity_id}/tips", tags=["tips"])


@router.post("/accruals", response_model=TipAccrualRead, status_code=201)
def create_tip_accrual(
    entity_id: uuid.UUID,
    payload: TipAccrualCreate,
    session: Session = Depends(get_session),
    _: None = Depends(operations_write_guard),
) -> TipAccrualRead:
    try:
        return tips_service.create_tip_accrual(session, entity_id, payload)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except (InvalidTipsPostingError, InvalidAccountError) as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.get("/accruals", response_model=PaginatedListOut[TipAccrualRead])
def list_tip_accruals(
    entity_id: uuid.UUID,
    session: Session = Depends(get_session),
    _: None = Depends(member_read_guard),
    from_date: date | None = Query(default=None, alias="from"),
    to_date: date | None = Query(default=None, alias="to"),
    money_account_id: uuid.UUID | None = Query(default=None),
    q: str | None = Query(default=None, max_length=256),
    min_amount: int | None = Query(default=None),
    max_amount: int | None = Query(default=None),
    list_params: ListParams = Depends(list_params_dependency),
) -> PaginatedListOut[TipAccrualRead]:
    try:
        items, total = tips_service.list_tip_accruals(
            session,
            entity_id,
            from_date=from_date,
            to_date=to_date,
            money_account_id=money_account_id,
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


@router.post("/payouts", response_model=TipPayoutRead, status_code=201)
def create_tip_payout(
    entity_id: uuid.UUID,
    payload: TipPayoutCreate,
    session: Session = Depends(get_session),
    _: None = Depends(operations_write_guard),
) -> TipPayoutRead:
    try:
        return tips_service.create_tip_payout(session, entity_id, payload)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except InvalidTipsPostingError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.get("/payouts", response_model=PaginatedListOut[TipPayoutRead])
def list_tip_payouts(
    entity_id: uuid.UUID,
    session: Session = Depends(get_session),
    _: None = Depends(member_read_guard),
    from_date: date | None = Query(default=None, alias="from"),
    to_date: date | None = Query(default=None, alias="to"),
    money_account_id: uuid.UUID | None = Query(default=None),
    q: str | None = Query(default=None, max_length=256),
    min_amount: int | None = Query(default=None),
    max_amount: int | None = Query(default=None),
    list_params: ListParams = Depends(list_params_dependency),
) -> PaginatedListOut[TipPayoutRead]:
    try:
        items, total = tips_service.list_tip_payouts(
            session,
            entity_id,
            from_date=from_date,
            to_date=to_date,
            money_account_id=money_account_id,
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


@router.get("/balance", response_model=TipsBalanceRead)
def get_tips_balance(
    entity_id: uuid.UUID,
    session: Session = Depends(get_session),
    _: None = Depends(member_read_guard),
) -> TipsBalanceRead:
    try:
        return tips_service.get_tips_balance(session, entity_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
