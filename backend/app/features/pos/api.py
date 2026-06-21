"""POS settlement HTTP routes (ARCHITECTURE.md)."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.pos.posting import InvalidPosSettlementError
from app.db.session import get_session
from app.features.pos import service as pos_service
from app.features.pos.schema import PosSettlementCreate, PosSettlementRead

router = APIRouter(prefix="/entities/{entity_id}/pos/settlements", tags=["pos"])


@router.post("", response_model=PosSettlementRead, status_code=201)
def create_pos_settlement(
    entity_id: uuid.UUID,
    payload: PosSettlementCreate,
    session: Session = Depends(get_session),
) -> PosSettlementRead:
    try:
        return pos_service.create_pos_settlement(session, entity_id, payload)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except InvalidPosSettlementError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.get("", response_model=list[PosSettlementRead])
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


@router.get("/{settlement_id}", response_model=PosSettlementRead)
def get_pos_settlement(
    entity_id: uuid.UUID,
    settlement_id: uuid.UUID,
    session: Session = Depends(get_session),
) -> PosSettlementRead:
    try:
        return pos_service.get_pos_settlement(session, entity_id, settlement_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
