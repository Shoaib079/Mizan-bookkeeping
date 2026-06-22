"""Entity dashboard HTTP routes (ARCHITECTURE.md)."""

from __future__ import annotations

import uuid
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.auth.deps import member_read_guard
from app.db.session import get_session
from app.features.dashboard import service as dashboard_service
from app.features.dashboard.schema import DashboardRead
from app.features.reports.service import InvalidDateRangeError

router = APIRouter(prefix="/entities/{entity_id}/dashboard", tags=["dashboard"])


@router.get("", response_model=DashboardRead)
def get_dashboard(
    entity_id: uuid.UUID,
    from_date: date = Query(..., alias="from"),
    to_date: date = Query(..., alias="to"),
    supplier_id: uuid.UUID | None = Query(default=None),
    money_account_id: uuid.UUID | None = Query(default=None),
    expense_account_id: uuid.UUID | None = Query(default=None),
    session: Session = Depends(get_session),
    _: None = Depends(member_read_guard),
) -> DashboardRead:
    try:
        return dashboard_service.get_dashboard(
            session,
            entity_id,
            from_date,
            to_date,
            supplier_id=supplier_id,
            money_account_id=money_account_id,
            expense_account_id=expense_account_id,
        )
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except InvalidDateRangeError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
