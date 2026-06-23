"""Excel builders for Phase 7 read-only reports."""

from __future__ import annotations

import uuid
from datetime import date

from fastapi.responses import StreamingResponse
from io import BytesIO

from app.core.excel.workbook import (
    autosize_columns,
    bold_row,
    create_workbook,
    format_kurus_label,
    save_workbook_to_bytes,
)
from app.features.reports.schema import (
    BalanceSheetRead,
    CashFlowRead,
    DeliverySalesReportRead,
    KdvInputReportRead,
    PeriodComparisonRead,
    ProfitAndLossRead,
)

XLSX_CONTENT_TYPE = (
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
)


def xlsx_response(data: bytes, filename: str) -> StreamingResponse:
    return StreamingResponse(
        BytesIO(data),
        media_type=XLSX_CONTENT_TYPE,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


def _write_metadata(
    ws,
    *,
    title: str,
    entity_id: uuid.UUID,
    date_label: str,
    date_value: str,
) -> int:
    ws.cell(row=1, column=1, value=title)
    ws.cell(row=2, column=1, value=f"Entity: {entity_id}")
    ws.cell(row=2, column=2, value=f"{date_label}: {date_value}")
    return 3


def build_profit_and_loss_xlsx(report: ProfitAndLossRead) -> bytes:
    wb, ws = create_workbook("Profit and Loss")
    header_row = _write_metadata(
        ws,
        title="Profit and Loss",
        entity_id=report.entity_id,
        date_label="Period",
        date_value=f"{report.from_date} to {report.to_date}",
    )
    amount_label = format_kurus_label()
    headers = ["Code", "Name", "Type", amount_label]
    for col, header in enumerate(headers, start=1):
        ws.cell(row=header_row, column=col, value=header)
    bold_row(ws, header_row, end_col=len(headers))

    row = header_row + 1
    for account in report.accounts:
        ws.cell(row=row, column=1, value=account.code)
        ws.cell(row=row, column=2, value=account.name_en)
        ws.cell(row=row, column=3, value=account.account_type.value)
        ws.cell(row=row, column=4, value=account.amount_kurus)
        row += 1

    row += 1
    ws.cell(row=row, column=1, value="TOTAL REVENUE")
    ws.cell(row=row, column=4, value=report.total_revenue_kurus)
    row += 1
    ws.cell(row=row, column=1, value="TOTAL EXPENSES")
    ws.cell(row=row, column=4, value=report.total_expenses_kurus)
    row += 1
    ws.cell(row=row, column=1, value="NET INCOME")
    ws.cell(row=row, column=4, value=report.net_income_kurus)
    bold_row(ws, row - 2, end_col=4)
    bold_row(ws, row - 1, end_col=4)
    bold_row(ws, row, end_col=4)

    autosize_columns(ws)
    return save_workbook_to_bytes(wb)


def _write_balance_sheet_section(
    ws,
    row: int,
    section_name: str,
    accounts,
    subtotal_kurus: int,
    *,
    extra_label: str | None = None,
    extra_kurus: int | None = None,
) -> int:
    ws.cell(row=row, column=1, value=section_name)
    bold_row(ws, row, end_col=4)
    row += 1

    amount_label = format_kurus_label("Balance")
    for col, header in enumerate(["Code", "Name", "Type", amount_label], start=1):
        ws.cell(row=row, column=col, value=header)
    bold_row(ws, row, end_col=4)
    row += 1

    for account in accounts:
        ws.cell(row=row, column=1, value=account.code)
        ws.cell(row=row, column=2, value=account.name_en)
        ws.cell(row=row, column=3, value=account.account_type.value)
        ws.cell(row=row, column=4, value=account.balance_kurus)
        row += 1

    if extra_label is not None and extra_kurus is not None:
        ws.cell(row=row, column=1, value=extra_label)
        ws.cell(row=row, column=4, value=extra_kurus)
        row += 1

    ws.cell(row=row, column=1, value=f"{section_name} subtotal")
    ws.cell(row=row, column=4, value=subtotal_kurus)
    bold_row(ws, row, end_col=4)
    return row + 2


def build_balance_sheet_xlsx(report: BalanceSheetRead) -> bytes:
    wb, ws = create_workbook("Balance Sheet")
    row = _write_metadata(
        ws,
        title="Balance Sheet",
        entity_id=report.entity_id,
        date_label="As of",
        date_value=str(report.as_of),
    )

    row = _write_balance_sheet_section(
        ws,
        row,
        "Assets",
        report.assets.accounts,
        report.assets.subtotal_kurus,
    )
    row = _write_balance_sheet_section(
        ws,
        row,
        "Liabilities",
        report.liabilities.accounts,
        report.liabilities.subtotal_kurus,
    )
    row = _write_balance_sheet_section(
        ws,
        row,
        "Equity",
        report.equity.accounts,
        report.equity.subtotal_kurus,
        extra_label="Unclosed net income",
        extra_kurus=report.equity.unclosed_net_income_kurus,
    )

    ws.cell(row=row, column=1, value="Total assets")
    ws.cell(row=row, column=4, value=report.total_assets_kurus)
    row += 1
    ws.cell(row=row, column=1, value="Total liabilities and equity")
    ws.cell(row=row, column=4, value=report.total_liabilities_and_equity_kurus)
    row += 1
    ws.cell(
        row=row,
        column=1,
        value="Accounting equation balanced",
    )
    ws.cell(row=row, column=2, value=report.accounting_equation_balanced)
    bold_row(ws, row - 2, end_col=4)
    bold_row(ws, row - 1, end_col=4)

    autosize_columns(ws)
    return save_workbook_to_bytes(wb)


def build_cash_flow_xlsx(report: CashFlowRead) -> bytes:
    wb, ws = create_workbook("Cash Flow")
    row = _write_metadata(
        ws,
        title="Cash Flow Statement",
        entity_id=report.entity_id,
        date_label="Period",
        date_value=f"{report.from_date} to {report.to_date}",
    )

    summary_headers = ["Metric", format_kurus_label()]
    for col, header in enumerate(summary_headers, start=1):
        ws.cell(row=row, column=col, value=header)
    bold_row(ws, row, end_col=2)
    row += 1

    summary_rows = [
        ("Opening cash", report.opening_cash_kurus),
        ("Closing cash", report.closing_cash_kurus),
        ("Net change", report.net_change_kurus),
        ("Operating — inflows", report.operating.inflows_kurus),
        ("Operating — outflows", report.operating.outflows_kurus),
        ("Operating — net", report.operating.net_kurus),
        ("Investing — inflows", report.investing.inflows_kurus),
        ("Investing — outflows", report.investing.outflows_kurus),
        ("Investing — net", report.investing.net_kurus),
        ("Financing — inflows", report.financing.inflows_kurus),
        ("Financing — outflows", report.financing.outflows_kurus),
        ("Financing — net", report.financing.net_kurus),
    ]
    for label, value in summary_rows:
        ws.cell(row=row, column=1, value=label)
        ws.cell(row=row, column=2, value=value)
        row += 1

    row += 1
    source_headers = ["Source", "Category", format_kurus_label("Net cash")]
    for col, header in enumerate(source_headers, start=1):
        ws.cell(row=row, column=col, value=header)
    bold_row(ws, row, end_col=3)
    row += 1

    for source_row in report.by_source:
        ws.cell(row=row, column=1, value=source_row.source)
        ws.cell(row=row, column=2, value=source_row.category)
        ws.cell(row=row, column=3, value=source_row.net_cash_kurus)
        row += 1

    autosize_columns(ws)
    return save_workbook_to_bytes(wb)


def build_kdv_input_xlsx(report: KdvInputReportRead) -> bytes:
    wb, ws = create_workbook("KDV Input")
    row = _write_metadata(
        ws,
        title="KDV Input Report",
        entity_id=report.entity_id,
        date_label="Period",
        date_value=f"{report.from_date} to {report.to_date}",
    )

    headers = [
        "Rate (%)",
        format_kurus_label("Base"),
        format_kurus_label("VAT"),
        "Invoice count",
    ]
    for col, header in enumerate(headers, start=1):
        ws.cell(row=row, column=col, value=header)
    bold_row(ws, row, end_col=len(headers))
    row += 1

    for rate_row in report.rates:
        ws.cell(row=row, column=1, value=rate_row.rate_percent)
        ws.cell(row=row, column=2, value=rate_row.base_kurus)
        ws.cell(row=row, column=3, value=rate_row.vat_kurus)
        ws.cell(row=row, column=4, value=rate_row.invoice_count)
        row += 1

    row += 1
    ws.cell(row=row, column=1, value="TOTAL")
    ws.cell(row=row, column=2, value=report.total_base_kurus)
    ws.cell(row=row, column=3, value=report.total_vat_kurus)
    ws.cell(row=row, column=4, value=report.invoice_count)
    bold_row(ws, row, end_col=4)

    autosize_columns(ws)
    return save_workbook_to_bytes(wb)


def build_delivery_sales_xlsx(report: DeliverySalesReportRead) -> bytes:
    wb, ws = create_workbook("Delivery Sales")
    row = _write_metadata(
        ws,
        title="Delivery Sales Report",
        entity_id=report.entity_id,
        date_label="Period",
        date_value=f"{report.from_date} to {report.to_date}",
    )

    headers = [
        "Platform",
        "Active",
        format_kurus_label("Gross"),
        "Report count",
    ]
    for col, header in enumerate(headers, start=1):
        ws.cell(row=row, column=col, value=header)
    bold_row(ws, row, end_col=len(headers))
    row += 1

    for platform in report.platforms:
        ws.cell(row=row, column=1, value=platform.platform_name)
        ws.cell(row=row, column=2, value=platform.is_active)
        ws.cell(row=row, column=3, value=platform.gross_kurus)
        ws.cell(row=row, column=4, value=platform.report_count)
        row += 1

    row += 1
    ws.cell(row=row, column=1, value="TOTAL")
    ws.cell(row=row, column=3, value=report.total_gross_kurus)
    bold_row(ws, row, end_col=4)

    autosize_columns(ws)
    return save_workbook_to_bytes(wb)


def build_period_comparison_xlsx(report: PeriodComparisonRead) -> bytes:
    wb, ws = create_workbook("Period Comparison")
    row = _write_metadata(
        ws,
        title="Period Comparison",
        entity_id=report.entity_id,
        date_label="Current period",
        date_value=f"{report.current_from} to {report.current_to}",
    )
    ws.cell(row=2, column=3, value="Prior period")
    ws.cell(
        row=2,
        column=4,
        value=f"{report.prior_from} to {report.prior_to}",
    )

    headers = [
        "Metric",
        format_kurus_label("Current"),
        format_kurus_label("Prior"),
        format_kurus_label("Change"),
        "Change (%)",
    ]
    for col, header in enumerate(headers, start=1):
        ws.cell(row=row, column=col, value=header)
    bold_row(ws, row, end_col=len(headers))
    row += 1

    for metric in report.metrics:
        ws.cell(row=row, column=1, value=metric.label)
        ws.cell(row=row, column=2, value=metric.current_kurus)
        ws.cell(row=row, column=3, value=metric.prior_kurus)
        ws.cell(row=row, column=4, value=metric.change_kurus)
        ws.cell(
            row=row,
            column=5,
            value=metric.change_percent if metric.change_percent is not None else "",
        )
        row += 1

    autosize_columns(ws)
    return save_workbook_to_bytes(wb)


def export_filename(
    report_slug: str,
    *,
    from_date: date | None = None,
    to_date: date | None = None,
    as_of: date | None = None,
    extension: str = ".xlsx",
) -> str:
    if as_of is not None:
        return f"mizan-{report_slug}-{as_of}{extension}"
    assert from_date is not None and to_date is not None
    return f"mizan-{report_slug}-{from_date}-{to_date}{extension}"
