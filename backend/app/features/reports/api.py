"""Read-only report HTTP routes (ARCHITECTURE.md)."""

from __future__ import annotations

import uuid
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.core.auth.deps import financial_reports_guard, reports_read_guard
from app.db.session import get_session
from app.features.delivery.settings import DeliveryNotEnabledError
from app.features.reports import service as reports_service
from app.features.reports import cash_flow
from app.features.reports import excel_export
from app.features.reports import financial_statements
from app.features.reports import kdv_input
from app.features.reports import period_comparison
from app.features.reports.schema import (
    BalanceSheetRead,
    CashFlowRead,
    DeliverySalesReportRead,
    KdvInputReportRead,
    PeriodComparisonRead,
    ProfitAndLossRead,
)
from app.features.reports.service import InvalidDateRangeError

router = APIRouter(prefix="/entities/{entity_id}/reports", tags=["reports"])


@router.get("/delivery-sales", response_model=DeliverySalesReportRead)
def get_delivery_sales_report(
    entity_id: uuid.UUID,
    from_date: date = Query(..., alias="from"),
    to_date: date = Query(..., alias="to"),
    session: Session = Depends(get_session),
    _: None = Depends(reports_read_guard),
) -> DeliverySalesReportRead:
    try:
        return reports_service.get_delivery_sales_report(
            session, entity_id, from_date, to_date
        )
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except DeliveryNotEnabledError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except InvalidDateRangeError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.get("/delivery-sales/export")
def export_delivery_sales(
    entity_id: uuid.UUID,
    from_date: date = Query(..., alias="from"),
    to_date: date = Query(..., alias="to"),
    session: Session = Depends(get_session),
    _: None = Depends(reports_read_guard),
) -> StreamingResponse:
    try:
        report = reports_service.get_delivery_sales_report(
            session, entity_id, from_date, to_date
        )
        data = excel_export.build_delivery_sales_xlsx(report)
        filename = excel_export.export_filename(
            "delivery-sales", from_date=from_date, to_date=to_date
        )
        return excel_export.xlsx_response(data, filename)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except DeliveryNotEnabledError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except InvalidDateRangeError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.get("/profit-and-loss", response_model=ProfitAndLossRead)
def get_profit_and_loss(
    entity_id: uuid.UUID,
    from_date: date = Query(..., alias="from"),
    to_date: date = Query(..., alias="to"),
    session: Session = Depends(get_session),
    _: None = Depends(financial_reports_guard),
) -> ProfitAndLossRead:
    try:
        return financial_statements.get_profit_and_loss(
            session, entity_id, from_date, to_date
        )
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except InvalidDateRangeError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.get("/profit-and-loss/export")
def export_profit_and_loss(
    entity_id: uuid.UUID,
    from_date: date = Query(..., alias="from"),
    to_date: date = Query(..., alias="to"),
    session: Session = Depends(get_session),
    _: None = Depends(financial_reports_guard),
) -> StreamingResponse:
    try:
        report = financial_statements.get_profit_and_loss(
            session, entity_id, from_date, to_date
        )
        data = excel_export.build_profit_and_loss_xlsx(report)
        filename = excel_export.export_filename(
            "profit-and-loss", from_date=from_date, to_date=to_date
        )
        return excel_export.xlsx_response(data, filename)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except InvalidDateRangeError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.get("/balance-sheet", response_model=BalanceSheetRead)
def get_balance_sheet(
    entity_id: uuid.UUID,
    as_of: date = Query(...),
    session: Session = Depends(get_session),
    _: None = Depends(financial_reports_guard),
) -> BalanceSheetRead:
    try:
        return financial_statements.get_balance_sheet(session, entity_id, as_of)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("/balance-sheet/export")
def export_balance_sheet(
    entity_id: uuid.UUID,
    as_of: date = Query(...),
    session: Session = Depends(get_session),
    _: None = Depends(financial_reports_guard),
) -> StreamingResponse:
    try:
        report = financial_statements.get_balance_sheet(session, entity_id, as_of)
        data = excel_export.build_balance_sheet_xlsx(report)
        filename = excel_export.export_filename("balance-sheet", as_of=as_of)
        return excel_export.xlsx_response(data, filename)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("/cash-flow", response_model=CashFlowRead)
def get_cash_flow(
    entity_id: uuid.UUID,
    from_date: date = Query(..., alias="from"),
    to_date: date = Query(..., alias="to"),
    session: Session = Depends(get_session),
    _: None = Depends(financial_reports_guard),
) -> CashFlowRead:
    try:
        return cash_flow.get_cash_flow(session, entity_id, from_date, to_date)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except InvalidDateRangeError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.get("/cash-flow/export")
def export_cash_flow(
    entity_id: uuid.UUID,
    from_date: date = Query(..., alias="from"),
    to_date: date = Query(..., alias="to"),
    session: Session = Depends(get_session),
    _: None = Depends(financial_reports_guard),
) -> StreamingResponse:
    try:
        report = cash_flow.get_cash_flow(session, entity_id, from_date, to_date)
        data = excel_export.build_cash_flow_xlsx(report)
        filename = excel_export.export_filename(
            "cash-flow", from_date=from_date, to_date=to_date
        )
        return excel_export.xlsx_response(data, filename)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except InvalidDateRangeError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.get("/kdv-input", response_model=KdvInputReportRead)
def get_kdv_input(
    entity_id: uuid.UUID,
    from_date: date = Query(..., alias="from"),
    to_date: date = Query(..., alias="to"),
    session: Session = Depends(get_session),
    _: None = Depends(reports_read_guard),
) -> KdvInputReportRead:
    try:
        return kdv_input.get_kdv_input_report(session, entity_id, from_date, to_date)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except InvalidDateRangeError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.get("/kdv-input/export")
def export_kdv_input(
    entity_id: uuid.UUID,
    from_date: date = Query(..., alias="from"),
    to_date: date = Query(..., alias="to"),
    session: Session = Depends(get_session),
    _: None = Depends(reports_read_guard),
) -> StreamingResponse:
    try:
        report = kdv_input.get_kdv_input_report(
            session, entity_id, from_date, to_date
        )
        data = excel_export.build_kdv_input_xlsx(report)
        filename = excel_export.export_filename(
            "kdv-input", from_date=from_date, to_date=to_date
        )
        return excel_export.xlsx_response(data, filename)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except InvalidDateRangeError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.get("/period-comparison", response_model=PeriodComparisonRead)
def get_period_comparison_report(
    entity_id: uuid.UUID,
    from_date: date = Query(..., alias="from"),
    to_date: date = Query(..., alias="to"),
    prior_from: date | None = Query(None),
    prior_to: date | None = Query(None),
    session: Session = Depends(get_session),
    _: None = Depends(financial_reports_guard),
) -> PeriodComparisonRead:
    try:
        return period_comparison.get_period_comparison(
            session,
            entity_id,
            from_date,
            to_date,
            prior_from=prior_from,
            prior_to=prior_to,
        )
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except InvalidDateRangeError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.get("/period-comparison/export")
def export_period_comparison(
    entity_id: uuid.UUID,
    from_date: date = Query(..., alias="from"),
    to_date: date = Query(..., alias="to"),
    prior_from: date | None = Query(None),
    prior_to: date | None = Query(None),
    session: Session = Depends(get_session),
    _: None = Depends(financial_reports_guard),
) -> StreamingResponse:
    try:
        report = period_comparison.get_period_comparison(
            session,
            entity_id,
            from_date,
            to_date,
            prior_from=prior_from,
            prior_to=prior_to,
        )
        data = excel_export.build_period_comparison_xlsx(report)
        filename = excel_export.export_filename(
            "period-comparison", from_date=from_date, to_date=to_date
        )
        return excel_export.xlsx_response(data, filename)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except InvalidDateRangeError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
