"""Cash/bank book + general-ledger Excel exports — split from reports/ledger APIs (S9)."""

from __future__ import annotations

import uuid
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.core.auth.deps import financial_reports_guard, member_read_guard
from app.core.ledger.models import JournalEntrySource, JournalEntryStatus
from app.db.session import get_session
from app.features.reports import excel_export
from app.features.reports.service import InvalidDateRangeError

reports_router = APIRouter(prefix="/entities/{entity_id}/reports", tags=["reports"])
ledger_router = APIRouter(prefix="/entities/{entity_id}/ledger", tags=["ledger"])


@reports_router.get("/cash-book/export")
def export_cash_bank_book(
    entity_id: uuid.UUID,
    from_date: date = Query(..., alias="from"),
    to_date: date = Query(..., alias="to"),
    session: Session = Depends(get_session),
    _: None = Depends(financial_reports_guard),
) -> StreamingResponse:
    """One .xlsx with a sheet per active cash/bank account (month-pack writers)."""
    from app.features.reports import cash_bank_book_export

    try:
        data, filename = cash_bank_book_export.build_cash_bank_book_xlsx(
            session, entity_id, from_date, to_date
        )
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except InvalidDateRangeError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return excel_export.xlsx_response(data, filename)


@ledger_router.get("/entries/export")
def export_general_ledger(
    entity_id: uuid.UUID,
    session: Session = Depends(get_session),
    _: None = Depends(member_read_guard),
    status: JournalEntryStatus | None = Query(default=None),
    source: JournalEntrySource | None = Query(default=None),
    entry_date_from: date | None = Query(default=None, alias="from"),
    entry_date_to: date | None = Query(default=None, alias="to"),
    q: str | None = Query(default=None, max_length=256),
    effective_only: bool = Query(default=True),
) -> StreamingResponse:
    """Excel: By account summary + All entries detail for the on-screen filters."""
    from app.features.reports import general_ledger_export

    if entry_date_from is None or entry_date_to is None:
        raise HTTPException(
            status_code=422, detail="from and to are required for export"
        )
    try:
        data, filename, _lines = general_ledger_export.build_general_ledger_xlsx(
            session,
            entity_id,
            entry_date_from,
            entry_date_to,
            status=status,
            source=source,
            q=q,
            effective_only=effective_only,
        )
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except AssertionError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    return excel_export.xlsx_response(data, filename)
