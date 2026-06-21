"""Chart of accounts HTTP routes — thin handlers (ARCHITECTURE.md)."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db.session import get_session
from app.features.chart_of_accounts import service
from app.features.chart_of_accounts.schema import AccountRead, SeedChartResponse
from app.core.chart_of_accounts.seed import ChartAlreadySeededError

router = APIRouter(prefix="/entities/{entity_id}/chart-of-accounts", tags=["chart-of-accounts"])


@router.post("/seed", response_model=SeedChartResponse, status_code=201)
def seed_chart(
    entity_id: uuid.UUID, session: Session = Depends(get_session)
) -> SeedChartResponse:
    try:
        accounts = service.seed_chart_for_entity(session, entity_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ChartAlreadySeededError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc

    return SeedChartResponse(
        entity_id=entity_id,
        accounts_created=len(accounts),
        accounts=[AccountRead.model_validate(a) for a in accounts],
    )


@router.get("", response_model=list[AccountRead])
def list_chart_accounts(
    entity_id: uuid.UUID, session: Session = Depends(get_session)
) -> list[AccountRead]:
    try:
        accounts = service.list_accounts_for_entity(session, entity_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return [AccountRead.model_validate(a) for a in accounts]
