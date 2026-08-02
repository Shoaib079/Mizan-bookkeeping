"""Excel builders for Phase 7 read-only reports."""

from __future__ import annotations

import uuid
from datetime import date

from fastapi.responses import StreamingResponse
from io import BytesIO

from app.core.excel.labels import format_journal_source
from app.core.excel.workbook import (
    bold_row,
    create_workbook,
    finish_data_table,
    fit_columns_from_content,
    money_header,
    write_header_row,
    write_money,
    write_sheet_title,
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
    end_col: int = 4,
    entity_label: str | None = None,
) -> int:
    """Title block; returns the header row index (caller writes headers there)."""
    next_row = write_sheet_title(
        ws,
        title,
        subtitles=[
            f"Entity: {entity_label if entity_label is not None else entity_id}",
            f"{date_label}: {date_value}",
        ],
        end_col=end_col,
    )
    return next_row


def write_profit_and_loss_sheet(
    ws, report: ProfitAndLossRead, *, entity_label: str | None = None
) -> None:
    """Lay out a P&L on the given worksheet.

    Shared by the standalone export and the month pack so the two can never
    drift into showing the same period differently.
    """
    label = entity_label if entity_label is not None else str(report.entity_id)
    header_row = _write_metadata(
        ws,
        title="Profit and Loss",
        entity_id=report.entity_id,
        date_label="Period",
        date_value=f"{report.from_date} to {report.to_date}",
        end_col=4,
        entity_label=label,
    )
    amount_label = money_header()
    data_start = write_header_row(
        ws, header_row, ["Code", "Name", "Type", amount_label]
    )

    row = data_start
    for account in report.accounts:
        ws.cell(row=row, column=1, value=account.code)
        ws.cell(row=row, column=2, value=account.name_en)
        ws.cell(row=row, column=3, value=account.account_type.value)
        write_money(ws, row, 4, account.amount_kurus)
        row += 1

    row += 1
    ws.cell(row=row, column=1, value="TOTAL REVENUE")
    write_money(ws, row, 4, report.total_revenue_kurus)
    row += 1
    ws.cell(row=row, column=1, value="TOTAL EXPENSES")
    write_money(ws, row, 4, report.total_expenses_kurus)
    row += 1
    ws.cell(row=row, column=1, value="NET INCOME")
    write_money(ws, row, 4, report.net_income_kurus)
    bold_row(ws, row - 2, end_col=4)
    bold_row(ws, row - 1, end_col=4)
    bold_row(ws, row, end_col=4)

    finish_data_table(
        ws,
        header_row=header_row,
        last_data_row=row,
        end_col=4,
        money_cols=(4,),
    )
    fit_columns_from_content(
        ws,
        first_row=header_row,
        last_row=row,
        last_col=4,
        min_widths={1: 10, 2: 28, 3: 14, 4: 16},
        max_widths={1: 12, 2: 52, 3: 18, 4: 18},
        wrap_cols=(2,),
    )


def build_profit_and_loss_xlsx(report: ProfitAndLossRead) -> bytes:
    wb, ws = create_workbook("Profit and Loss")
    write_profit_and_loss_sheet(ws, report)
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

    amount_label = money_header("Balance")
    row = write_header_row(ws, row, ["Code", "Name", "Type", amount_label])

    for account in accounts:
        ws.cell(row=row, column=1, value=account.code)
        ws.cell(row=row, column=2, value=account.name_en)
        ws.cell(row=row, column=3, value=account.account_type.value)
        write_money(ws, row, 4, account.balance_kurus)
        row += 1

    if extra_label is not None and extra_kurus is not None:
        ws.cell(row=row, column=1, value=extra_label)
        write_money(ws, row, 4, extra_kurus)
        row += 1

    ws.cell(row=row, column=1, value=f"{section_name} subtotal")
    write_money(ws, row, 4, subtotal_kurus)
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
        end_col=4,
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
    write_money(ws, row, 4, report.total_assets_kurus)
    row += 1
    ws.cell(row=row, column=1, value="Total liabilities and equity")
    write_money(ws, row, 4, report.total_liabilities_and_equity_kurus)
    row += 1
    ws.cell(
        row=row,
        column=1,
        value="Accounting equation balanced",
    )
    ws.cell(row=row, column=2, value=report.accounting_equation_balanced)
    bold_row(ws, row - 2, end_col=4)
    bold_row(ws, row - 1, end_col=4)

    finish_data_table(
        ws, header_row=row, last_data_row=row, end_col=4, autofilter=False
    )
    return save_workbook_to_bytes(wb)


def build_cash_flow_xlsx(report: CashFlowRead) -> bytes:
    wb, ws = create_workbook("Cash Flow")
    header_row = _write_metadata(
        ws,
        title="Cash Flow Statement",
        entity_id=report.entity_id,
        date_label="Period",
        date_value=f"{report.from_date} to {report.to_date}",
        end_col=3,
    )

    data_start = write_header_row(ws, header_row, ["Metric", money_header()])
    row = data_start

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
        write_money(ws, row, 2, value)
        row += 1

    row += 1
    src_header = row
    row = write_header_row(
        ws, src_header, ["Source", "Category", money_header("Net cash")]
    )

    for source_row in report.by_source:
        ws.cell(row=row, column=1, value=format_journal_source(source_row.source))
        ws.cell(row=row, column=2, value=source_row.category)
        write_money(ws, row, 3, source_row.net_cash_kurus)
        row += 1

    finish_data_table(
        ws,
        header_row=header_row,
        last_data_row=max(row - 1, data_start),
        end_col=3,
    )
    return save_workbook_to_bytes(wb)


def build_kdv_input_xlsx(report: KdvInputReportRead) -> bytes:
    wb, ws = create_workbook("KDV Input")
    header_row = _write_metadata(
        ws,
        title="KDV Input Report",
        entity_id=report.entity_id,
        date_label="Period",
        date_value=f"{report.from_date} to {report.to_date}",
        end_col=4,
    )

    data_start = write_header_row(
        ws,
        header_row,
        [
            "Rate (%)",
            money_header("Base"),
            money_header("VAT"),
            "Invoice count",
        ],
    )
    row = data_start

    for rate_row in report.rates:
        ws.cell(row=row, column=1, value=rate_row.rate_percent)
        write_money(ws, row, 2, rate_row.base_kurus)
        write_money(ws, row, 3, rate_row.vat_kurus)
        ws.cell(row=row, column=4, value=rate_row.invoice_count)
        row += 1

    row += 1
    ws.cell(row=row, column=1, value="TOTAL")
    write_money(ws, row, 2, report.total_base_kurus)
    write_money(ws, row, 3, report.total_vat_kurus)
    ws.cell(row=row, column=4, value=report.invoice_count)
    bold_row(ws, row, end_col=4)

    finish_data_table(
        ws, header_row=header_row, last_data_row=row, end_col=4
    )
    return save_workbook_to_bytes(wb)


def build_delivery_sales_xlsx(report: DeliverySalesReportRead) -> bytes:
    wb, ws = create_workbook("Delivery Sales")
    header_row = _write_metadata(
        ws,
        title="Delivery Sales Report",
        entity_id=report.entity_id,
        date_label="Period",
        date_value=f"{report.from_date} to {report.to_date}",
        end_col=4,
    )

    data_start = write_header_row(
        ws,
        header_row,
        [
            "Platform",
            "Active",
            money_header("Gross"),
            "Report count",
        ],
    )
    row = data_start

    for platform in report.platforms:
        ws.cell(row=row, column=1, value=platform.platform_name)
        ws.cell(row=row, column=2, value=platform.is_active)
        write_money(ws, row, 3, platform.gross_kurus)
        ws.cell(row=row, column=4, value=platform.report_count)
        row += 1

    row += 1
    ws.cell(row=row, column=1, value="TOTAL")
    write_money(ws, row, 3, report.total_gross_kurus)
    bold_row(ws, row, end_col=4)

    finish_data_table(
        ws, header_row=header_row, last_data_row=row, end_col=4
    )
    return save_workbook_to_bytes(wb)


def build_period_comparison_xlsx(report: PeriodComparisonRead) -> bytes:
    wb, ws = create_workbook("Period Comparison")
    header_row = _write_metadata(
        ws,
        title="Period Comparison",
        entity_id=report.entity_id,
        date_label="Current period",
        date_value=f"{report.current_from} to {report.current_to}",
        end_col=5,
    )
    ws.cell(row=2, column=3, value="Prior period")
    ws.cell(
        row=2,
        column=4,
        value=f"{report.prior_from} to {report.prior_to}",
    )

    data_start = write_header_row(
        ws,
        header_row,
        [
            "Metric",
            money_header("Current"),
            money_header("Prior"),
            money_header("Change"),
            "Change (%)",
        ],
    )
    row = data_start

    for metric in report.metrics:
        ws.cell(row=row, column=1, value=metric.label)
        write_money(ws, row, 2, metric.current_kurus)
        write_money(ws, row, 3, metric.prior_kurus)
        write_money(ws, row, 4, metric.change_kurus)
        ws.cell(
            row=row,
            column=5,
            value=metric.change_percent if metric.change_percent is not None else "",
        )
        row += 1

    finish_data_table(
        ws, header_row=header_row, last_data_row=max(row - 1, data_start), end_col=5
    )
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
