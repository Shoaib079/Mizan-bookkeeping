"""POS daily summaries export routes — split from api.py for file-size ratchet."""

from __future__ import annotations

import uuid
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.core.auth.deps import export_scope_guard, member_read_guard
from app.db.session import get_session
from app.features.pos import daily_summary_service, pdf_export


def register_daily_summaries_export_routes(router: APIRouter) -> None:
    @router.get("/export")
    def export_pos_daily_summaries(
        entity_id: uuid.UUID,
        from_date: date = Query(..., alias="from"),
        to_date: date = Query(..., alias="to"),
        review: str | None = Query(default="all", pattern="^(all|pending|posted)$"),
        session: Session = Depends(get_session),
        _: None = Depends(member_read_guard),
        _export: None = Depends(export_scope_guard),
    ) -> StreamingResponse:
        from app.features.reports.excel_export import xlsx_response

        try:
            data, filename = daily_summary_service.export_pos_daily_summaries(
                session,
                entity_id,
                from_date=from_date,
                to_date=to_date,
                review=review,
            )
        except LookupError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc
        return xlsx_response(data, filename)

    @router.get("/export/pdf")
    def export_pos_daily_summaries_pdf(
        entity_id: uuid.UUID,
        from_date: date = Query(..., alias="from"),
        to_date: date = Query(..., alias="to"),
        review: str | None = Query(default="all", pattern="^(all|pending|posted)$"),
        session: Session = Depends(get_session),
        _: None = Depends(member_read_guard),
        _export: None = Depends(export_scope_guard),
    ) -> StreamingResponse:
        from app.features.reports.pdf_export import PdfExportDependencyError, pdf_response

        try:
            data, filename = pdf_export.export_pos_daily_summaries_pdf(
                session,
                entity_id,
                from_date=from_date,
                to_date=to_date,
                review=review,
            )
        except LookupError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc
        except PdfExportDependencyError as exc:
            raise HTTPException(status_code=503, detail=str(exc)) from exc
        return pdf_response(data, filename)
