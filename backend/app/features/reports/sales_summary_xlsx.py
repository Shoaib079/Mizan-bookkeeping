"""Excel builder for the sales-summary report (split from excel_export)."""

from __future__ import annotations

from app.core.dates import format_period
from app.core.excel.workbook import (
    create_workbook,
    finish_data_table,
    money_header,
    save_workbook_to_bytes,
    write_header_row,
    write_money,
    write_sheet_title,
)
from app.features.reports.schema import SalesSummaryRead


def build_sales_summary_xlsx(report: SalesSummaryRead) -> bytes:
    wb, ws = create_workbook("Sales Summary")
    header_row = write_sheet_title(
        ws,
        "Sales Summary",
        subtitles=[
            f"Entity: {report.entity_id}",
            f"Selected: {format_period(report.current.from_date, report.current.to_date)}",
            f"Prior (full month): {format_period(report.prior.from_date, report.prior.to_date)}",
        ],
        end_col=3,
    )

    data_start = write_header_row(
        ws,
        header_row,
        [
            "Metric",
            money_header("Selected"),
            money_header("Prior full month"),
        ],
    )
    rows = [
        ("Cash", report.current.cash_kurus, report.prior.cash_kurus),
        ("Card", report.current.card_kurus, report.prior.card_kurus),
    ]
    if report.delivery_enabled:
        rows.append(
            (
                "Delivery",
                report.current.delivery_kurus,
                report.prior.delivery_kurus,
            )
        )
    rows.append(
        ("Total", report.current.total_kurus, report.prior.total_kurus)
    )
    row = data_start
    for label, current, prior in rows:
        ws.cell(row=row, column=1, value=label)
        write_money(ws, row, 2, current)
        write_money(ws, row, 3, prior)
        row += 1

    finish_data_table(
        ws,
        header_row=header_row,
        last_data_row=max(row - 1, data_start),
        end_col=3,
        money_cols=(2, 3),
    )
    return save_workbook_to_bytes(wb)
