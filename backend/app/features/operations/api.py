"""Operations HTTP routes — day close-out (Phase 11 Slice 11.15)."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.auth.deps import operations_write_guard
from app.core.ledger.posting import PostingError
from app.db.session import get_session
from app.features.operations import day_closeout_service
from app.features.operations.schema import DayCloseoutRead, DayCloseoutRequest

router = APIRouter(prefix="/entities/{entity_id}/operations", tags=["operations"])


@router.post("/day-closeout", response_model=DayCloseoutRead, status_code=201)
def post_day_closeout(
    entity_id: uuid.UUID,
    payload: DayCloseoutRequest,
    session: Session = Depends(get_session),
    _: None = Depends(operations_write_guard),
) -> DayCloseoutRead:
    try:
        return day_closeout_service.post_day_closeout(session, entity_id, payload)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except day_closeout_service.DayCloseoutError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except PostingError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
