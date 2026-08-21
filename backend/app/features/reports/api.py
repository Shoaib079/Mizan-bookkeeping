"""Read-only report HTTP routes (ARCHITECTURE.md)."""

from __future__ import annotations

import uuid
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.core.auth.deps import financial_reports_guard, reports_read_guard, export_scope_guard
from app.db.session import get_session
from app.features.delivery.settings import DeliveryNotEnabledError
from app.features.reports import service as reports_service
from app.features.reports import bank_reconciliation
from app.features.reports import cash_book
from app.features.reports import cash_flow
from app.features.reports import excel_export
from app.features.reports import month_pack
from app.features.reports import expense_register
from app.features.reports import financial_statements
from app.features.reports import kdv_input
from app.features.reports import pdf_export
from app.features.reports import period_comparison
from app.features.entities import service as entity_service
from app.features.reports.schema import (
    BalanceSheetRead,
    BankReconciliationRead,
    CashBookRead,
    CashFlowRead,
    DeliverySalesReportRead,
    ExpenseRegisterRead,
    KdvInputReportRead,
    PeriodComparisonRead,
    ProfitAndLossRead,
)
from app.features.reports.service import InvalidDateRangeError
from app.features.reports.time_series import TimeSeriesRead, get_time_series

router = APIRouter(prefix="/entities/{entity_id}/reports", tags=["reports"])


def _entity_name_for_export(session: Session, entity_id: uuid.UUID) -> str:
    entity = entity_service.get_entity(session, entity_id)
    if entity is None:
        raise LookupError(f"Entity not found: {entity_id}")
    return entity.name


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


@router.get("/time-series", response_model=TimeSeriesRead)
def get_time_series_report(
    entity_id: uuid.UUID,
    from_date: date = Query(..., alias="from"),
    to_date: date = Query(..., alias="to"),
    session: Session = Depends(get_session),
    _: None = Depends(reports_read_guard),
) -> TimeSeriesRead:
    try:
        return get_time_series(session, entity_id, from_date, to_date)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.get("/delivery-sales/export")
def export_delivery_sales(
    entity_id: uuid.UUID,
    from_date: date = Query(..., alias="from"),
    to_date: date = Query(..., alias="to"),
    session: Session = Depends(get_session),
    _: None = Depends(reports_read_guard), _export: None = Depends(export_scope_guard),
) -> StreamingResponse:
    try:
        report = reports_service.get_delivery_sales_report(
            session, entity_id, from_date, to_date
        )
        data = excel_export.build_delivery_sales_xlsx(report)
        filename = excel_export.export_filename(
            "delivery-sales",
            entity_name=_entity_name_for_export(session, entity_id),
            from_date=from_date,
            to_date=to_date,
        )
        return excel_export.xlsx_response(data, filename)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except DeliveryNotEnabledError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except InvalidDateRangeError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.get("/bank-reconciliation", response_model=BankReconciliationRead)
def get_bank_reconciliation(
    entity_id: uuid.UUID,
    as_of: date | None = Query(default=None),
    money_account_id: uuid.UUID | None = Query(default=None),
    session: Session = Depends(get_session),
    _: None = Depends(financial_reports_guard),
) -> BankReconciliationRead:
    try:
        return bank_reconciliation.get_bank_reconciliation(
            session, entity_id, as_of=as_of, money_account_id=money_account_id
        )
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("/cash-book", response_model=CashBookRead)
def get_cash_book(
    entity_id: uuid.UUID,
    money_account_id: uuid.UUID = Query(...),
    from_date: date = Query(..., alias="from"),
    to_date: date = Query(..., alias="to"),
    session: Session = Depends(get_session),
    _: None = Depends(financial_reports_guard),
) -> CashBookRead:
    try:
        return cash_book.get_cash_book(
            session, entity_id, money_account_id, from_date, to_date
        )
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except cash_book.MoneyAccountKindNotSupportedError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except InvalidDateRangeError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.get("/expense-register", response_model=ExpenseRegisterRead)
def get_expense_register(
    entity_id: uuid.UUID,
    from_date: date = Query(..., alias="from"),
    to_date: date = Query(..., alias="to"),
    account_id: uuid.UUID | None = Query(default=None),
    q: str | None = Query(default=None, max_length=256),
    session: Session = Depends(get_session),
    _: None = Depends(financial_reports_guard),
) -> ExpenseRegisterRead:
    try:
        return expense_register.get_expense_register(
            session,
            entity_id,
            from_date,
            to_date,
            account_id=account_id,
            q=q,
        )
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except InvalidDateRangeError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.get("/profit-and-loss", response_model=ProfitAndLossRead)
def get_profit_and_loss(
    entity_id: uuid.UUID,
    from_date: date = Query(..., alias="from"),
    to_date: date = Query(..., alias="to"),
    # A closed month serves the figures it was sealed with; pass view=live to
    # see how the books read today.
    view: str = Query(financial_statements.VIEW_AS_CLOSED, pattern="^(as_closed|live)$"),
    session: Session = Depends(get_session),
    _: None = Depends(financial_reports_guard),
) -> ProfitAndLossRead:
    try:
        return financial_statements.get_profit_and_loss(
            session, entity_id, from_date, to_date, view=view
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
    _: None = Depends(financial_reports_guard), _export: None = Depends(export_scope_guard),
) -> StreamingResponse:
    try:
        report = financial_statements.get_profit_and_loss(
            session, entity_id, from_date, to_date
        )
        data = excel_export.build_profit_and_loss_xlsx(report)
        filename = excel_export.export_filename(
            "profit-and-loss",
            entity_name=_entity_name_for_export(session, entity_id),
            from_date=from_date,
            to_date=to_date,
        )
        return excel_export.xlsx_response(data, filename)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except InvalidDateRangeError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.get("/profit-and-loss/export/pdf")
def export_profit_and_loss_pdf(
    entity_id: uuid.UUID,
    from_date: date = Query(..., alias="from"),
    to_date: date = Query(..., alias="to"),
    session: Session = Depends(get_session),
    _: None = Depends(financial_reports_guard), _export: None = Depends(export_scope_guard),
) -> StreamingResponse:
    try:
        entity_name = _entity_name_for_export(session, entity_id)
        report = financial_statements.get_profit_and_loss(
            session, entity_id, from_date, to_date
        )
        data = pdf_export.build_profit_and_loss_pdf(report, entity_name)
        filename = pdf_export.pdf_export_filename(
            "profit-and-loss",
            entity_name=_entity_name_for_export(session, entity_id),
            from_date=from_date,
            to_date=to_date,
        )
        return pdf_export.pdf_response(data, filename)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except InvalidDateRangeError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.get("/month-pack")
def download_month_pack(
    entity_id: uuid.UUID,
    from_date: date = Query(..., alias="from"),
    to_date: date = Query(..., alias="to"),
    session: Session = Depends(get_session),
    _: None = Depends(financial_reports_guard), _export: None = Depends(export_scope_guard),
) -> StreamingResponse:
    """Every book for the period in one workbook — the file you send partners."""
    if to_date < from_date:
        raise HTTPException(status_code=422, detail="to must be on or after from")
    try:
        data, ctx = month_pack.build_month_pack_xlsx(
            session, entity_id, from_date, to_date
        )
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return excel_export.xlsx_response(data, month_pack.month_pack_filename(ctx))


@router.get("/month-pack/export/pdf")
def download_month_pack_pdf(
    entity_id: uuid.UUID,
    from_date: date = Query(..., alias="from"),
    to_date: date = Query(..., alias="to"),
    session: Session = Depends(get_session),
    _: None = Depends(financial_reports_guard), _export: None = Depends(export_scope_guard),
) -> StreamingResponse:
    """Every book for the period as a readable PDF — partner copy."""
    if to_date < from_date:
        raise HTTPException(status_code=422, detail="to must be on or after from")
    try:
        data, ctx = month_pack.build_month_pack_pdf(
            session, entity_id, from_date, to_date
        )
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except pdf_export.PdfExportDependencyError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    return pdf_export.pdf_response(data, month_pack.month_pack_pdf_filename(ctx))


@router.get("/balance-sheet", response_model=BalanceSheetRead)
def get_balance_sheet(
    entity_id: uuid.UUID,
    as_of: date = Query(...),
    view: str = Query(financial_statements.VIEW_AS_CLOSED, pattern="^(as_closed|live)$"),
    session: Session = Depends(get_session),
    _: None = Depends(financial_reports_guard),
) -> BalanceSheetRead:
    try:
        return financial_statements.get_balance_sheet(
            session, entity_id, as_of, view=view
        )
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("/balance-sheet/export")
def export_balance_sheet(
    entity_id: uuid.UUID,
    as_of: date = Query(...),
    session: Session = Depends(get_session),
    _: None = Depends(financial_reports_guard), _export: None = Depends(export_scope_guard),
) -> StreamingResponse:
    try:
        report = financial_statements.get_balance_sheet(session, entity_id, as_of)
        data = excel_export.build_balance_sheet_xlsx(report)
        filename = excel_export.export_filename(
            "balance-sheet",
            entity_name=_entity_name_for_export(session, entity_id),
            as_of=as_of,
        )
        return excel_export.xlsx_response(data, filename)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("/balance-sheet/export/pdf")
def export_balance_sheet_pdf(
    entity_id: uuid.UUID,
    as_of: date = Query(...),
    session: Session = Depends(get_session),
    _: None = Depends(financial_reports_guard), _export: None = Depends(export_scope_guard),
) -> StreamingResponse:
    try:
        entity_name = _entity_name_for_export(session, entity_id)
        report = financial_statements.get_balance_sheet(session, entity_id, as_of)
        data = pdf_export.build_balance_sheet_pdf(report, entity_name)
        filename = pdf_export.pdf_export_filename(
            "balance-sheet",
            entity_name=_entity_name_for_export(session, entity_id),
            as_of=as_of,
        )
        return pdf_export.pdf_response(data, filename)
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
    _: None = Depends(financial_reports_guard), _export: None = Depends(export_scope_guard),
) -> StreamingResponse:
    try:
        report = cash_flow.get_cash_flow(session, entity_id, from_date, to_date)
        data = excel_export.build_cash_flow_xlsx(report)
        filename = excel_export.export_filename(
            "cash-flow",
            entity_name=_entity_name_for_export(session, entity_id),
            from_date=from_date,
            to_date=to_date,
        )
        return excel_export.xlsx_response(data, filename)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except InvalidDateRangeError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.get("/cash-flow/export/pdf")
def export_cash_flow_pdf(
    entity_id: uuid.UUID,
    from_date: date = Query(..., alias="from"),
    to_date: date = Query(..., alias="to"),
    session: Session = Depends(get_session),
    _: None = Depends(financial_reports_guard), _export: None = Depends(export_scope_guard),
) -> StreamingResponse:
    try:
        entity_name = _entity_name_for_export(session, entity_id)
        report = cash_flow.get_cash_flow(session, entity_id, from_date, to_date)
        data = pdf_export.build_cash_flow_pdf(report, entity_name)
        filename = pdf_export.pdf_export_filename(
            "cash-flow",
            entity_name=_entity_name_for_export(session, entity_id),
            from_date=from_date,
            to_date=to_date,
        )
        return pdf_export.pdf_response(data, filename)
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
    _: None = Depends(reports_read_guard), _export: None = Depends(export_scope_guard),
) -> StreamingResponse:
    try:
        report = kdv_input.get_kdv_input_report(
            session, entity_id, from_date, to_date
        )
        data = excel_export.build_kdv_input_xlsx(report)
        filename = excel_export.export_filename(
            "kdv-input",
            entity_name=_entity_name_for_export(session, entity_id),
            from_date=from_date,
            to_date=to_date,
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
    _: None = Depends(financial_reports_guard), _export: None = Depends(export_scope_guard),
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
            "period-comparison",
            entity_name=_entity_name_for_export(session, entity_id),
            from_date=from_date,
            to_date=to_date,
        )
        return excel_export.xlsx_response(data, filename)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except InvalidDateRangeError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
