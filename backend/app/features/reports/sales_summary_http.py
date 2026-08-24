"""HTTP routes for sales summary (kept out of reports/api.py for file size)."""

from __future__ import annotations

import uuid
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.core.auth.deps import export_scope_guard, member_read_guard
from app.db.session import get_session
from app.features.entities import service as entity_service
from app.features.reports import excel_export
from app.features.reports import sales_summary
from app.features.reports import sales_summary_xlsx
from app.features.reports.schema import SalesSummaryRead
from app.features.reports.service import InvalidDateRangeError

router = APIRouter()


def _entity_name_for_export(session: Session, entity_id: uuid.UUID) -> str:
    entity = entity_service.get_entity(session, entity_id)
    if entity is None:
        raise LookupError(f"Entity not found: {entity_id}")
    return entity.name


@router.get("/sales-summary", response_model=SalesSummaryRead)
def get_sales_summary_report(
    entity_id: uuid.UUID,
    from_date: date = Query(..., alias="from"),
    to_date: date = Query(..., alias="to"),
    session: Session = Depends(get_session),
    _: None = Depends(member_read_guard),
) -> SalesSummaryRead:
    """Cash / card / delivery totals — same audience as /sales."""
    try:
        return sales_summary.get_sales_summary(
            session, entity_id, from_date, to_date
        )
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except InvalidDateRangeError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.get("/sales-summary/export")
def export_sales_summary(
    entity_id: uuid.UUID,
    from_date: date = Query(..., alias="from"),
    to_date: date = Query(..., alias="to"),
    session: Session = Depends(get_session),
    _: None = Depends(member_read_guard),
    _export: None = Depends(export_scope_guard),
) -> StreamingResponse:
    try:
        report = sales_summary.get_sales_summary(
            session, entity_id, from_date, to_date
        )
        data = sales_summary_xlsx.build_sales_summary_xlsx(report)
        filename = excel_export.export_filename(
            "sales-summary",
            entity_name=_entity_name_for_export(session, entity_id),
            from_date=from_date,
            to_date=to_date,
        )
        return excel_export.xlsx_response(data, filename)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except InvalidDateRangeError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
