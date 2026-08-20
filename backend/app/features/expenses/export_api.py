"""Hand-recorded expenses Excel export — split from expenses/api.py (S9 growth)."""

from __future__ import annotations

import uuid
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.core.auth.deps import member_read_guard
from app.db.session import get_session
from app.features.expenses.models import ExpenseEntryStatus

router = APIRouter(prefix="/entities/{entity_id}", tags=["expenses"])


@router.get("/expenses/export")
def export_hand_recorded_expenses(
    entity_id: uuid.UUID,
    session: Session = Depends(get_session),
    _: None = Depends(member_read_guard),
    status: ExpenseEntryStatus | None = Query(default=None),
    from_date: date | None = Query(default=None, alias="from"),
    to_date: date | None = Query(default=None, alias="to"),
    q: str | None = Query(default=None, max_length=256),
    expense_item_id: uuid.UUID | None = Query(default=None),
) -> StreamingResponse:
    """Excel of hand-recorded expenses matching the /expenses list filters."""
    from app.features.expenses import hand_recorded_export
    from app.features.reports import excel_export

    if from_date is None or to_date is None:
        raise HTTPException(
            status_code=422, detail="from and to are required for export"
        )
    try:
        data, filename, _total = hand_recorded_export.build_hand_recorded_expenses_xlsx(
            session,
            entity_id,
            from_date,
            to_date,
            status=status,
            q=q,
            expense_item_id=expense_item_id,
        )
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return excel_export.xlsx_response(data, filename)
